import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildPageMeta, resolvePaging } from '../common/utils/paging.util';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { resolveSort } from '../common/utils/sort.util';
import { nextSequentialCode } from '../common/utils/sequence.util';
import {
  isUniqueViolation,
  uniqueViolationColumns,
  withUniqueRetry,
} from '../common/utils/unique.util';

const SORTABLE_FIELDS = ['createdAt', 'updatedAt', 'name', 'code'] as const;

@Injectable()
export class WarehousesService {
  constructor(private prisma: PrismaService) {}

  private async generateCode(): Promise<string> {
    // Nomor TERBESAR + 1 (bukan count + 1): aman terhadap penghapusan gudang.
    return nextSequentialCode(this.prisma.warehouse, { prefix: 'WH-', field: 'code', padding: 3 });
  }

  async findAll(query: PaginationQueryDto) {
    const { page, limit, skip } = resolvePaging(query);
    const sort = resolveSort(query.sortBy, SORTABLE_FIELDS, 'createdAt', query.sortOrder);

    const where = query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { code: { contains: query.search, mode: 'insensitive' as const } },
            { address: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [items, totalItems] = await Promise.all([
      this.prisma.warehouse.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sort.field]: sort.order },
        include: {
          _count: {
            select: {
              inventories: true,
              stockMovements: true,
              purchaseOrders: true,
              salesOrders: true,
            },
          },
        },
      }),
      this.prisma.warehouse.count({ where }),
    ]);

    return {
      data: items,
      meta: buildPageMeta(page, limit, totalItems),
    };
  }

  async findOne(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            inventories: true,
            stockMovements: true,
            purchaseOrders: true,
            salesOrders: true,
          },
        },
      },
    });
    if (!warehouse) throw new NotFoundException('Gudang tidak ditemukan');
    return warehouse;
  }

  async create(dto: CreateWarehouseDto, userId?: string, ip?: string) {
    if (dto.code) {
      const existing = await this.prisma.warehouse.findUnique({
        where: { code: dto.code.trim() },
      });
      if (existing) {
        throw new ConflictException(`Kode Gudang "${dto.code.trim()}" sudah digunakan`);
      }
    }

    try {
      // Anti-race (A4): generate kode di LUAR transaksi agar transaksi lebih
      // pendek; retry tetap meng-generate ulang tiap attempt (P2002/P2028).
      return await withUniqueRetry(async () => {
        const code = dto.code ? dto.code.trim() : await this.generateCode();
        return this.prisma.$transaction(async (tx) => {
          const warehouse = await tx.warehouse.create({
            data: {
              code,
              name: dto.name,
              address: dto.address || null,
            },
          });

          await tx.auditLog.create({
            data: {
              userId,
              action: 'CREATE',
              entity: 'Warehouse',
              entityId: warehouse.id,
              payload: { code: warehouse.code, name: warehouse.name, ip: ip || null },
            },
          });

          return warehouse;
        });
      });
    } catch (error) {
      if (isUniqueViolation(error) && uniqueViolationColumns(error).includes('code')) {
        throw new ConflictException('Kode Gudang sudah digunakan, silakan coba lagi');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateWarehouseDto, userId?: string, ip?: string) {
    await this.findOne(id);

    if (dto.code) {
      const existing = await this.prisma.warehouse.findFirst({
        where: { code: dto.code, NOT: { id } },
      });
      if (existing) {
        throw new ConflictException(`Kode Gudang "${dto.code}" sudah digunakan gudang lain`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const warehouse = await tx.warehouse.update({
        where: { id },
        data: dto,
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'UPDATE',
          entity: 'Warehouse',
          entityId: warehouse.id,
          payload: { ...dto, ip: ip || null },
        },
      });

      return warehouse;
    });
  }

  async remove(id: string, userId?: string, ip?: string) {
    const warehouse = await this.findOne(id);

    const hasInventories = warehouse._count.inventories > 0;
    const hasMovements = warehouse._count.stockMovements > 0;
    const hasPo = warehouse._count.purchaseOrders > 0;
    const hasSo = warehouse._count.salesOrders > 0;

    if (hasInventories || hasMovements || hasPo || hasSo) {
      throw new BadRequestException(
        `Gudang "${warehouse.name}" (${warehouse.code}) tidak dapat dihapus karena memiliki riwayat stok/transaksi terikat`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.warehouse.delete({
        where: { id },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'DELETE',
          entity: 'Warehouse',
          entityId: id,
          payload: { code: warehouse.code, name: warehouse.name, ip: ip || null },
        },
      });

      return { message: 'Gudang berhasil dihapus' };
    });
  }
}
