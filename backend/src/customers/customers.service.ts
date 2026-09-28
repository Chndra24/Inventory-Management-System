import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildPageMeta, resolvePaging } from '../common/utils/paging.util';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { resolveSort } from '../common/utils/sort.util';

const SORTABLE_FIELDS = ['createdAt', 'updatedAt', 'name', 'email', 'phone'] as const;

@Injectable()
export class CustomersService {
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
      this.prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sort.field]: sort.order },
        include: {
          _count: {
            select: { salesOrders: true },
          },
        },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      data: items,
      meta: buildPageMeta(page, limit, totalItems),
    };
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        _count: {
          select: { salesOrders: true },
        },
      },
    });
    if (!customer) throw new NotFoundException('Pelanggan tidak ditemukan');
    return customer;
  }

  async create(dto: CreateCustomerDto, userId?: string, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: dto,
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'CREATE',
          entity: 'Customer',
          entityId: customer.id,
          payload: { name: customer.name, ip: ip || null },
        },
      });

      return customer;
    });
  }

  async update(id: string, dto: UpdateCustomerDto, userId?: string, ip?: string) {
    await this.findOne(id);

    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.update({
        where: { id },
        data: dto,
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'UPDATE',
          entity: 'Customer',
          entityId: customer.id,
          payload: { ...dto, ip: ip || null },
        },
      });

      return customer;
    });
  }

  async remove(id: string, userId?: string, ip?: string) {
    const customer = await this.findOne(id);

    if (customer._count.salesOrders > 0) {
      throw new BadRequestException(
        `Pelanggan "${customer.name}" tidak dapat dihapus karena memiliki ${customer._count.salesOrders} Sales Order terkait`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.customer.delete({
        where: { id },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'DELETE',
          entity: 'Customer',
          entityId: id,
          payload: { name: customer.name, ip: ip || null },
        },
      });

      return { message: 'Pelanggan berhasil dihapus' };
    });
  }
}
