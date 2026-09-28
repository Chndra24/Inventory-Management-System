import { z } from 'zod';

/* Shared Zod schemas untuk validasi form frontend (C3).
   Backend tetap memvalidasi ulang dengan class-validator. */

export const loginSchema = z.object({
  email: z.string().min(1, 'Email wajib diisi').email('Format email tidak valid'),
  password: z.string().min(1, 'Kata sandi wajib diisi'),
});

export const categorySchema = z.object({
  name: z.string().min(2, 'Nama kategori minimal 2 karakter'),
});

export const productSchema = z.object({
  name: z.string().min(2, 'Nama produk minimal 2 karakter'),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  unit: z.string().optional(),
  categoryId: z.string().min(1, 'Kategori wajib dipilih'),
  minStock: z.coerce.number().min(0, 'Min stok tidak boleh negatif'),
  buyPrice: z.coerce.number().min(0, 'Harga beli tidak boleh negatif'),
  sellPrice: z.coerce.number().min(0, 'Harga jual tidak boleh negatif'),
});

export const warehouseSchema = z
  .object({
    name: z.string().min(2, 'Nama gudang minimal 2 karakter'),
    code: z.string().optional(),
    address: z.string().optional(),
  });

export const contactSchema = z.object({
  name: z.string().min(2, 'Nama minimal 2 karakter'),
  email: z.union([z.string().email('Format email tidak valid'), z.literal('')]).optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
});

export const adjustStockSchema = z.object({
  productId: z.string().min(1, 'Produk wajib dipilih'),
  warehouseId: z.string().min(1, 'Gudang wajib dipilih'),
  type: z.enum(['IN', 'OUT'], { error: 'Jenis harus IN atau OUT' }),
  quantity: z.coerce.number().int('Harus bilangan bulat').min(1, 'Jumlah minimal 1'),
  reason: z.string().min(3, 'Alasan penyesuaian wajib diisi'),
});

export const transferItemSchema = z.object({
  productId: z.string().min(1, 'Produk wajib dipilih'),
  quantity: z.coerce.number().int('Harus bilangan bulat').min(1, 'Jumlah minimal 1'),
});

export const transferSchema = z
  .object({
    fromWarehouseId: z.string().min(1, 'Gudang asal wajib dipilih'),
    toWarehouseId: z.string().min(1, 'Gudang tujuan wajib dipilih'),
    notes: z.string().optional(),
    items: z.array(transferItemSchema).min(1, 'Minimal 1 item barang'),
  })
  .refine((data) => data.fromWarehouseId !== data.toWarehouseId, {
    message: 'Gudang asal dan tujuan tidak boleh sama',
    path: ['toWarehouseId'],
  });

/* Fase 4 - item PO/SO: angka berbasis string (input form) + z.coerce.number().
   totalAmount TIDAK divalidasi di sini — selalu dihitung server-side. */
export const orderItemSchema = z.object({
  productId: z.string().min(1, 'Produk wajib dipilih'),
  quantity: z.coerce.number().int('Harus bilangan bulat').min(1, 'Jumlah minimal 1'),
  unitPrice: z.coerce.number().min(0, 'Harga satuan tidak boleh negatif'),
});

export const purchaseOrderSchema = z.object({
  supplierId: z.string().min(1, 'Pemasok wajib dipilih'),
  warehouseId: z.string().min(1, 'Gudang wajib dipilih'),
  items: z.array(orderItemSchema).min(1, 'Minimal 1 item barang'),
});

export const salesOrderSchema = z.object({
  customerId: z.string().min(1, 'Pelanggan wajib dipilih'),
  warehouseId: z.string().min(1, 'Gudang wajib dipilih'),
  items: z.array(orderItemSchema).min(1, 'Minimal 1 item barang'),
});

/* Fase 5 - catat pembayaran invoice: nominal berbasis string + z.coerce.number().
   Batas sisa tagihan divalidasi server-side. */
export const recordPaymentSchema = z.object({
  amount: z.coerce.number().min(0.01, 'Nominal pembayaran harus lebih dari 0'),
  method: z.enum(['CASH', 'TRANSFER', 'QRIS', 'OTHER']).optional(),
  note: z.string().max(255, 'Catatan maksimal 255 karakter').optional(),
});

export const createUserSchema = z.object({
  name: z.string().min(2, 'Nama minimal 2 karakter'),
  email: z.string().min(1, 'Email wajib diisi').email('Format email tidak valid'),
  password: z.string().min(8, 'Kata sandi minimal 8 karakter'),
  roleId: z.string().min(1, 'Role wajib dipilih'),
});

export const updateUserSchema = z.object({
  name: z.string().min(2, 'Nama minimal 2 karakter'),
  email: z.string().min(1, 'Email wajib diisi').email('Format email tidak valid'),
  roleId: z.string().min(1, 'Role wajib dipilih'),
});

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(8, 'Kata sandi minimal 8 karakter'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type WarehouseInput = z.infer<typeof warehouseSchema>;
export type ContactInput = z.infer<typeof contactSchema>;
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
export type TransferInput = z.infer<typeof transferSchema>;
export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;
export type SalesOrderInput = z.infer<typeof salesOrderSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Ambil pesan error pertama dari hasil safeParse Zod */
export function firstZodError(result: { error?: z.ZodError }): string | null {
  const issue = result.error?.issues?.[0];
  return issue ? issue.message : null;
}
