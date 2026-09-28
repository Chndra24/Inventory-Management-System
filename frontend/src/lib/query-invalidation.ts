import type { QueryClient } from '@tanstack/react-query';

/**
 * Refresh daftar setelah mutasi (tambah/ubah/hapus) (C3, revisi list produk).
 *
 * - removeQueries(type: 'inactive'): membuang cache kombinasi sort/page/filter
 *   yang sedang tidak aktif. Tanpa ini, kombinasi sort lama masih menyimpan
 *   snapshot data lama (mis. baris yang baru dihapus) dan akan sempat tampil
 *   (stale-while-revalidate) saat pengguna mengklik tombol sort tersebut.
 * - invalidateQueries: menandai query aktif stale lalu refetch, sehingga
 *   `isFetching` menyala dan tabel menampilkan "Memuat data..." (revisi 5).
 */
export function invalidateList(queryClient: QueryClient, keys: string | string[]): void {
  const list = Array.isArray(keys) ? keys : [keys];
  for (const key of list) {
    queryClient.removeQueries({ queryKey: [key], type: 'inactive' });
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}
