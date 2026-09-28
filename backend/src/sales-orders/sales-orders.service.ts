import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildPageMeta, resolvePaging } from '../common/utils/paging.util';
import { CreateSalesOrderDto, SalesOrderItemDto } from './dto/create-sales-order.dto';
import { UpdateSalesOrderDto } from './dto/update-sales-order.dto';
import { UpdateSalesOrderStatusDto } from './dto/sales-order-status.dto';
import { SalesOrderQueryDto } from './dto/sales-order-query.dto';
import { InvoiceStatus, SOStatus, StockMovementType } from '@prisma/client';
import { resolveSort } from '../common/utils/sort.util';
import { nextSequentialCode } from '../common/utils/sequence.util';
import { isUniqueViolation, withUniqueRetry } from '../common/utils/unique.util';
import { assertValidOrderItems } from '../common/utils/items.util';

const SORTABLE_FIELDS = ['createdAt', 'updatedAt', 'soNumber', 'status', 'totalAmount'] as const;

/**
 * Whitelist transisi status SO + role yang berhak (RBAC per transisi).
 * Keputusan Fase 4:
 * - Dibuat langsung PENDING (tidak ada DRAFT); item hanya bisa diedit di PENDING.
 * - ALLOCATED = potong stok atomic (anti negative-stock) + StockMovement OUT.
 * - INVOICED = buat record Invoice UNPAID (jatuh tempo +30 hari); PDF/payment Fase 5.
 * - CANCELLED hanya dari PENDING — setelah stok bergerak (ALLOCATED) dilarang;
 *   koreksi lewat mekanisme resmi (adjustment).
 */
const SO_TRANSITIONS: Array<{ from: SOStatus; to: SOStatus; roles: string[] }> = [
  { from: SOStatus.PENDING, to: SOStatus.ALLOCATED, roles: ['SUPER_ADMIN', 'SALES_SPECIALIST'] },
  { from: SOStatus.PENDING, to: SOStatus.CANCELLED, roles: ['SUPER_ADMIN', 'SALES_SPECIALIST'] },
  { from: SOStatus.ALLOCATED, to: SOStatus.INVOICED, roles: ['SUPER_ADMIN', 'SALES_SPECIALIST'] },
  { from: SOStatus.INVOICED, to: SOStatus.COMPLETED, roles: ['SUPER_ADMIN', 'SALES_SPECIALIST'] },
];

@Injectable()
export class SalesOrdersService {
  constructor(private prisma: PrismaService) {}

  private async generateSoNumber(): Promise<string> {
    const now = new Date();
    const prefix = `SO-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;
    // Nomor TERBESAR + 1 (bukan count + 1), konsisten dengan SKU/WH/TRF/PO.
    return nextSequentialCode(this.prisma.salesOrder, { prefix, field: 'soNumber', padding: 4 });
  }

  private async generateInvoiceNumber(): Promise<string> {
    const now = new Date();
    const prefix = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;
    return nextSequentialCode(this.prisma.invoice, {
      prefix,
      field: 'invoiceNumber',
      padding: 4,
    });
  }

  async findAll(query: SalesOrderQueryDto) {
    const { page, limit, skip } = resolvePaging(query);
    const sort = resolveSort(query.sortBy, SORTABLE_FIELDS, 'createdAt', query.sortOrder);

    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.customerId) where.customerId = query.customerId;
    if (query.warehouseId) where.warehouseId = query.warehouseId;

    if (query.search) {
      where.OR = [
        { soNumber: { contains: query.search, mode: 'insensitive' } },
        { customer: { name: { contains: query.search, mode: 'insensitive' } } },
        { warehouse: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [items, totalItems] = await Promise.all([
      this.prisma.salesOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sort.field]: sort.order },
        include: {
          customer: { select: { id: true, name: true } },
          warehouse: { select: { id: true, code: true, name: true } },
          _count: { select: { items: true } },
          invoice: { select: { id: true, invoiceNumber: true, status: true, dueDate: true } },
        },
      }),
      this.prisma.salesOrder.count({ where }),
    ]);

    return {
      data: items,
      meta: buildPageMeta(page, limit, totalItems),
    };
  }

  async findOne(id: string) {
    const so = await this.prisma.salesOrder.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true } },
        warehouse: { select: { id: true, code: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, sku: true, name: true, unit: true } },
          },
        },
        invoice: true,
      },
    });
    if (!so) throw new NotFoundException('Sales Order tidak ditemukan');
    return so;
  }

  async create(dto: CreateSalesOrderDto, userId?: string, ip?: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customerId },
    });
    if (!customer) throw new NotFoundException('Pelanggan tidak ditemukan');

    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: dto.warehouseId },
    });
    if (!warehouse) throw new NotFoundException('Gudang tidak ditemukan');

    await assertValidOrderItems(this.prisma, dto.items);

    // totalAmount dihitung SERVER-SIDE (tidak dipercaya dari body request).
    const totalAmount = dto.items.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);

    try {
      // Anti-race (A4) + anti-P2028: nomor di-generate di LUAR transaksi;
      // setiap attempt retry membaca nomor terbesar terbaru.
      return await withUniqueRetry(async () => {
        const soNumber = await this.generateSoNumber();
        return this.prisma.$transaction(async (tx) => {
          const so = await tx.salesOrder.create({
            data: {
              soNumber,
              customerId: dto.customerId,
              warehouseId: dto.warehouseId,
              status: SOStatus.PENDING,
              totalAmount,
              items: {
                create: dto.items.map((item) => ({
                  productId: item.productId,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                })),
              },
            },
            include: {
              customer: { select: { id: true, name: true } },
              warehouse: { select: { id: true, code: true, name: true } },
              items: {
                include: {
                  product: { select: { id: true, sku: true, name: true, unit: true } },
                },
              },
              invoice: true,
            },
          });

          await tx.auditLog.create({
            data: {
              userId,
              action: 'CREATE',
              entity: 'SalesOrder',
              entityId: so.id,
              payload: { soNumber: so.soNumber, totalAmount, ip: ip || null },
            },
          });

          return so;
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'Terjadi bentrok nomor Sales Order saat pembuatan, silakan coba lagi',
        );
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateSalesOrderDto, userId?: string, ip?: string) {
    const so = await this.findOne(id);

    if (so.status !== SOStatus.PENDING) {
      throw new BadRequestException(
        `SO hanya dapat diubah saat status PENDING (saat ini: ${so.status})`,
      );
    }

    if (dto.customerId && dto.customerId !== so.customerId) {
      const customer = await this.prisma.customer.findUnique({
        where: { id: dto.customerId },
      });
      if (!customer) throw new NotFoundException('Pelanggan tidak ditemukan');
    }

    if (dto.warehouseId && dto.warehouseId !== so.warehouseId) {
      const warehouse = await this.prisma.warehouse.findUnique({
        where: { id: dto.warehouseId },
      });
      if (!warehouse) throw new NotFoundException('Gudang tidak ditemukan');
    }

    let itemsPayload: SalesOrderItemDto[] | undefined;
    if (dto.items) {
      await assertValidOrderItems(this.prisma, dto.items);
      itemsPayload = dto.items;
    }

    // Total dihitung ulang dari item final (server-side).
    const totalAmount = itemsPayload
      ? itemsPayload.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0)
      : Number(so.totalAmount);

    return withUniqueRetry(() =>
      this.prisma.$transaction(async (tx) => {
        // Optimistic lock: hanya baris berstatus PENDING yang boleh berubah —
        // menutup race "edit saat alokasi" yang berjalan bersamaan.
        const updated = await tx.salesOrder.updateMany({
          where: { id, status: SOStatus.PENDING },
          data: {
            ...(dto.customerId ? { customerId: dto.customerId } : {}),
            ...(dto.warehouseId ? { warehouseId: dto.warehouseId } : {}),
            totalAmount,
          },
        });
        if (updated.count === 0) {
          throw new ConflictException(
            'Status dokumen telah berubah oleh pengguna lain, silakan muat ulang halaman',
          );
        }

        if (itemsPayload) {
          await tx.salesOrder.update({
            where: { id },
            data: {
              items: {
                deleteMany: {},
                create: itemsPayload.map((item) => ({
                  productId: item.productId,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                })),
              },
            },
          });
        }

        await tx.auditLog.create({
          data: {
            userId,
            action: 'UPDATE',
            entity: 'SalesOrder',
            entityId: id,
            payload: {
              soNumber: so.soNumber,
              ...(dto.customerId ? { customerId: dto.customerId } : {}),
              ...(dto.warehouseId ? { warehouseId: dto.warehouseId } : {}),
              ...(itemsPayload ? { itemCount: itemsPayload.length, totalAmount } : {}),
              ip: ip || null,
            },
          },
        });

        return tx.salesOrder.findUnique({
          where: { id },
          include: {
            customer: { select: { id: true, name: true } },
            warehouse: { select: { id: true, code: true, name: true } },
            items: {
              include: {
                product: { select: { id: true, sku: true, name: true, unit: true } },
              },
            },
            invoice: true,
          },
        });
      }),
    );
  }

  async updateStatus(
    id: string,
    dto: UpdateSalesOrderStatusDto,
    userId: string,
    roleName: string,
    ip?: string,
  ) {
    const so = await this.findOne(id);
    const from = so.status;
    const to = dto.status;

    if (from === to) return so;

    const rule = SO_TRANSITIONS.find(
      (transition) => transition.from === from && transition.to === to,
    );
    if (!rule) {
      throw new BadRequestException(`Transisi status tidak diizinkan: ${from} → ${to}`);
    }
    if (!rule.roles.includes(roleName)) {
      throw new ForbiddenException(
        `Akses ditolak: transisi ${from} → ${to} membutuhkan role ${rule.roles.join(' atau ')}`,
      );
    }

    return withUniqueRetry(async () => {
      // Nomor invoice di-generate di LUAR transaksi (pola anti-P2028);
      // retry membaca nomor terbesar terbaru sehingga race aman.
      const invoiceNumber =
        to === SOStatus.INVOICED ? await this.generateInvoiceNumber() : undefined;

      return this.prisma.$transaction(async (tx) => {
        // Optimistic lock: hanya berhasil bila status masih `from` —
        // transisi ganda bersamaan saling menolak (potong stok tidak dobel).
        const flip = await tx.salesOrder.updateMany({
          where: { id, status: from },
          data: { status: to },
        });
        if (flip.count === 0) {
          throw new ConflictException(
            'Status dokumen telah berubah oleh pengguna lain, silakan muat ulang halaman',
          );
        }

        // ALLOCATED: potong stok ATOMIC (updateMany + kondisi quantity >= butuh)
        // bukan read-then-write — dua alokasi bersamaan tidak bisa membuat stok negatif.
        if (to === SOStatus.ALLOCATED) {
          // Baca ulang item DALAM transaksi agar tidak memakai hasil lama
          // bila ada edit PENDING yang baru saja ter-commit.
          const fresh = await tx.salesOrder.findUnique({
            where: { id },
            include: {
              customer: { select: { id: true, name: true } },
              warehouse: { select: { id: true, code: true, name: true } },
              items: {
                include: {
                  product: { select: { id: true, sku: true, name: true, unit: true } },
                },
              },
            },
          });
          if (!fresh) throw new NotFoundException('Sales Order tidak ditemukan');

          for (const item of fresh.items) {
            const affected = await tx.inventory.updateMany({
              where: {
                productId: item.productId,
                warehouseId: fresh.warehouseId,
                quantity: { gte: item.quantity },
              },
              data: { quantity: { decrement: item.quantity } },
            });

            if (affected.count === 0) {
              const inv = await tx.inventory.findUnique({
                where: {
                  productId_warehouseId: {
                    productId: item.productId,
                    warehouseId: fresh.warehouseId,
                  },
                },
              });
              const available = inv ? inv.quantity : 0;
              throw new ConflictException(
                `Stok produk "${item.product.name}" (${item.product.sku}) di gudang "${fresh.warehouse.name}" tidak mencukupi (tersedia: ${available} ${item.product.unit}, dibutuhkan: ${item.quantity} ${item.product.unit})`,
              );
            }

            // Record Movement OUT (stok sudah dipotong di atas).
            await tx.stockMovement.create({
              data: {
                productId: item.productId,
                warehouseId: fresh.warehouseId,
                type: StockMovementType.OUT,
                quantity: -item.quantity,
                referenceId: `SO ${fresh.soNumber} (Alokasi Penjualan ke ${fresh.customer.name})`,
              },
            });
          }
        }

        // INVOICED: record Invoice UNPAID dibuat otomatis (jatuh tempo +30 hari).
        if (to === SOStatus.INVOICED && invoiceNumber) {
          const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          await tx.invoice.create({
            data: {
              invoiceNumber,
              salesOrderId: id,
              status: InvoiceStatus.UNPAID,
              dueDate,
              totalAmount: so.totalAmount,
            },
          });
        }

        await tx.auditLog.create({
          data: {
            userId,
            action: 'UPDATE_SO_STATUS',
            entity: 'SalesOrder',
            entityId: id,
            payload: {
              soNumber: so.soNumber,
              oldStatus: from,
              newStatus: to,
              ...(invoiceNumber ? { invoiceNumber } : {}),
              ip: ip || null,
            },
          },
        });

        return tx.salesOrder.findUnique({
          where: { id },
          include: {
            customer: { select: { id: true, name: true } },
            warehouse: { select: { id: true, code: true, name: true } },
            items: {
              include: {
                product: { select: { id: true, sku: true, name: true, unit: true } },
              },
            },
            invoice: true,
          },
        });
      });
    });
  }
}
