import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildPageMeta, resolvePaging } from '../common/utils/paging.util';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { resolveSort } from '../common/utils/sort.util';
import { nextSequentialCode } from '../common/utils/sequence.util';
import {
  isUniqueViolation,
  uniqueViolationColumns,
  withUniqueRetry,
} from '../common/utils/unique.util';

const SORTABLE_FIELDS = [
  'createdAt',
  'updatedAt',
  'name',
  'sku',
  'minStock',
  'buyPrice',
  'sellPrice',
] as const;

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  private async generateSku(): Promise<string> {
    const now = new Date();
    const prefix = `PRD-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;
    // Nomor TERBESAR + 1 (bukan count + 1) agar penghapusan di tengah tidak
    // pernah membuat generate bentrok dengan SKU yang masih ada.
    return nextSequentialCode(this.prisma.product, { prefix, field: 'sku', padding: 4 });
  }

  async findAll(query: ProductQueryDto) {
    const { page, limit, skip } = resolvePaging(query);
    const sort = resolveSort(query.sortBy, SORTABLE_FIELDS, 'createdAt', query.sortOrder);

    const where: any = {};

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { sku: { contains: query.search, mode: 'insensitive' } },
        { barcode: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, totalItems] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sort.field]: sort.order },
        include: {
          category: {
            select: { id: true, name: true, slug: true },
          },
          inventories: {
            select: {
              quantity: true,
              warehouse: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: items,
      meta: buildPageMeta(page, limit, totalItems),
    };
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        inventories: {
          include: { warehouse: true },
        },
        _count: {
          select: {
            stockMovements: true,
            purchaseOrderItems: true,
            salesOrderItems: true,
          },
        },
      },
    });
    if (!product) throw new NotFoundException('Produk tidak ditemukan');
    return product;
  }

  async create(dto: CreateProductDto, userId?: string, ip?: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) throw new NotFoundException('Kategori tidak ditemukan');

    // Check SKU Uniqueness (pre-check for friendly error)
    if (dto.sku) {
      const sku = dto.sku.trim();
      const existingSku = await this.prisma.product.findUnique({
        where: { sku },
      });
      if (existingSku) {
        throw new ConflictException(`SKU "${sku}" sudah digunakan oleh produk lain`);
      }
    }

    // Check Barcode Uniqueness if provided
    if (dto.barcode) {
      const existingBarcode = await this.prisma.product.findUnique({
        where: { barcode: dto.barcode },
      });
      if (existingBarcode) {
        throw new ConflictException(`Barcode "${dto.barcode}" sudah digunakan`);
      }
    }

    try {
      // Anti-race (A4): generate SKU di LUAR transaksi agar transaksi lebih
      // pendek; retry tetap meng-generate ulang tiap attempt (P2002/P2028).
      return await withUniqueRetry(async () => {
        const sku = dto.sku ? dto.sku.trim() : await this.generateSku();
        return this.prisma.$transaction(async (tx) => {
          const product = await tx.product.create({
            data: {
              sku,
              barcode: dto.barcode || null,
              name: dto.name,
              unit: dto.unit || 'Pcs',
              categoryId: dto.categoryId,
              minStock: dto.minStock || 0,
              buyPrice: dto.buyPrice,
              sellPrice: dto.sellPrice,
            },
            include: { category: true },
          });

          await tx.auditLog.create({
            data: {
              userId,
              action: 'CREATE',
              entity: 'Product',
              entityId: product.id,
              payload: { sku: product.sku, name: product.name, ip: ip || null },
            },
          });

          return product;
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const columns = uniqueViolationColumns(error);
        if (columns.includes('barcode') && dto.barcode) {
          throw new ConflictException(`Barcode "${dto.barcode}" sudah digunakan`);
        }
        if (dto.sku) {
          throw new ConflictException(`SKU "${dto.sku.trim()}" sudah digunakan oleh produk lain`);
        }
        throw new ConflictException('Terjadi bentrok SKU saat pembuatan produk, silakan coba lagi');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateProductDto, userId?: string, ip?: string) {
    await this.findOne(id);

    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) throw new NotFoundException('Kategori tidak ditemukan');
    }

    if (dto.sku) {
      const existingSku = await this.prisma.product.findFirst({
        where: { sku: dto.sku, NOT: { id } },
      });
      if (existingSku) {
        throw new ConflictException(`SKU "${dto.sku}" sudah digunakan produk lain`);
      }
    }

    if (dto.barcode) {
      const existingBarcode = await this.prisma.product.findFirst({
        where: { barcode: dto.barcode, NOT: { id } },
      });
      if (existingBarcode) {
        throw new ConflictException(`Barcode "${dto.barcode}" sudah digunakan`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.update({
        where: { id },
        data: {
          ...dto,
        },
        include: { category: true },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'UPDATE',
          entity: 'Product',
          entityId: product.id,
          payload: { ...dto, ip: ip || null },
        },
      });

      return product;
    });
  }

  async remove(id: string, userId?: string, ip?: string) {
    const product = await this.findOne(id);

    const totalStock = product.inventories.reduce((acc, curr) => acc + curr.quantity, 0);
    const hasMovements = product._count.stockMovements > 0;
    const hasPo = product._count.purchaseOrderItems > 0;
    const hasSo = product._count.salesOrderItems > 0;

    if (totalStock > 0 || hasMovements || hasPo || hasSo) {
      throw new BadRequestException(
        `Produk "${product.name}" (${product.sku}) tidak dapat dihapus karena memiliki riwayat stok/transaksi terkait`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.product.delete({
        where: { id },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'DELETE',
          entity: 'Product',
          entityId: id,
          payload: { sku: product.sku, name: product.name, ip: ip || null },
        },
      });

      return { message: 'Produk berhasil dihapus' };
    });
  }
}
