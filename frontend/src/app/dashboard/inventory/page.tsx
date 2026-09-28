'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { type ColumnDef, type SortingState } from '@tanstack/react-table';
import { toast } from 'sonner';
import { DashboardLayout } from '@/components/dashboard-layout';
import { Modal } from '@/components/ui/modal';
import { DataTable } from '@/components/ui/data-table';
import { apiClient } from '@/lib/api-client';
import { can } from '@/lib/permissions';
import { invalidateList } from '@/lib/query-invalidation';
import { useAuth } from '@/lib/use-auth';
import { adjustStockSchema } from '@/lib/schemas';
import { apiErrorMessage } from '@/lib/utils';
import type {
  InventoryOverviewItem,
  PaginatedResponse,
  Warehouse,
} from '@/types';
import {
  Boxes,
  Search,
  SlidersHorizontal,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

export default function InventoryOverviewPage() {
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const canAdjust = can(role, 'adjustStock');

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [warehouseId, setWarehouseId] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }]);

  // Adjustment Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<InventoryOverviewItem | null>(null);
  const [adjWarehouseId, setAdjWarehouseId] = useState('');
  const [adjType, setAdjType] = useState<'IN' | 'OUT'>('IN');
  const [adjQuantity, setAdjQuantity] = useState(1);
  const [adjReason, setAdjReason] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sortBy = sorting[0]?.id;
  const sortOrder = sorting[0] ? (sorting[0].desc ? 'desc' : 'asc') : undefined;

  // Fetch Warehouses for filter & modal
  const { data: warehousesData } = useQuery<PaginatedResponse<Warehouse>>({
    queryKey: ['warehouses-list'],
    queryFn: async () => {
      const res = await apiClient.get('/warehouses', { params: { limit: 100 } });
      return res.data;
    },
  });

  // Fetch Inventory Overview
  const { data, isLoading, isFetching } = useQuery<PaginatedResponse<InventoryOverviewItem>>({
    queryKey: ['inventory-overview', page, search, warehouseId, lowStockOnly, sortBy, sortOrder],
    queryFn: async () => {
      const res = await apiClient.get('/inventory', {
        params: {
          page,
          limit: 10,
          search,
          warehouseId: warehouseId || undefined,
          lowStockOnly: lowStockOnly ? 'true' : undefined,
          sortBy,
          sortOrder,
        },
      });
      return res.data;
    },
  });

  // Adjust Stock Mutation
  const adjustMutation = useMutation({
    mutationFn: async (payload: {
      productId: string;
      warehouseId: string;
      type: 'IN' | 'OUT';
      quantity: number;
      reason: string;
    }) => {
      const res = await apiClient.post('/inventory/adjust', payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Penyesuaian stok berhasil disimpan');
      invalidateList(queryClient, ['inventory-overview', 'stock-movements', 'products']);
      closeModal();
    },
    onError: (err) => setErrorMessage(apiErrorMessage(err, 'Gagal melakukan penyesuaian stok')),
  });

  const openAdjustModal = (product: InventoryOverviewItem) => {
    setSelectedProduct(product);
    setAdjWarehouseId(warehousesData?.data?.[0]?.id || '');
    setAdjType('IN');
    setAdjQuantity(1);
    setAdjReason('');
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedProduct(null);
    setErrorMessage(null);
  };

  const handleAdjustSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    const parsed = adjustStockSchema.safeParse({
      productId: selectedProduct.id,
      warehouseId: adjWarehouseId,
      type: adjType,
      quantity: adjQuantity,
      reason: adjReason,
    });
    if (!parsed.success) {
      setErrorMessage(parsed.error.issues[0].message);
      return;
    }
    setErrorMessage(null);
    adjustMutation.mutate(parsed.data);
  };

  const columns: ColumnDef<InventoryOverviewItem, any>[] = [
    {
      id: 'name',
      accessorKey: 'name',
      header: 'SKU / Nama Produk',
      enableSorting: true,
      cell: ({ row }) => (
        <div>
          <div className="font-semibold text-white">{row.original.name}</div>
          <div className="font-mono text-xs text-sky-400">{row.original.sku}</div>
        </div>
      ),
    },
    {
      id: 'category',
      header: 'Kategori',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="bg-slate-800 text-slate-300 px-2.5 py-1 rounded text-xs">
          {row.original.category?.name || '-'}
        </span>
      ),
    },
    {
      id: 'totalStock',
      header: 'Total Stok',
      enableSorting: false,
      meta: { align: 'right' as const },
      cell: ({ row }) => (
        <span
          className={`px-3 py-1 rounded-full text-xs inline-flex items-center gap-1.5 border font-mono font-bold ${
            row.original.isLowStock
              ? 'bg-red-500/10 text-red-400 border-red-500/30'
              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
          }`}
        >
          {row.original.isLowStock && <AlertTriangle className="w-3.5 h-3.5" />}
          {row.original.totalStock} {row.original.unit}
        </span>
      ),
    },
    {
      accessorKey: 'minStock',
      header: 'Min. Stok',
      enableSorting: true,
      meta: { align: 'right' as const },
      cell: ({ row }) => (
        <span className="font-mono text-xs text-slate-400">
          {row.original.minStock} {row.original.unit}
        </span>
      ),
    },
    {
      id: 'warehouses',
      header: 'Rincian per Gudang',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1.5">
          {row.original.inventories?.length === 0 ? (
            <span className="text-slate-500 text-xs italic">Belum ada stok di gudang</span>
          ) : (
            row.original.inventories?.map((inv) => (
              <span
                key={inv.id}
                className="bg-slate-950 border border-slate-800 text-slate-300 px-2 py-0.5 rounded text-xs font-mono"
              >
                {inv.warehouse?.name}:{' '}
                <strong className="text-sky-400">{inv.quantity}</strong>
              </span>
            ))
          )}
        </div>
      ),
    },
    {
      id: 'actions',
      header: 'Aksi',
      enableSorting: false,
      meta: { align: 'right' as const },
      cell: ({ row }) =>
        canAdjust ? (
          <button
            onClick={() => openAdjustModal(row.original)}
            className="flex items-center gap-1.5 ml-auto text-xs bg-slate-800 hover:bg-slate-700 text-sky-400 font-medium px-3 py-1.5 rounded-lg border border-slate-700 transition"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Penyesuaian</span>
          </button>
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
              <Boxes className="text-sky-400 w-7 h-7" />
              Stock Overview & Multi-Warehouse
            </h1>
            <p className="text-slate-400 text-sm">
              Monitoring stok barang real-time & peringatan stok minimum
            </p>
          </div>
          <button
            onClick={() => invalidateList(queryClient, 'inventory-overview')}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium px-4 py-2 rounded-lg border border-slate-700 transition self-start sm:self-auto"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh Data</span>
          </button>
        </div>

        {/* Toolbar */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col md:flex-row items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Cari SKU, nama produk, atau barcode..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <select
              value={warehouseId}
              onChange={(e) => {
                setWarehouseId(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-sky-500 text-sm"
            >
              <option value="">Semua Gudang</option>
              {warehousesData?.data?.map((wh) => (
                <option key={wh.id} value={wh.id}>
                  {wh.name} ({wh.code})
                </option>
              ))}
            </select>

            <button
              onClick={() => {
                setLowStockOnly(!lowStockOnly);
                setPage(1);
              }}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border font-medium transition whitespace-nowrap ${
                lowStockOnly
                  ? 'bg-red-500/20 border-red-500/40 text-red-400'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
              <span>Stok Menipis</span>
            </button>
          </div>
        </div>

        {/* Data Table */}
        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading || isFetching}
          emptyMessage="Tidak ada data stok ditemukan"
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

      {/* Stock Adjustment Modal Form */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={`Penyesuaian Stok (Stock Adjustment) - ${selectedProduct?.name ?? ''}`}
      >
        <form onSubmit={handleAdjustSubmit} className="space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm flex items-start gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Gudang Penyimpanan
            </label>
            <select
              required
              value={adjWarehouseId}
              onChange={(e) => setAdjWarehouseId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-sky-500"
            >
              {warehousesData?.data?.map((wh) => (
                <option key={wh.id} value={wh.id}>
                  {wh.name} ({wh.code})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Aksi Penyesuaian
              </label>
              <select
                value={adjType}
                onChange={(e) => setAdjType(e.target.value as 'IN' | 'OUT')}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-sky-500 font-semibold"
              >
                <option value="IN" className="text-emerald-400">
                  ➕ TAMBAH STOK (IN)
                </option>
                <option value="OUT" className="text-red-400">
                  ➖ KURANGI STOK (OUT)
                </option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Jumlah ({selectedProduct?.unit})
              </label>
              <input
                type="number"
                required
                min={1}
                value={adjQuantity}
                onChange={(e) => setAdjQuantity(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-amber-400 mb-1 flex items-center gap-1">
              <span>Alasan Penyesuaian Stok</span>
              <span className="text-xs text-red-400 font-semibold">* (Wajib diisi)</span>
            </label>
            <textarea
              rows={3}
              required
              value={adjReason}
              onChange={(e) => setAdjReason(e.target.value)}
              placeholder="Contoh: Barang rusak saat pengiriman, Selisih opnam fisik bulanan, sampel uji coba"
              className="w-full px-3 py-2 bg-slate-950 border border-amber-500/40 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
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
              disabled={adjustMutation.isPending}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
            >
              {adjustMutation.isPending ? 'Memproses Transaksi...' : 'Simpan Penyesuaian'}
            </button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
