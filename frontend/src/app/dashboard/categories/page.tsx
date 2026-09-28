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
import { categorySchema } from '@/lib/schemas';
import { apiErrorMessage } from '@/lib/utils';
import type { Category, PaginatedResponse } from '@/types';
import { Layers, Plus, Search, Edit2, Trash2, AlertCircle } from 'lucide-react';

export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const canManage = can(role, 'manageCategories');

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sortBy = sorting[0]?.id;
  const sortOrder = sorting[0] ? (sorting[0].desc ? 'desc' : 'asc') : undefined;

  const { data, isLoading, isFetching } = useQuery<PaginatedResponse<Category>>({
    queryKey: ['categories', page, search, sortBy, sortOrder],
    queryFn: async () => {
      const res = await apiClient.get('/categories', {
        params: { page, limit: 10, search, sortBy, sortOrder },
      });
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: { name: string }) => {
      const res = await apiClient.post('/categories', payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Kategori berhasil ditambahkan');
      invalidateList(queryClient, 'categories');
      closeModal();
    },
    onError: (err) => setErrorMessage(apiErrorMessage(err, 'Gagal menambahkan kategori')),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: { name: string } }) => {
      const res = await apiClient.put(`/categories/${id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Kategori berhasil diperbarui');
      invalidateList(queryClient, 'categories');
      closeModal();
    },
    onError: (err) => setErrorMessage(apiErrorMessage(err, 'Gagal mengedit kategori')),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.delete(`/categories/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Kategori berhasil dihapus');
      invalidateList(queryClient, 'categories');
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menghapus kategori')),
  });

  const openCreateModal = () => {
    setEditingCategory(null);
    setName('');
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const openEditModal = (category: Category) => {
    setEditingCategory(category);
    setName(category.name);
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingCategory(null);
    setName('');
    setErrorMessage(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = categorySchema.safeParse({ name });
    if (!parsed.success) {
      setErrorMessage(parsed.error.issues[0].message);
      return;
    }
    setErrorMessage(null);
    if (editingCategory) {
      updateMutation.mutate({ id: editingCategory.id, payload: parsed.data });
    } else {
      createMutation.mutate(parsed.data);
    }
  };

  const columns: ColumnDef<Category, any>[] = [
    {
      accessorKey: 'name',
      header: 'Nama Kategori',
      enableSorting: true,
      cell: ({ row }) => <span className="font-medium text-white">{row.original.name}</span>,
    },
    {
      accessorKey: 'slug',
      header: 'Slug',
      enableSorting: true,
      cell: ({ row }) => <span className="text-slate-400 font-mono text-xs">{row.original.slug}</span>,
    },
    {
      id: 'productCount',
      header: 'Jumlah Produk',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="bg-slate-800 text-sky-400 px-2.5 py-1 rounded border border-slate-700 font-mono text-xs">
          {row.original._count?.products || 0} produk
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
              <Layers className="text-sky-400 w-7 h-7" />
              Manajemen Kategori
            </h1>
            <p className="text-slate-400 text-sm">Kelola kategori pengelompokan produk</p>
          </div>
          {canManage && (
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 bg-sky-600 hover:bg-sky-500 text-white font-medium px-4 py-2.5 rounded-lg shadow-lg shadow-sky-600/20 transition"
            >
              <Plus className="w-5 h-5" />
              <span>Tambah Kategori</span>
            </button>
          )}
        </div>

        {/* Toolbar */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Cari nama atau slug kategori..."
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
          emptyMessage="Tidak ada data kategori ditemukan"
          page={page}
          totalPages={data?.meta?.totalPages}
          totalItems={data?.meta?.totalItems}
          onPageChange={setPage}
          sorting={sorting}
          onSortingChange={(next) => {
            setSorting(next);
            setPage(1);
          }}
          entityLabel="kategori"
        />
      </div>

      {/* Modal Dialog Form */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingCategory ? 'Edit Kategori' : 'Tambah Kategori Baru'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm flex items-start gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Nama Kategori</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Elektronik, Pakaian, Aksesoris"
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
        title="Hapus Kategori"
        description={`Apakah Anda yakin ingin menghapus kategori "${deleteTarget?.name}"? Tindakan ini tidak dapat dibatalkan.`}
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </DashboardLayout>
  );
}
