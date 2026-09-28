import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildPageMeta, resolvePaging } from '../common/utils/paging.util';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { resolveSort } from '../common/utils/sort.util';

const SORTABLE_FIELDS = ['createdAt', 'action', 'entity'] as const;

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: AuditLogQueryDto) {
    const { page, limit, skip } = resolvePaging(query, 50);
    const sort = resolveSort(query.sortBy, SORTABLE_FIELDS, 'createdAt', query.sortOrder);

    const where: Prisma.AuditLogWhereInput = {};
    if (query.action) where.action = query.action;
    if (query.entity) where.entity = query.entity;
    if (query.userId) where.userId = query.userId;

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) {
        // Bila hanya tanggal (YYYY-MM-DD), sertakan seluruh hari tersebut
        const endDate =
          query.endDate.length === 10
            ? new Date(new Date(query.endDate).getTime() + 24 * 60 * 60 * 1000 - 1)
            : new Date(query.endDate);
        where.createdAt.lte = endDate;
      }
    }

    if (query.search) {
      where.OR = [
        { action: { contains: query.search, mode: 'insensitive' } },
        { entity: { contains: query.search, mode: 'insensitive' } },
        { entityId: { contains: query.search, mode: 'insensitive' } },
        { user: { name: { contains: query.search, mode: 'insensitive' } } },
        { user: { email: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [items, totalItems] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sort.field]: sort.order },
        include: {
          user: {
            select: { id: true, name: true, email: true, role: { select: { name: true } } },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    // Nilai agregat untuk dropdown filter (aksi & entitas unik)
    const [actions, entities] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: query.userId ? { userId: query.userId } : {},
        distinct: ['action'],
        select: { action: true },
        orderBy: { action: 'asc' },
      }),
      this.prisma.auditLog.findMany({
        distinct: ['entity'],
        select: { entity: true },
        orderBy: { entity: 'asc' },
      }),
    ]);

    return {
      data: items,
      meta: buildPageMeta(page, limit, totalItems),
      filters: {
        actions: actions.map((a) => a.action),
        entities: entities.map((e) => e.entity),
      },
    };
  }
}
