import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Validasi item Purchase Order / Sales Order — sebelumnya method identik
 * `validateItems` terduplikasi di 2 service (Fase 6 refactoring):
 * tanpa produk duplikat & semua produk harus ada.
 */
export async function assertValidOrderItems(
  prisma: PrismaService,
  items: Array<{ productId: string }>,
): Promise<void> {
  const ids = [...new Set(items.map((item) => item.productId))];
  if (ids.length !== items.length) {
    throw new BadRequestException(
      'Terdapat produk duplikat dalam daftar item — gabungkan jumlahnya dalam satu baris',
    );
  }

  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const found = new Set(products.map((product) => product.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new NotFoundException(`Produk tidak ditemukan: ${missing.join(', ')}`);
  }
}
