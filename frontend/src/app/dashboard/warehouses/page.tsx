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
import { warehouseSchema } from '@/lib/schemas';
import { apiErrorMessage } from '@/lib/utils';
import type { Warehouse, PaginatedResponse } from '@/types';
import { Warehouse as WarehouseIcon, Plus, Search, Edit2, Trash2, AlertCircle } from 'lucide-react';

export default function WarehousesPage() {
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const canManage = can(role, 'manageWarehouses');

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Warehouse | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sortBy = sorting[0]?.id;
  const sortOrder = sorting[0] ? (sorting[0].desc ? 'desc' : 'asc') : undefined;

  const { data, isLoading, isFetching } = useQuery<PaginatedResponse<Warehouse>>({
    queryKey: ['warehouses', page, search, sortBy, sortOrder],
    queryFn: async () => {
      const res = await apiClient.get('/warehouses', {
        params: { page, limit: 10, search, sortBy, sortOrder },
      });
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: { name: string; code?: string; address?: string }) => {
      const res = await apiClient.post('/warehouses', payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Gudang berhasil ditambahkan');
      invalidateList(queryClient, 'warehouses');
      closeModal();
    },
    onError: (err) => setErrorMessage(apiErrorMessage(err, 'Gagal menambahkan gudang')),
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: { name: string; code?: string; address?: string };
    }) => {
      const res = await apiClient.put(`/warehouses/${id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Gudang berhasil diperbarui');
      invalidateList(queryClient, 'warehouses');
      closeModal();
    },
    onError: (err) => setErrorMessage(apiErrorMessage(err, 'Gagal mengedit gudang')),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.delete(`/warehouses/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Gudang berhasil dihapus');
      invalidateList(queryClient, 'warehouses');
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menghapus gudang')),
  });

  const openCreateModal = () => {
    setEditingWarehouse(null);
    setCode('');
    setName('');
    setAddress('');
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const openEditModal = (item: Warehouse) => {
    setEditingWarehouse(item);
    setCode(item.code || '');
    setName(item.name || '');
    setAddress(item.address || '');
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingWarehouse(null);
    setErrorMessage(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = warehouseSchema.safeParse({ name, code, address });
    if (!parsed.success) {
      setErrorMessage(parsed.error.issues[0].message);
      return;
    }
    setErrorMessage(null);
    const payload = {
      name: parsed.data.name,
      code: parsed.data.code?.trim() || undefined,
      address: parsed.data.address?.trim() || undefined,
    };
    if (editingWarehouse) {
      updateMutation.mutate({ id: editingWarehouse.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const columns: ColumnDef<Warehouse, any>[] = [
    {
      accessorKey: 'code',
      header: 'Kode Gudang',
      enableSorting: true,
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-sky-400">{row.original.code}</span>
      ),
    },
    {
      accessorKey: 'name',
      header: 'Nama Gudang',
      enableSorting: true,
      cell: ({ row }) => <span className="font-medium text-white">{row.original.name}</span>,
    },
    {
      id: 'address',
      header: 'Alamat',
      enableSorting: false,
      cell: ({ row }) => <span className="text-slate-400">{row.original.address || '-'}</span>,
    },
    {
      id: 'stockCount',
      header: 'Status Item',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="bg-slate-800 text-slate-300 px-2.5 py-1 rounded border border-slate-700 text-xs font-mono">
          {row.original._count?.inventories || 0} entri stok
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
              <WarehouseIcon className="text-sky-400 w-7 h-7" />
              Manajemen Gudang (Multi-Warehouse)
            </h1>
            <p className="text-slate-400 text-sm">Kelola lokasi fisik gudang penyimpanan barang</p>
          </div>
          {canManage && (
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 bg-sky-600 hover:bg-sky-500 text-white font-medium px-4 py-2.5 rounded-lg shadow-lg shadow-sky-600/20 transition"
            >
              <Plus className="w-5 h-5" />
              <span>Tambah Gudang</span>
            </button>
          )}
        </div>

        {/* Toolbar */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Cari kode, nama gudang, atau alamat..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>

        {/* Data Table */}
        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading || isFetching}
          emptyMessage="Tidak ada data gudang ditemukan"
          page={page}
          totalPages={data?.meta?.totalPages}
          totalItems={data?.meta?.totalItems}
          onPageChange={setPage}
          sorting={sorting}
          onSortingChange={(next) => {
            setSorting(next);
            setPage(1);
          }}
          entityLabel="gudang"
        />
      </div>

      {/* Modal Dialog Form */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingWarehouse ? 'Edit Gudang' : 'Tambah Gudang Baru'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm flex items-start gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Nama Gudang</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Gudang Utama Jakarta"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Kode Gudang (Opsional)
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Auto jika kosong (misal: WH-001)"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 text-xs font-mono"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Alamat Gudang (Opsional)
            </label>
            <textarea
              rows={3}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Alamat lengkap lokasi gudang fisik"
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
        title="Hapus Gudang"
        description={`Apakah Anda yakin ingin menghapus gudang "${deleteTarget?.name}" (${deleteTarget?.code})? Gudang dengan riwayat stok/transaksi tidak dapat dihapus.`}
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </DashboardLayout>
  );
}
