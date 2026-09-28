'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { type ColumnDef, type SortingState } from '@tanstack/react-table';
import { toast } from 'sonner';
import { DashboardLayout } from '@/components/dashboard-layout';
import { Modal } from '@/components/ui/modal';
import { DataTable } from '@/components/ui/data-table';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { apiClient } from '@/lib/api-client';
import { can } from '@/lib/permissions';
import { invalidateList } from '@/lib/query-invalidation';
import { useAuth } from '@/lib/use-auth';
import { productSchema } from '@/lib/schemas';
import { apiErrorMessage } from '@/lib/utils';
import type { Product, Category, PaginatedResponse } from '@/types';
import { Package, Plus, Search, Edit2, Trash2, AlertCircle } from 'lucide-react';

const UNITS = ['Pcs', 'Box', 'Pack', 'Kg', 'Liter', 'Meter', 'Lusin', 'Rim'];

function formatRupiah(value: number | string): string {
  const n = Number(value);
  return `Rp ${n.toLocaleString('id-ID')}`;
}

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const canManage = can(role, 'manageProducts');

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }]);
  const [categoryFilter, setCategoryFilter] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('Pcs');
  const [categoryId, setCategoryId] = useState('');
  const [minStock, setMinStock] = useState('5');
  const [buyPrice, setBuyPrice] = useState('0');
  const [sellPrice, setSellPrice] = useState('0');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sortBy = sorting[0]?.id;
  const sortOrder = sorting[0] ? (sorting[0].desc ? 'desc' : 'asc') : undefined;

  const { data: categoriesData } = useQuery<PaginatedResponse<Category>>({
    queryKey: ['categories-list'],
    queryFn: async () => {
      const res = await apiClient.get('/categories', { params: { limit: 100 } });
      return res.data;
    },
  });
  // Opsi kategori (filter & form) diurutkan abjad A→Z
  const sortedCategories = [...(categoriesData?.data ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const { data, isLoading, isFetching } = useQuery<PaginatedResponse<Product>>({
    queryKey: ['products', page, search, sortBy, sortOrder, categoryFilter],
    queryFn: async () => {
      const res = await apiClient.get('/products', {
        params: {
          page,
          limit: 10,
          search,
          sortBy,
          sortOrder,
          categoryId: categoryFilter || undefined,
        },
      });
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await apiClient.post('/products', payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Produk berhasil ditambahkan');
      invalidateList(queryClient, 'products');
      closeModal();
    },
    onError: (err) => setErrorMessage(apiErrorMessage(err, 'Gagal menambahkan produk')),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, unknown> }) => {
      const res = await apiClient.put(`/products/${id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Produk berhasil diperbarui');
      invalidateList(queryClient, 'products');
      closeModal();
    },
    onError: (err) => setErrorMessage(apiErrorMessage(err, 'Gagal mengedit produk')),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.delete(`/products/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Produk berhasil dihapus');
      invalidateList(queryClient, 'products');
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menghapus produk')),
  });

  const openCreateModal = () => {
    setEditingProduct(null);
    setSku('');
    setBarcode('');
    setName('');
    setUnit('Pcs');
    setCategoryId('');
    setMinStock('5');
    setBuyPrice('0');
    setSellPrice('0');
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const openEditModal = (item: Product) => {
    setEditingProduct(item);
    setSku(item.sku || '');
    setBarcode(item.barcode || '');
    setName(item.name || '');
    setUnit(item.unit || 'Pcs');
    setCategoryId(item.categoryId || '');
    setMinStock(String(item.minStock ?? 0));
    setBuyPrice(String(Number(item.buyPrice) || 0));
    setSellPrice(String(Number(item.sellPrice) || 0));
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
    setErrorMessage(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = productSchema.safeParse({
      name,
      sku,
      barcode,
      unit,
      categoryId,
      minStock,
      buyPrice,
      sellPrice,
    });
    if (!parsed.success) {
      setErrorMessage(parsed.error.issues[0].message);
      return;
    }
    setErrorMessage(null);
    const payload: Record<string, unknown> = {
      name: parsed.data.name,
      sku: parsed.data.sku?.trim() || undefined,
      barcode: parsed.data.barcode?.trim() || undefined,
      unit: parsed.data.unit,
      categoryId: parsed.data.categoryId,
      minStock: parsed.data.minStock,
      buyPrice: parsed.data.buyPrice,
      sellPrice: parsed.data.sellPrice,
    };
    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const columns: ColumnDef<Product, any>[] = [
    {
      accessorKey: 'sku',
      header: 'SKU',
      enableSorting: true,
      cell: ({ row }) => (
        <div className="text-xs">
          <div className="font-mono font-semibold text-sky-400">{row.original.sku}</div>
          {row.original.barcode && (
            <div className="font-mono text-slate-500">{row.original.barcode}</div>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'name',
      header: 'Nama Produk',
      enableSorting: true,
      cell: ({ row }) => <span className="font-medium text-white">{row.original.name}</span>,
    },
    {
      id: 'category',
      header: 'Kategori',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="bg-slate-800 text-slate-300 px-2.5 py-1 rounded border border-slate-700 text-xs">
          {row.original.category?.name || '-'}
        </span>
      ),
    },
    {
      accessorKey: 'buyPrice',
      header: 'Harga Beli',
      enableSorting: true,
      meta: { align: 'right' as const },
      cell: ({ row }) => (
        <span className="font-mono text-xs text-slate-300">
          {formatRupiah(row.original.buyPrice)}
        </span>
      ),
    },
    {
      accessorKey: 'sellPrice',
      header: 'Harga Jual',
      enableSorting: true,
      meta: { align: 'right' as const },
      cell: ({ row }) => (
        <span className="font-mono text-xs text-emerald-400">
          {formatRupiah(row.original.sellPrice)}
        </span>
      ),
    },
    {
      accessorKey: 'minStock',
      header: 'Min. Stok',
      enableSorting: true,
      meta: { align: 'right' as const },
      cell: ({ row }) => (
        <span className="font-mono text-xs text-slate-300">
          {row.original.minStock} {row.original.unit}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Aksi',
      enableSorting: false,
      meta: { align: 'right' as const },
      cell: ({ row }) =>
        canManage ? (
          <div className="space-x-2 inline-flex">
            <button
              onClick={() => openEditModal(row.original)}
              className="text-slate-400 hover:text-sky-400 p-1.5 rounded hover:bg-slate-800 transition"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setDeleteTarget(row.original)}
              className="text-slate-400 hover:text-red-400 p-1.5 rounded hover:bg-slate-800 transition"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ) : null,
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Package className="text-sky-400 w-7 h-7" />
              Katalog Produk
            </h1>
            <p className="text-slate-400 text-sm">Master data produk, SKU, dan harga jual/beli</p>
          </div>
          {canManage && (
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 bg-sky-600 hover:bg-sky-500 text-white font-medium px-4 py-2.5 rounded-lg shadow-lg shadow-sky-600/20 transition"
            >
              <Plus className="w-5 h-5" />
              <span>Tambah Produk</span>
            </button>
          )}
        </div>

        {/* Toolbar */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col sm:flex-row items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Cari nama atau SKU produk..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-sky-500 text-sm w-full sm:w-48"
          >
            <option value="">Semua Kategori</option>
            {sortedCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Data Table */}
        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading || isFetching}
          emptyMessage="Tidak ada data produk ditemukan"
          page={page}
          totalPages={data?.meta?.totalPages}
          totalItems={data?.meta?.totalItems}
          onPageChange={setPage}
          sorting={sorting}
          onSortingChange={(next) => {
            setSorting(next);
            setPage(1);
          }}
          entityLabel="produk"
        />
      </div>

      {/* Modal Dialog Form */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingProduct ? 'Edit Produk' : 'Tambah Produk Baru'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm flex items-start gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">SKU (Opsional)</label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="Auto jika kosong (misal: SKU-0001)"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Barcode (Opsional)
              </label>
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="899xxxxxxxxx"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 text-xs font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Nama Produk</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Laptop ASUS VivoBook 14"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Kategori</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-sky-500"
              >
                {categoryId === '' && <option value="">-- Pilih Kategori --</option>}
                {sortedCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Satuan Unit</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-sky-500"
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Harga Beli (Rp)</label>
              <input
                type="number"
                min={0}
                value={buyPrice}
                onChange={(e) => setBuyPrice(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-sky-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Harga Jual (Rp)</label>
              <input
                type="number"
                min={0}
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-sky-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Min. Stok (Auto-PO)
              </label>
              <input
                type="number"
                min={0}
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-sky-500 font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={closeModal}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
            >
              {createMutation.isPending || updateMutation.isPending ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Konfirmasi Hapus */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Hapus Produk"
        description={`Apakah Anda yakin ingin menghapus produk "${deleteTarget?.name}" (${deleteTarget?.sku})? Produk dengan riwayat stok tidak dapat dihapus.`}
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </DashboardLayout>
  );
}
