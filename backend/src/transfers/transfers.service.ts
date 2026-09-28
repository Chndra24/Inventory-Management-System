import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildPageMeta, resolvePaging } from '../common/utils/paging.util';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { UpdateTransferStatusDto } from './dto/update-transfer-status.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { StockMovementType, TransferStatus } from '@prisma/client';
import { isUniqueViolation, withUniqueRetry } from '../common/utils/unique.util';
import { resolveSort } from '../common/utils/sort.util';
import { nextSequentialCode } from '../common/utils/sequence.util';

const SORTABLE_FIELDS = ['createdAt', 'updatedAt', 'transferNumber', 'status'] as const;

@Injectable()
export class TransfersService {
  constructor(private prisma: PrismaService) {}

  private async generateTransferNumber(): Promise<string> {
    const now = new Date();
    const prefix = `TRF-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;
    // Nomor TERBESAR + 1 (bukan count + 1) agar konsisten dengan SKU/WH.
    return nextSequentialCode(this.prisma.stockTransfer, {
      prefix,
      field: 'transferNumber',
      padding: 4,
    });
  }

  async findAll(
    query: PaginationQueryDto & {
      status?: TransferStatus;
      fromWarehouseId?: string;
      toWarehouseId?: string;
    },
  ) {
    const { page, limit, skip } = resolvePaging(query);
    const sort = resolveSort(query.sortBy, SORTABLE_FIELDS, 'createdAt', query.sortOrder);

    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.fromWarehouseId) where.fromWarehouseId = query.fromWarehouseId;
    if (query.toWarehouseId) where.toWarehouseId = query.toWarehouseId;

    if (query.search) {
      where.OR = [
        { transferNumber: { contains: query.search, mode: 'insensitive' } },
        { fromWarehouse: { name: { contains: query.search, mode: 'insensitive' } } },
        { toWarehouse: { name: { contains: query.search, mode: 'insensitive' } } },
        { notes: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, totalItems] = await Promise.all([
      this.prisma.stockTransfer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sort.field]: sort.order },
        include: {
          fromWarehouse: { select: { id: true, code: true, name: true } },
          toWarehouse: { select: { id: true, code: true, name: true } },
          createdBy: { select: { id: true, name: true, email: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.stockTransfer.count({ where }),
    ]);

    return {
      data: items,
      meta: buildPageMeta(page, limit, totalItems),
    };
  }

  async findOne(id: string) {
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id },
      include: {
        fromWarehouse: true,
        toWarehouse: true,
        createdBy: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            product: { select: { id: true, sku: true, name: true, unit: true } },
          },
        },
      },
    });
    if (!transfer) throw new NotFoundException('Dokumen transfer tidak ditemukan');
    return transfer;
  }

  async create(dto: CreateTransferDto, userId?: string, ip?: string) {
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new BadRequestException('Gudang asal dan gudang tujuan tidak boleh sama');
    }

    const fromWh = await this.prisma.warehouse.findUnique({ where: { id: dto.fromWarehouseId } });
    if (!fromWh) throw new NotFoundException('Gudang asal tidak ditemukan');

    const toWh = await this.prisma.warehouse.findUnique({ where: { id: dto.toWarehouseId } });
    if (!toWh) throw new NotFoundException('Gudang tujuan tidak ditemukan');

    try {
      // Anti-race (A4): generate nomor TRF di LUAR transaksi agar transaksi
      // lebih pendek; retry tetap meng-generate ulang tiap attempt (P2002/P2028).
      return await withUniqueRetry(async () => {
        const transferNumber = await this.generateTransferNumber();
        return this.prisma.$transaction(async (tx) => {
          const transfer = await tx.stockTransfer.create({
            data: {
              transferNumber,
              fromWarehouseId: dto.fromWarehouseId,
              toWarehouseId: dto.toWarehouseId,
              notes: dto.notes,
              createdById: userId,
              status: TransferStatus.DRAFT,
              items: {
                create: dto.items.map((item) => ({
                  productId: item.productId,
                  quantity: item.quantity,
                })),
              },
            },
            include: {
              fromWarehouse: true,
              toWarehouse: true,
              items: { include: { product: true } },
            },
          });

          await tx.auditLog.create({
            data: {
              userId,
              action: 'CREATE_TRANSFER',
              entity: 'StockTransfer',
              entityId: transfer.id,
              payload: {
                transferNumber: transfer.transferNumber,
                from: fromWh.name,
                to: toWh.name,
                ip: ip || null,
              },
            },
          });

          return transfer;
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Terjadi bentrok nomor transfer, silakan coba lagi');
      }
      throw error;
    }
  }

  async updateStatus(id: string, dto: UpdateTransferStatusDto, userId?: string, ip?: string) {
    const transfer = await this.findOne(id);
    const newStatus = dto.status;

    if (transfer.status === newStatus) {
      return transfer;
    }

    if (
      transfer.status === TransferStatus.RECEIVED ||
      transfer.status === TransferStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Status transfer yang sudah ${transfer.status} tidak dapat diubah lagi`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Transition to IN_TRANSIT (Deduct stock from fromWarehouse)
      if (newStatus === TransferStatus.IN_TRANSIT) {
        if (transfer.status !== TransferStatus.DRAFT) {
          throw new BadRequestException(
            'Transfer hanya bisa diubah ke IN_TRANSIT dari status DRAFT',
          );
        }

        for (const item of transfer.items) {
          const inv = await tx.inventory.findUnique({
            where: {
              productId_warehouseId: {
                productId: item.productId,
                warehouseId: transfer.fromWarehouseId,
              },
            },
          });

          const availableQty = inv ? inv.quantity : 0;
          if (availableQty < item.quantity) {
            throw new BadRequestException(
              `Stok produk "${item.product.name}" (${item.product.sku}) di gudang asal "${transfer.fromWarehouse.name}" kurang (${availableQty} ${item.product.unit} tersedia, dibutuhkan ${item.quantity} ${item.product.unit})`,
            );
          }

          // Deduct stock
          await tx.inventory.update({
            where: { id: inv!.id },
            data: { quantity: availableQty - item.quantity },
          });

          // Record Movement OUT
          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              warehouseId: transfer.fromWarehouseId,
              type: StockMovementType.TRANSFER,
              quantity: -item.quantity,
              referenceId: `Transfer ${transfer.transferNumber} (Kirim ke ${transfer.toWarehouse.name})`,
            },
          });
        }
      }

      // Transition to RECEIVED (Add stock to toWarehouse)
      if (newStatus === TransferStatus.RECEIVED) {
        if (transfer.status !== TransferStatus.IN_TRANSIT) {
          throw new BadRequestException(
            'Transfer hanya bisa diubah ke RECEIVED dari status IN_TRANSIT',
          );
        }

        for (const item of transfer.items) {
          const inv = await tx.inventory.findUnique({
            where: {
              productId_warehouseId: {
                productId: item.productId,
                warehouseId: transfer.toWarehouseId,
              },
            },
          });

          const currentQty = inv ? inv.quantity : 0;
          const newQty = currentQty + item.quantity;

          await tx.inventory.upsert({
            where: {
              productId_warehouseId: {
                productId: item.productId,
                warehouseId: transfer.toWarehouseId,
              },
            },
            update: { quantity: newQty },
            create: {
              productId: item.productId,
              warehouseId: transfer.toWarehouseId,
              quantity: newQty,
            },
          });

          // Record Movement IN
          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              warehouseId: transfer.toWarehouseId,
              type: StockMovementType.TRANSFER,
              quantity: item.quantity,
              referenceId: `Transfer ${transfer.transferNumber} (Terima dari ${transfer.fromWarehouse.name})`,
            },
          });
        }
      }

      // Transition to CANCELLED (Return stock if it was IN_TRANSIT)
      if (newStatus === TransferStatus.CANCELLED) {
        if (transfer.status === TransferStatus.IN_TRANSIT) {
          for (const item of transfer.items) {
            const inv = await tx.inventory.findUnique({
              where: {
                productId_warehouseId: {
                  productId: item.productId,
                  warehouseId: transfer.fromWarehouseId,
                },
              },
            });

            const currentQty = inv ? inv.quantity : 0;
            await tx.inventory.upsert({
              where: {
                productId_warehouseId: {
                  productId: item.productId,
                  warehouseId: transfer.fromWarehouseId,
                },
              },
              update: { quantity: currentQty + item.quantity },
              create: {
                productId: item.productId,
                warehouseId: transfer.fromWarehouseId,
                quantity: item.quantity,
              },
            });

            await tx.stockMovement.create({
              data: {
                productId: item.productId,
                warehouseId: transfer.fromWarehouseId,
                type: StockMovementType.TRANSFER,
                quantity: item.quantity,
                referenceId: `Batal Transfer ${transfer.transferNumber} (Pengembalian Stok)`,
              },
            });
          }
        }
      }

      const updated = await tx.stockTransfer.update({
        where: { id },
        data: { status: newStatus },
        include: { fromWarehouse: true, toWarehouse: true, items: true },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'UPDATE_TRANSFER_STATUS',
          entity: 'StockTransfer',
          entityId: id,
          payload: {
            transferNumber: transfer.transferNumber,
            oldStatus: transfer.status,
            newStatus,
            ip: ip || null,
          },
        },
      });
      return updated;
    });
  }
}
