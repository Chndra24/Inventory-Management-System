import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildPageMeta, resolvePaging } from '../common/utils/paging.util';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { resolveSort } from '../common/utils/sort.util';

const SORTABLE_FIELDS = ['createdAt', 'updatedAt', 'name', 'email', 'phone'] as const;

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: PaginationQueryDto) {
    const { page, limit, skip } = resolvePaging(query);
    const sort = resolveSort(query.sortBy, SORTABLE_FIELDS, 'createdAt', query.sortOrder);

    const where = query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { email: { contains: query.search, mode: 'insensitive' as const } },
            { phone: { contains: query.search, mode: 'insensitive' as const } },
            { address: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [items, totalItems] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sort.field]: sort.order },
        include: {
          _count: {
            select: { purchaseOrders: true },
          },
        },
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return {
      data: items,
      meta: buildPageMeta(page, limit, totalItems),
    };
  }

  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: {
        _count: {
          select: { purchaseOrders: true },
        },
      },
    });
    if (!supplier) throw new NotFoundException('Pemasok tidak ditemukan');
    return supplier;
  }

  async create(dto: CreateSupplierDto, userId?: string, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.create({
        data: dto,
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'CREATE',
          entity: 'Supplier',
          entityId: supplier.id,
          payload: { name: supplier.name, ip: ip || null },
        },
      });

      return supplier;
    });
  }

  async update(id: string, dto: UpdateSupplierDto, userId?: string, ip?: string) {
    await this.findOne(id);

    return this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.update({
        where: { id },
        data: dto,
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'UPDATE',
          entity: 'Supplier',
          entityId: supplier.id,
          payload: { ...dto, ip: ip || null },
        },
      });

      return supplier;
    });
  }

  async remove(id: string, userId?: string, ip?: string) {
    const supplier = await this.findOne(id);

    if (supplier._count.purchaseOrders > 0) {
      throw new BadRequestException(
        `Pemasok "${supplier.name}" tidak dapat dihapus karena memiliki ${supplier._count.purchaseOrders} Purchase Order terkait`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.supplier.delete({
        where: { id },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'DELETE',
          entity: 'Supplier',
          entityId: id,
          payload: { name: supplier.name, ip: ip || null },
        },
      });

      return { message: 'Pemasok berhasil dihapus' };
    });
  }
}
