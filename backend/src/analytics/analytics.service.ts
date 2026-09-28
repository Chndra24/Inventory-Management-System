import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const BULAN_PENDEK = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

/**
 * Definisi metrik (keputusan Fase 5):
 * - inventoryValue: Σ (stok × buy_price) — valuasi aset sesuai PRD (Cost Price).
 * - salesThisMonth / trend.sales: invoice terbit bulan berjalan (pendapatan tercatat).
 * - purchasesThisMonth / trend.purchases: PO status RECEIVED/COMPLETED (barang sudah masuk).
 * - topProducts: agregasi item SO status ALLOCATED/INVOICED/COMPLETED (all-time, limit 5).
 * - lowStockCount: produk dengan total stok ≤ min_stock (daftar itemnya direuse
 *   dari endpoint /inventory?lowStockOnly=true di frontend).
 */
@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getOverview() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfTrend = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [
      valueRows,
      lowStockRows,
      salesMonthRows,
      purchaseMonthRows,
      salesTrendRows,
      purchaseTrendRows,
      topProductRows,
    ] = await Promise.all([
      this.prisma.$queryRaw<{ value: number }[]>`
        SELECT COALESCE(SUM(i.quantity * p.buy_price), 0)::float AS value
        FROM inventories i
        JOIN products p ON p.id = i.product_id
      `,
      this.prisma.$queryRaw<{ count: number }[]>`
        SELECT COUNT(*)::int AS count FROM (
          SELECT p.id
          FROM products p
          LEFT JOIN inventories i ON i.product_id = p.id
          GROUP BY p.id, p.min_stock
          HAVING COALESCE(SUM(i.quantity), 0) <= p.min_stock
        ) t
      `,
      this.prisma.$queryRaw<{ total: number }[]>`
        SELECT COALESCE(SUM(total_amount), 0)::float AS total
        FROM invoices
        WHERE created_at >= ${startOfMonth}
      `,
      this.prisma.$queryRaw<{ total: number }[]>`
        SELECT COALESCE(SUM(total_amount), 0)::float AS total
        FROM purchase_orders
        WHERE created_at >= ${startOfMonth} AND status IN ('RECEIVED', 'COMPLETED')
      `,
      this.prisma.$queryRaw<{ key: string; total: number }[]>`
        SELECT to_char(created_at, 'YYYY-MM') AS key, SUM(total_amount)::float AS total
        FROM invoices
        WHERE created_at >= ${startOfTrend}
        GROUP BY 1
      `,
      this.prisma.$queryRaw<{ key: string; total: number }[]>`
        SELECT to_char(created_at, 'YYYY-MM') AS key, SUM(total_amount)::float AS total
        FROM purchase_orders
        WHERE created_at >= ${startOfTrend} AND status IN ('RECEIVED', 'COMPLETED')
        GROUP BY 1
      `,
      this.prisma.$queryRaw<
        { id: string; sku: string; name: string; quantity: number; value: number }[]
      >`
        SELECT p.id, p.sku, p.name,
               SUM(soi.quantity)::int AS quantity,
               SUM(soi.quantity * soi.unit_price)::float AS value
        FROM sales_order_items soi
        JOIN sales_orders so ON so.id = soi.so_id
        JOIN products p ON p.id = soi.product_id
        WHERE so.status IN ('ALLOCATED', 'INVOICED', 'COMPLETED')
        GROUP BY p.id, p.sku, p.name
        ORDER BY quantity DESC
        LIMIT 5
      `,
    ]);

    const salesMap = new Map(salesTrendRows.map((row) => [row.key, Number(row.total)]));
    const purchaseMap = new Map(purchaseTrendRows.map((row) => [row.key, Number(row.total)]));
    const trend = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      return {
        key,
        label: BULAN_PENDEK[date.getMonth()],
        sales: salesMap.get(key) || 0,
        purchases: purchaseMap.get(key) || 0,
      };
    });

    return {
      data: {
        inventoryValue: Number(valueRows[0]?.value ?? 0),
        salesThisMonth: Number(salesMonthRows[0]?.total ?? 0),
        purchasesThisMonth: Number(purchaseMonthRows[0]?.total ?? 0),
        lowStockCount: Number(lowStockRows[0]?.count ?? 0),
        trend,
        topProducts: topProductRows.map((row) => ({
          id: row.id,
          sku: row.sku,
          name: row.name,
          quantity: Number(row.quantity),
          value: Number(row.value),
        })),
        generatedAt: now.toISOString(),
      },
    };
  }
}
