/**
 * Nomor urut dokumen/baris (SKU, kode gudang, nomor transfer, dst.).
 *
 * Strategi: nomor TERBESAR yang ada di DB + 1, bukan "jumlah baris + 1".
 * Pola lama `count + 1` bentrok deterministik begitu ada penghapusan di
 * tengah: data 0001, 0003 (0002 dihapus) -> count = 2 -> generate 0003 yang
 * sudah dipakai -> P2002 berulang-ulang karena hasilnya tidak pernah berubah.
 * Dengan max + 1, penghapusan di mana pun tidak pernah membuat nomor terpakai
 * ulang pada baris yang masih hidup.
 *
 * Race condition (dua request bersamaan menghasilkan nomor sama) tetap
 * ditangani `withUniqueRetry` di pemanggil — retry kini efektif karena hasil
 * regenerasi akan berbeda (nomor terbesar sudah termasuk baris pemenang).
 */

interface SequenceDelegate {
  findMany: (args: any) => Promise<Array<Record<string, unknown>>>;
}

interface SequenceOptions {
  /** Prefix lengkap SAMPAI tanda pemisah, mis. "PRD-202609-" atau "WH-" */
  prefix: string;
  /** Nama field bernomor, mis. "sku" | "code" | "transferNumber" */
  field: string;
  /** Panjang nomor urut setelah prefix, mis. 4 -> "0001" */
  padding: number;
}

export async function nextSequentialCode(
  delegate: SequenceDelegate,
  { prefix, field, padding }: SequenceOptions,
): Promise<string> {
  const rows = await delegate.findMany({
    where: { [field]: { startsWith: prefix } },
    select: { [field]: true },
  });

  let max = 0;
  for (const row of rows) {
    const suffix = String(row[field]).slice(prefix.length);
    const parsed = Number.parseInt(suffix, 10);
    if (Number.isFinite(parsed) && parsed > max) max = parsed;
  }

  return `${prefix}${String(max + 1).padStart(padding, '0')}`;
}
