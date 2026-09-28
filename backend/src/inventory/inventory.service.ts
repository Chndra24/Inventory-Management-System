import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildPageMeta, resolvePaging } from '../common/utils/paging.util';
import { AdjustStockDto, AdjustmentType } from './dto/adjust-stock.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { StockMovementType, Prisma } from '@prisma/client';
import { resolveSort } from '../common/utils/sort.util';

const SORTABLE_FIELDS = ['name', 'sku', 'unit', 'minStock', 'createdAt'] as const;

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  async getOverview(query: PaginationQueryDto & { warehouseId?: string; lowStockOnly?: boolean }) {
    const { page, limit, skip } = resolvePaging(query);
    const sort = resolveSort(query.sortBy, SORTABLE_FIELDS, 'name', query.sortOrder);

    const whereProduct: any = {};
    if (query.search) {
      whereProduct.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { sku: { contains: query.search, mode: 'insensitive' } },
        { barcode: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // A3: filter lowStock SEBELUM pagination agar meta.totalItems/totalPages akurat.
    // HAVING dijalankan di DB atas agregat stok per gudang (atau global).
    if (query.lowStockOnly) {
      const warehouseCondition = query.warehouseId
        ? Prisma.sql`AND i.warehouse_id = ${query.warehouseId}`
        : Prisma.empty;

      const lowStockRows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT p.id
        FROM products p
        LEFT JOIN inventories i ON i.product_id = p.id ${warehouseCondition}
        GROUP BY p.id, p.min_stock
        HAVING COALESCE(SUM(i.quantity), 0) <= p.min_stock
      `);

      whereProduct.id = { in: lowStockRows.map((row) => row.id) };
    }

    const [products, totalProducts] = await Promise.all([
      this.prisma.product.findMany({
        where: whereProduct,
        skip,
        take: limit,
        orderBy: { [sort.field]: sort.order },
        include: {
          category: { select: { id: true, name: true } },
          inventories: {
            where: query.warehouseId ? { warehouseId: query.warehouseId } : {},
            include: { warehouse: { select: { id: true, code: true, name: true } } },
          },
        },
      }),
      this.prisma.product.count({ where: whereProduct }),
    ]);

    const formatted = products.map((prod: any) => {
      const totalStock = prod.inventories.reduce((acc: number, inv: any) => acc + inv.quantity, 0);
      const isLowStock = totalStock <= prod.minStock;

      return {
        id: prod.id,
        sku: prod.sku,
        barcode: prod.barcode || null,
        name: prod.name,
        unit: prod.unit || 'Pcs',
        minStock: prod.minStock,
        category: prod.category,
        totalStock,
        isLowStock,
        inventories: prod.inventories,
      };
    });

    return {
      data: formatted,
      meta: buildPageMeta(page, limit, totalProducts),
    };
  }

  async getMovements(
    query: PaginationQueryDto & {
      warehouseId?: string;
      productId?: string;
      type?: StockMovementType;
    },
  ) {
    const { page, limit, skip } = resolvePaging(query);
    const sort = resolveSort(
      query.sortBy,
      ['createdAt', 'quantity', 'type'],
      'createdAt',
      query.sortOrder,
    );

    const where: any = {};
    if (query.warehouseId) where.warehouseId = query.warehouseId;
    if (query.productId) where.productId = query.productId;
    if (query.type) where.type = query.type;

    if (query.search) {
      where.OR = [
        { product: { name: { contains: query.search, mode: 'insensitive' } } },
        { product: { sku: { contains: query.search, mode: 'insensitive' } } },
        { warehouse: { name: { contains: query.search, mode: 'insensitive' } } },
        { referenceId: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [movements, totalItems] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sort.field]: sort.order },
        include: {
          product: { select: { id: true, sku: true, name: true, unit: true } },
          warehouse: { select: { id: true, code: true, name: true } },
        },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return {
      data: movements,
      meta: buildPageMeta(page, limit, totalItems),
    };
  }

  async adjustStock(dto: AdjustStockDto, userId?: string, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: dto.productId },
      });
      if (!product) throw new NotFoundException('Produk tidak ditemukan');

      const warehouse = await tx.warehouse.findUnique({
        where: { id: dto.warehouseId },
      });
      if (!warehouse) throw new NotFoundException('Gudang tidak ditemukan');

      const existingInv = await tx.inventory.findUnique({
        where: {
          productId_warehouseId: {
            productId: dto.productId,
            warehouseId: dto.warehouseId,
          },
        },
      });

      const currentQty = existingInv ? existingInv.quantity : 0;
      let newQty = currentQty;

      if (dto.type === AdjustmentType.OUT) {
        if (currentQty < dto.quantity) {
          const unitName = (product as any).unit || 'Pcs';
          throw new BadRequestException(
            `Penyesuaian stok gagal: Stok saat ini (${currentQty} ${unitName}) di gudang "${warehouse.name}" kurang dari jumlah penyesuaian (${dto.quantity} ${unitName})`,
          );
        }
        newQty = currentQty - dto.quantity;
      } else {
        newQty = currentQty + dto.quantity;
      }

      // Upsert Inventory
      const updatedInv = await tx.inventory.upsert({
        where: {
          productId_warehouseId: {
            productId: dto.productId,
            warehouseId: dto.warehouseId,
          },
        },
        update: { quantity: newQty },
        create: {
          productId: dto.productId,
          warehouseId: dto.warehouseId,
          quantity: newQty,
        },
      });

      // Record Stock Movement
      await tx.stockMovement.create({
        data: {
          productId: dto.productId,
          warehouseId: dto.warehouseId,
          type: StockMovementType.ADJUSTMENT,
          quantity: dto.type === AdjustmentType.IN ? dto.quantity : -dto.quantity,
          referenceId: `Alasan: ${dto.reason}`,
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          userId,
          action: 'STOCK_ADJUSTMENT',
          entity: 'Inventory',
          entityId: updatedInv.id,
          payload: {
            productId: product.id,
            sku: product.sku,
            warehouseId: warehouse.id,
            warehouseName: warehouse.name,
            adjustmentType: dto.type,
            quantityAdjusted: dto.quantity,
            previousQuantity: currentQty,
            newQuantity: newQty,
            reason: dto.reason,
            ip: ip || null,
          },
        },
      });

      return {
        message: 'Penyesuaian stok berhasil dilakukan',
        product: { id: product.id, sku: product.sku, name: product.name },
        warehouse: { id: warehouse.id, name: warehouse.name },
        previousQuantity: currentQty,
        newQuantity: newQty,
        reason: dto.reason,
      };
    });
  }
}
