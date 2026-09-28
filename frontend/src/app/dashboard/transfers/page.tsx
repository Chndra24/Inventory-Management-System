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
import { transferSchema } from '@/lib/schemas';
import { apiErrorMessage } from '@/lib/utils';
import type { StockTransfer, PaginatedResponse, Warehouse, Product } from '@/types';
import {
  ArrowRightLeft,
  Plus,
  Search,
  Truck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Trash2,
} from 'lucide-react';

interface StatusConfirmState {
  id: string;
  transferNumber: string;
  status: string;
  actionLabel: string;
}

export default function StockTransfersPage() {
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const canManage = can(role, 'manageTransfers');

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<{ productId: string; quantity: number }[]>([
    { productId: '', quantity: 1 },
  ]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusConfirm, setStatusConfirm] = useState<StatusConfirmState | null>(null);

  const sortBy = sorting[0]?.id;
  const sortOrder = sorting[0] ? (sorting[0].desc ? 'desc' : 'asc') : undefined;

  // Fetch Warehouses & Products for form
  const { data: warehousesData } = useQuery<PaginatedResponse<Warehouse>>({
    queryKey: ['warehouses-list'],
    queryFn: async () => {
      const res = await apiClient.get('/warehouses', { params: { limit: 100 } });
      return res.data;
    },
  });

  const { data: productsData } = useQuery<PaginatedResponse<Product>>({
    queryKey: ['products-list'],
    queryFn: async () => {
      const res = await apiClient.get('/products', { params: { limit: 100 } });
      return res.data;
    },
  });

  // Fetch Stock Transfers
  const { data, isLoading, isFetching } = useQuery<PaginatedResponse<StockTransfer>>({
    queryKey: ['transfers', page, search, statusFilter, sortBy, sortOrder],
    queryFn: async () => {
      const res = await apiClient.get('/transfers', {
        params: {
          page,
          limit: 10,
          search,
          status: statusFilter || undefined,
          sortBy,
          sortOrder,
        },
      });
      return res.data;
    },
  });

  // Create Transfer Mutation
  const createMutation = useMutation({
    mutationFn: async (payload: {
      fromWarehouseId: string;
      toWarehouseId: string;
      notes?: string;
      items: { productId: string; quantity: number }[];
    }) => {
      const res = await apiClient.post('/transfers', payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Dokumen transfer (DRAFT) berhasil dibuat');
      invalidateList(queryClient, 'transfers');
      closeModal();
    },
    onError: (err) => setErrorMessage(apiErrorMessage(err, 'Gagal membuat dokumen transfer')),
  });

  // Update Status Mutation
  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiClient.put(`/transfers/${id}/status`, { status });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Status transfer berhasil diperbarui');
      invalidateList(queryClient, ['transfers', 'inventory-overview', 'stock-movements']);
      setStatusConfirm(null);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal memperbarui status transfer')),
  });

  const openCreateModal = () => {
    const whList = warehousesData?.data || [];
    setFromWarehouseId(whList[0]?.id || '');
    setToWarehouseId(whList[1]?.id || whList[0]?.id || '');
    setNotes('');
    setItems([{ productId: productsData?.data?.[0]?.id || '', quantity: 1 }]);
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setErrorMessage(null);
  };

  const addItemRow = () => {
    const firstProd = productsData?.data?.[0]?.id || '';
    setItems([...items, { productId: firstProd, quantity: 1 }]);
  };

  const removeItemRow = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItemRow = (index: number, field: 'productId' | 'quantity', value: string | number) => {
    const newItems = [...items];
    if (field === 'productId') {
      newItems[index].productId = String(value);
    } else {
      newItems[index].quantity = Number(value);
    }
    setItems(newItems);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = transferSchema.safeParse({
      fromWarehouseId,
      toWarehouseId,
      notes,
      items: items.map((i) => ({ productId: i.productId, quantity: Number(i.quantity) })),
    });
    if (!parsed.success) {
      setErrorMessage(parsed.error.issues[0].message);
      return;
    }
    setErrorMessage(null);
    createMutation.mutate(parsed.data);
  };

  const requestStatusChange = (
    transfer: StockTransfer,
    newStatus: string,
    actionLabel: string,
  ) => {
    setStatusConfirm({
      id: transfer.id,
      transferNumber: transfer.transferNumber,
      status: newStatus,
      actionLabel,
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return (
          <span className="bg-slate-800 text-slate-300 border border-slate-700 px-2.5 py-1 rounded text-xs font-mono">
            DRAFT
          </span>
        );
      case 'IN_TRANSIT':
        return (
          <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded text-xs font-mono font-semibold">
            IN-TRANSIT (DIKIRIM)
          </span>
        );
      case 'RECEIVED':
        return (
          <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded text-xs font-mono font-semibold">
            RECEIVED (DITERIMA)
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="bg-red-500/10 text-red-400 border border-red-500/30 px-2.5 py-1 rounded text-xs font-mono">
            CANCELLED
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  const columns: ColumnDef<StockTransfer, any>[] = [
    {
      accessorKey: 'transferNumber',
      header: 'No. Transfer',
      enableSorting: true,
      cell: ({ row }) => (
        <span className="font-mono font-semibold text-sky-400">{row.original.transferNumber}</span>
      ),
    },
    {
      id: 'route',
      header: 'Rute Gudang',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5 text-xs font-medium text-white">
          <span>{row.original.fromWarehouse?.name}</span>
          <ArrowRightLeft className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
          <span className="text-emerald-400">{row.original.toWarehouse?.name}</span>
        </div>
      ),
    },
    {
      id: 'items',
      header: 'Item Barang',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="bg-slate-800 text-slate-300 px-2.5 py-1 rounded border border-slate-700 text-xs font-mono">
          {row.original._count?.items || 0} macam barang
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status Workflow',
      enableSorting: true,
      cell: ({ row }) => getStatusBadge(row.original.status),
    },
    {
      accessorKey: 'notes',
      header: 'Catatan',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-xs text-slate-400">{row.original.notes || '-'}</span>
      ),
    },
    {
      id: 'actions',
      header: 'Aksi Workflow',
      enableSorting: false,
      meta: { align: 'right' as const },
      cell: ({ row }) => {
        const trf = row.original;
        if (!canManage && trf.status !== 'IN_TRANSIT') {
          return <span className="text-xs text-slate-500 italic">-</span>;
        }
        return (
          <div className="space-x-2 inline-flex items-center whitespace-nowrap">
            {canManage && trf.status === 'DRAFT' && (
              <>
                <button
                  onClick={() => requestStatusChange(trf, 'IN_TRANSIT', 'DIKIRIM (In-Transit)')}
                  className="text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 px-3 py-1.5 rounded-lg font-medium transition inline-flex items-center gap-1"
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>Kirim Barang</span>
                </button>
                <button
                  onClick={() => requestStatusChange(trf, 'CANCELLED', 'BATAL')}
                  className="text-xs text-slate-400 hover:text-red-400 p-1.5 rounded hover:bg-slate-800 transition"
                  title="Batalkan Transfer"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </>
            )}

            {canManage && trf.status === 'IN_TRANSIT' && (
              <button
                onClick={() => requestStatusChange(trf, 'RECEIVED', 'DITERIMA (Received)')}
                className="text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-lg font-medium transition inline-flex items-center gap-1"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Konfirmasi Terima</span>
              </button>
            )}

            {(trf.status === 'RECEIVED' || trf.status === 'CANCELLED') && (
              <span className="text-xs text-slate-500 italic">Selesai</span>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <ArrowRightLeft className="text-sky-400 w-7 h-7" />
              Transfer Stok Antar-Gudang
            </h1>
            <p className="text-slate-400 text-sm">
              Pengelolaan alur pemindahan stok barang antar gudang fisik
            </p>
          </div>
          {canManage && (
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 bg-sky-600 hover:bg-sky-500 text-white font-medium px-4 py-2.5 rounded-lg shadow-lg shadow-sky-600/20 transition"
            >
              <Plus className="w-5 h-5" />
              <span>Buat Transfer Baru</span>
            </button>
          )}
        </div>

        {/* Toolbar */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col sm:flex-row items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Cari nomor transfer (TRF-...), nama gudang, atau catatan..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-sky-500 text-sm w-full sm:w-48"
          >
            <option value="">Semua Status</option>
            <option value="DRAFT">DRAFT</option>
            <option value="IN_TRANSIT">IN-TRANSIT</option>
            <option value="RECEIVED">RECEIVED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
        </div>

        {/* Data Table */}
        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading || isFetching}
          emptyMessage="Tidak ada dokumen transfer ditemukan"
          page={page}
          totalPages={data?.meta?.totalPages}
          totalItems={data?.meta?.totalItems}
          onPageChange={setPage}
          sorting={sorting}
          onSortingChange={(next) => {
            setSorting(next);
            setPage(1);
          }}
          entityLabel="dokumen transfer"
        />
      </div>

      {/* Create Stock Transfer Modal Dialog */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title="Buat Dokumen Transfer Stok Antar-Gudang (DRAFT)"
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
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Gudang Asal (Source)
              </label>
              <select
                required
                value={fromWarehouseId}
                onChange={(e) => setFromWarehouseId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-sky-500"
              >
                {warehousesData?.data?.map((wh) => (
                  <option key={wh.id} value={wh.id}>
                    {wh.name} ({wh.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Gudang Tujuan (Destination)
              </label>
              <select
                required
                value={toWarehouseId}
                onChange={(e) => setToWarehouseId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-sky-500"
              >
                {warehousesData?.data?.map((wh) => (
                  <option key={wh.id} value={wh.id}>
                    {wh.name} ({wh.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-300">
                Daftar Barang yang Dipindahkan
              </label>
              <button
                type="button"
                onClick={addItemRow}
                className="text-xs text-sky-400 hover:text-sky-300 font-medium flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Item</span>
              </button>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 bg-slate-950 p-2 border border-slate-800 rounded-lg"
                >
                  <select
                    required
                    value={item.productId}
                    onChange={(e) => updateItemRow(idx, 'productId', e.target.value)}
                    className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-white text-xs focus:outline-none focus:border-sky-500"
                  >
                    {productsData?.data?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.sku})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    required
                    min={1}
                    value={item.quantity}
                    onChange={(e) => updateItemRow(idx, 'quantity', Number(e.target.value))}
                    className="w-24 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-white text-xs focus:outline-none focus:border-sky-500 font-mono"
                    placeholder="Qty"
                  />
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItemRow(idx)}
                      className="text-slate-500 hover:text-red-400 p-1 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Catatan Tambahan (Opsional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Permintaan stok toko cabang untuk pameran"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
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
              disabled={createMutation.isPending}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
            >
              {createMutation.isPending ? 'Membuat DRAFT...' : 'Buat Dokumen Transfer'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Konfirmasi Ubah Status */}
      <ConfirmDialog
        open={!!statusConfirm}
        onOpenChange={(open) => !open && setStatusConfirm(null)}
        title="Ubah Status Transfer"
        description={`Apakah Anda yakin ingin memproses transfer "${statusConfirm?.transferNumber}" menjadi ${statusConfirm?.actionLabel}?`}
        confirmLabel="Ya"
        variant="primary"
        loading={statusMutation.isPending}
        onConfirm={() =>
          statusConfirm &&
          statusMutation.mutate({ id: statusConfirm.id, status: statusConfirm.status })
        }
      />
    </DashboardLayout>
  );
}
