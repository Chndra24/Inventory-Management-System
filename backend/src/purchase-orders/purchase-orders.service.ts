import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildPageMeta, resolvePaging } from '../common/utils/paging.util';
import { CreatePurchaseOrderDto, PurchaseOrderItemDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { UpdatePurchaseOrderStatusDto } from './dto/purchase-order-status.dto';
import { PurchaseOrderQueryDto } from './dto/purchase-order-query.dto';
import { POStatus, StockMovementType } from '@prisma/client';
import { resolveSort } from '../common/utils/sort.util';
import { nextSequentialCode } from '../common/utils/sequence.util';
import { isUniqueViolation, withUniqueRetry } from '../common/utils/unique.util';
import { assertValidOrderItems } from '../common/utils/items.util';

const SORTABLE_FIELDS = ['createdAt', 'updatedAt', 'poNumber', 'status', 'totalAmount'] as const;

/**
 * Whitelist transisi status PO + role yang berhak (RBAC per transisi).
 * Keputusan Fase 4:
 * - APPROVED hanya SUPER_ADMIN (separation of duties).
 * - Cancel hanya SEBELUM stok bergerak (PO RECEIVED = stok sudah masuk);
 *   APPROVED -> CANCELLED hanya SUPER_ADMIN.
 * - RECEIVED = full receiving: seluruh item masuk stok sekaligus (atomic).
 * - COMPLETED (tanda lunas ke pemasok) = FINANCE_OFFICER + SUPER_ADMIN.
 */
const PO_TRANSITIONS: Array<{ from: POStatus; to: POStatus; roles: string[] }> = [
  { from: POStatus.DRAFT, to: POStatus.PENDING, roles: ['SUPER_ADMIN', 'PURCHASING_OFFICER'] },
  { from: POStatus.PENDING, to: POStatus.DRAFT, roles: ['SUPER_ADMIN', 'PURCHASING_OFFICER'] },
  { from: POStatus.PENDING, to: POStatus.APPROVED, roles: ['SUPER_ADMIN'] },
  { from: POStatus.PENDING, to: POStatus.CANCELLED, roles: ['SUPER_ADMIN', 'PURCHASING_OFFICER'] },
  { from: POStatus.DRAFT, to: POStatus.CANCELLED, roles: ['SUPER_ADMIN', 'PURCHASING_OFFICER'] },
  { from: POStatus.APPROVED, to: POStatus.CANCELLED, roles: ['SUPER_ADMIN'] },
  { from: POStatus.APPROVED, to: POStatus.RECEIVED, roles: ['SUPER_ADMIN', 'PURCHASING_OFFICER'] },
  { from: POStatus.RECEIVED, to: POStatus.COMPLETED, roles: ['SUPER_ADMIN', 'FINANCE_OFFICER'] },
];

@Injectable()
export class PurchaseOrdersService {
  constructor(private prisma: PrismaService) {}

  private async generatePoNumber(): Promise<string> {
    const now = new Date();
    const prefix = `PO-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;
    // Nomor TERBESAR + 1 (bukan count + 1), konsisten dengan SKU/WH/TRF.
    return nextSequentialCode(this.prisma.purchaseOrder, {
      prefix,
      field: 'poNumber',
      padding: 4,
    });
  }

  async findAll(query: PurchaseOrderQueryDto) {
    const { page, limit, skip } = resolvePaging(query);
    const sort = resolveSort(query.sortBy, SORTABLE_FIELDS, 'createdAt', query.sortOrder);

    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.supplierId) where.supplierId = query.supplierId;
    if (query.warehouseId) where.warehouseId = query.warehouseId;

    if (query.search) {
      where.OR = [
        { poNumber: { contains: query.search, mode: 'insensitive' } },
        { supplier: { name: { contains: query.search, mode: 'insensitive' } } },
        { warehouse: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [items, totalItems] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sort.field]: sort.order },
        include: {
          supplier: { select: { id: true, name: true } },
          warehouse: { select: { id: true, code: true, name: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    return {
      data: items,
      meta: buildPageMeta(page, limit, totalItems),
    };
  }

  async findOne(id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, name: true } },
        warehouse: { select: { id: true, code: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, sku: true, name: true, unit: true } },
          },
        },
      },
    });
    if (!po) throw new NotFoundException('Purchase Order tidak ditemukan');
    return po;
  }

  async create(dto: CreatePurchaseOrderDto, userId?: string, ip?: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: dto.supplierId },
    });
    if (!supplier) throw new NotFoundException('Pemasok tidak ditemukan');

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
        const poNumber = await this.generatePoNumber();
        return this.prisma.$transaction(async (tx) => {
          const po = await tx.purchaseOrder.create({
            data: {
              poNumber,
              supplierId: dto.supplierId,
              warehouseId: dto.warehouseId,
              status: POStatus.DRAFT,
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
              supplier: { select: { id: true, name: true } },
              warehouse: { select: { id: true, code: true, name: true } },
              items: {
                include: {
                  product: { select: { id: true, sku: true, name: true, unit: true } },
                },
              },
            },
          });

          await tx.auditLog.create({
            data: {
              userId,
              action: 'CREATE',
              entity: 'PurchaseOrder',
              entityId: po.id,
              payload: { poNumber: po.poNumber, totalAmount, ip: ip || null },
            },
          });

          return po;
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'Terjadi bentrok nomor Purchase Order saat pembuatan, silakan coba lagi',
        );
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdatePurchaseOrderDto, userId?: string, ip?: string) {
    const po = await this.findOne(id);

    if (po.status !== POStatus.DRAFT) {
      throw new BadRequestException(
        `PO hanya dapat diubah saat status DRAFT (saat ini: ${po.status})`,
      );
    }

    if (dto.supplierId && dto.supplierId !== po.supplierId) {
      const supplier = await this.prisma.supplier.findUnique({
        where: { id: dto.supplierId },
      });
      if (!supplier) throw new NotFoundException('Pemasok tidak ditemukan');
    }

    if (dto.warehouseId && dto.warehouseId !== po.warehouseId) {
      const warehouse = await this.prisma.warehouse.findUnique({
        where: { id: dto.warehouseId },
      });
      if (!warehouse) throw new NotFoundException('Gudang tidak ditemukan');
    }

    let itemsPayload: PurchaseOrderItemDto[] | undefined;
    if (dto.items) {
      await assertValidOrderItems(this.prisma, dto.items);
      itemsPayload = dto.items;
    }

    // Total dihitung ulang dari item final (server-side).
    const totalAmount = itemsPayload
      ? itemsPayload.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0)
      : Number(po.totalAmount);

    return withUniqueRetry(() =>
      this.prisma.$transaction(async (tx) => {
        // Optimistic lock: hanya baris berstatus DRAFT yang boleh berubah —
        // menutup race "edit saat approve" yang berjalan bersamaan.
        const updated = await tx.purchaseOrder.updateMany({
          where: { id, status: POStatus.DRAFT },
          data: {
            ...(dto.supplierId ? { supplierId: dto.supplierId } : {}),
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
          await tx.purchaseOrder.update({
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
            entity: 'PurchaseOrder',
            entityId: id,
            payload: {
              poNumber: po.poNumber,
              ...(dto.supplierId ? { supplierId: dto.supplierId } : {}),
              ...(dto.warehouseId ? { warehouseId: dto.warehouseId } : {}),
              ...(itemsPayload ? { itemCount: itemsPayload.length, totalAmount } : {}),
              ip: ip || null,
            },
          },
        });

        return tx.purchaseOrder.findUnique({
          where: { id },
          include: {
            supplier: { select: { id: true, name: true } },
            warehouse: { select: { id: true, code: true, name: true } },
            items: {
              include: {
                product: { select: { id: true, sku: true, name: true, unit: true } },
              },
            },
          },
        });
      }),
    );
  }

  async updateStatus(
    id: string,
    dto: UpdatePurchaseOrderStatusDto,
    userId: string,
    roleName: string,
    ip?: string,
  ) {
    const po = await this.findOne(id);
    const from = po.status;
    const to = dto.status;

    if (from === to) return po;

    const rule = PO_TRANSITIONS.find(
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

    return withUniqueRetry(() =>
      this.prisma.$transaction(async (tx) => {
        // Optimistic lock: hanya berhasil bila status masih `from` —
        // transisi ganda bersamaan saling menolak (bukan stok dobel).
        const flip = await tx.purchaseOrder.updateMany({
          where: { id, status: from },
          data: { status: to },
        });
        if (flip.count === 0) {
          throw new ConflictException(
            'Status dokumen telah berubah oleh pengguna lain, silakan muat ulang halaman',
          );
        }

        // RECEIVED (full receiving): stok bertambah atomic + catat StockMovement IN.
        if (to === POStatus.RECEIVED) {
          for (const item of po.items) {
            await tx.inventory.upsert({
              where: {
                productId_warehouseId: {
                  productId: item.productId,
                  warehouseId: po.warehouseId,
                },
              },
              update: { quantity: { increment: item.quantity } },
              create: {
                productId: item.productId,
                warehouseId: po.warehouseId,
                quantity: item.quantity,
              },
            });

            await tx.stockMovement.create({
              data: {
                productId: item.productId,
                warehouseId: po.warehouseId,
                type: StockMovementType.IN,
                quantity: item.quantity,
                referenceId: `PO ${po.poNumber} (Penerimaan dari ${po.supplier.name})`,
              },
            });
          }
        }

        await tx.auditLog.create({
          data: {
            userId,
            action: 'UPDATE_PO_STATUS',
            entity: 'PurchaseOrder',
            entityId: id,
            payload: { poNumber: po.poNumber, oldStatus: from, newStatus: to, ip: ip || null },
          },
        });

        return tx.purchaseOrder.findUnique({
          where: { id },
          include: {
            supplier: { select: { id: true, name: true } },
            warehouse: { select: { id: true, code: true, name: true } },
            items: {
              include: {
                product: { select: { id: true, sku: true, name: true, unit: true } },
              },
            },
          },
        });
      }),
    );
  }
}
