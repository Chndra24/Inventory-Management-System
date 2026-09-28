import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildPageMeta, resolvePaging } from '../common/utils/paging.util';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { resolveSort } from '../common/utils/sort.util';

const SORTABLE_FIELDS = ['createdAt', 'updatedAt', 'name', 'slug'] as const;

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async findAll(query: PaginationQueryDto) {
    const { page, limit, skip } = resolvePaging(query);
    const sort = resolveSort(query.sortBy, SORTABLE_FIELDS, 'createdAt', query.sortOrder);

    const where = query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { slug: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [items, totalItems] = await Promise.all([
      this.prisma.category.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sort.field]: sort.order },
        include: {
          _count: {
            select: { products: true },
          },
        },
      }),
      this.prisma.category.count({ where }),
    ]);

    return {
      data: items,
      meta: buildPageMeta(page, limit, totalItems),
    };
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });
    if (!category) throw new NotFoundException('Kategori tidak ditemukan');
    return category;
  }

  async create(dto: CreateCategoryDto, userId?: string, ip?: string) {
    const slug = this.slugify(dto.name);

    return this.prisma.$transaction(async (tx) => {
      const category = await tx.category.create({
        data: {
          name: dto.name,
          slug,
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'CREATE',
          entity: 'Category',
          entityId: category.id,
          payload: { name: category.name, slug: category.slug, ip: ip || null },
        },
      });

      return category;
    });
  }

  async update(id: string, dto: UpdateCategoryDto, userId?: string, ip?: string) {
    await this.findOne(id);

    const updateData: any = { ...dto };
    if (dto.name) {
      updateData.slug = this.slugify(dto.name);
    }

    return this.prisma.$transaction(async (tx) => {
      const category = await tx.category.update({
        where: { id },
        data: updateData,
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'UPDATE',
          entity: 'Category',
          entityId: category.id,
          payload: { ...updateData, ip: ip || null },
        },
      });

      return category;
    });
  }

  async remove(id: string, userId?: string, ip?: string) {
    const category = await this.findOne(id);

    if (category._count.products > 0) {
      throw new BadRequestException(
        `Kategori "${category.name}" tidak dapat dihapus karena memiliki ${category._count.products} produk terkait`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.category.delete({
        where: { id },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'DELETE',
          entity: 'Category',
          entityId: id,
          payload: { name: category.name, ip: ip || null },
        },
      });

      return { message: 'Kategori berhasil dihapus' };
    });
  }
}
