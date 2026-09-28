import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Helper integration test (Fase 6).
 *
 * Seluruh test berjalan di schema khusus `erp_test` (di-set test/setup-env.ts
 * lewat koneksi direct). Guard assertTestSchema() memastikan koneksi BENAR-BENAR
 * menunjuk schema test sebelum ada truncate apa pun — jika tidak, suite gagal
 * seketika sehingga data development di schema public tidak pernah tersentuh.
 */
export const TEST_SCHEMA = 'erp_test';
export const prisma = new PrismaService();

// Tabel di schema test (nama @@map). TRUNCATE memakai kualifikasi schema eksplisit.
const TABLES = [
  'payments',
  'invoices',
  'sales_order_items',
  'sales_orders',
  'purchase_order_items',
  'purchase_orders',
  'stock_transfer_items',
  'stock_transfers',
  'stock_movements',
  'inventories',
  'audit_logs',
  'users',
  'roles',
  'products',
  'categories',
  'suppliers',
  'customers',
  'warehouses',
];

export interface Fixtures {
  userId: string;
  warehouseAId: string;
  warehouseBId: string;
  productId: string;
  productSku: string;
  supplierId: string;
  customerId: string;
}

/** Pastikan koneksi menunjuk schema test, bukan schema publik (data dev). */
export async function assertTestSchema(): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ current_schema: string }>>`SELECT current_schema()`;
  const current = rows[0]?.current_schema;
  if (current !== TEST_SCHEMA) {
    throw new Error(
      `GUARD GAGAL: current_schema="${current}" (diharapkan ${TEST_SCHEMA}). ` +
        'Suite dihentikan agar data development tidak tersentuh.',
    );
  }
}

/** Kosongkan seluruh tabel schema test (dilindungi guard schema). */
export async function resetDatabase(): Promise<void> {
  await assertTestSchema();
  const list = TABLES.map((t) => `${TEST_SCHEMA}."${t}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

/** Fixture minimal per test: role+user, 2 gudang, produk, supplier, customer. */
export async function seedFixtures(): Promise<Fixtures> {
  const role = await prisma.role.create({ data: { name: 'SUPER_ADMIN' } });
  const user = await prisma.user.create({
    data: {
      name: 'Test User',
      email: `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`,
      passwordHash: 'hash-bukan-asli',
      roleId: role.id,
    },
  });
  const warehouseA = await prisma.warehouse.create({
    data: { code: 'TWH-A', name: 'Gudang Test A' },
  });
  const warehouseB = await prisma.warehouse.create({
    data: { code: 'TWH-B', name: 'Gudang Test B' },
  });
  const category = await prisma.category.create({
    data: { name: 'Kategori Test', slug: 'kategori-test' },
  });
  const product = await prisma.product.create({
    data: {
      sku: 'TST-0001',
      name: 'Produk Test',
      categoryId: category.id,
      unit: 'Pcs',
      minStock: 5,
      buyPrice: 1000,
      sellPrice: 1500,
    },
  });
  const supplier = await prisma.supplier.create({ data: { name: 'Supplier Test' } });
  const customer = await prisma.customer.create({ data: { name: 'Customer Test' } });

  return {
    userId: user.id,
    warehouseAId: warehouseA.id,
    warehouseBId: warehouseB.id,
    productId: product.id,
    productSku: product.sku,
    supplierId: supplier.id,
    customerId: customer.id,
  };
}

/** Set stok produk di gudang (langsung, tanpa melalui alur PO). */
export async function setStock(
  productId: string,
  warehouseId: string,
  quantity: number,
): Promise<void> {
  await prisma.inventory.upsert({
    where: { productId_warehouseId: { productId, warehouseId } },
    update: { quantity },
    create: { productId, warehouseId, quantity },
  });
}

/** Baca stok produk di gudang (0 bila baris inventori belum ada). */
export async function getStock(productId: string, warehouseId: string): Promise<number> {
  const inv = await prisma.inventory.findUnique({
    where: { productId_warehouseId: { productId, warehouseId } },
  });
  return inv ? inv.quantity : 0;
}
