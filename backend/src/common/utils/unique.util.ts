import { Prisma } from '@prisma/client';

/** Apakah error adalah pelanggaran unique constraint Prisma (P2002)? */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Kolom mana yang menyebabkan pelanggaran unique (dari meta.target Prisma). */
export function uniqueViolationColumns(error: unknown): string[] {
  if (!isUniqueViolation(error)) return [];
  const target = (error as Prisma.PrismaClientKnownRequestError).meta?.target;
  if (Array.isArray(target)) return target as string[];
  if (typeof target === 'string') return [target];
  return [];
}

/** Apakah error transaksi Prisma yang hilang/putus di tengah jalan (P2028)? */
export function isTransientTxError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2028';
}

/**
 * Anti-race condition untuk nomor urut otomatis (A4) + pengaman koneksi remote.
 *
 * Dua jenis error dianggap transient dan aman dicoba ulang:
 * - P2002 (unique violation): regenerasi nomor menghasilkan nomor lain
 *   (max + 1 sudah mencakup baris pemenang), jadi retry efektif.
 * - P2028 (transaction not found): koneksi pooler remote terputus/gugur di
 *   tengah transaksi — percobaan ulang dengan transaksi baru biasanya lulus.
 *
 * Error lain langsung dilempar (bukan transient).
 */
export async function withUniqueRetry<T>(
  generateAndInsert: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await generateAndInsert();
    } catch (error) {
      if (isUniqueViolation(error) || isTransientTxError(error)) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}
