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
import { createUserSchema, updateUserSchema, resetPasswordSchema } from '@/lib/schemas';
import { apiErrorMessage } from '@/lib/utils';
import type { UserListItem, Role, PaginatedResponse } from '@/types';
import { UserCog, Plus, Search, Edit2, Trash2, KeyRound, AlertCircle } from 'lucide-react';

type ModalMode = 'create' | 'edit' | 'reset';

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { role, user: currentUser } = useAuth();
  const canManage = can(role, 'manageUsers');

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }]);

  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [targetUser, setTargetUser] = useState<UserListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserListItem | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [roleId, setRoleId] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sortBy = sorting[0]?.id;
  const sortOrder = sorting[0] ? (sorting[0].desc ? 'desc' : 'asc') : undefined;

  // Daftar role untuk dropdown (endpoint SUPER_ADMIN)
  const { data: roles } = useQuery<Role[]>({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await apiClient.get('/auth/roles');
      return res.data;
    },
    enabled: canManage,
  });

  const { data, isLoading, isFetching } = useQuery<PaginatedResponse<UserListItem>>({
    queryKey: ['users', page, search, sortBy, sortOrder],
    queryFn: async () => {
      const res = await apiClient.get('/users', {
        params: { page, limit: 10, search, sortBy, sortOrder },
      });
      return res.data;
    },
    enabled: canManage,
  });

  const invalidate = () => invalidateList(queryClient, 'users');

  const createMutation = useMutation({
    mutationFn: async (payload: { name: string; email: string; password: string; roleId: string }) => {
      const res = await apiClient.post('/users', payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Pengguna berhasil ditambahkan');
      invalidate();
      closeModal();
    },
    onError: (err) => setErrorMessage(apiErrorMessage(err, 'Gagal menambahkan pengguna')),
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: { name: string; email: string; roleId: string };
    }) => {
      const res = await apiClient.put(`/users/${id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Pengguna berhasil diperbarui');
      invalidate();
      closeModal();
    },
    onError: (err) => setErrorMessage(apiErrorMessage(err, 'Gagal mengedit pengguna')),
  });

  const resetMutation = useMutation({
    mutationFn: async ({ id, newPassword: np }: { id: string; newPassword: string }) => {
      const res = await apiClient.put(`/users/${id}/password`, { newPassword: np });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Kata sandi pengguna berhasil direset');
      closeModal();
    },
    onError: (err) => setErrorMessage(apiErrorMessage(err, 'Gagal reset kata sandi')),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.delete(`/users/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Pengguna berhasil dihapus');
      invalidate();
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menghapus pengguna')),
  });

  const closeModal = () => {
    setModalMode(null);
    setTargetUser(null);
    setName('');
    setEmail('');
    setPassword('');
    setNewPassword('');
    setRoleId('');
    setErrorMessage(null);
  };

  const openCreateModal = () => {
    setTargetUser(null);
    setName('');
    setEmail('');
    setPassword('');
    setRoleId(roles?.[0]?.id || '');
    setErrorMessage(null);
    setModalMode('create');
  };

  const openEditModal = (u: UserListItem) => {
    setTargetUser(u);
    setName(u.name);
    setEmail(u.email);
    setRoleId(u.roleId);
    setErrorMessage(null);
    setModalMode('edit');
  };

  const openResetModal = (u: UserListItem) => {
    setTargetUser(u);
    setNewPassword('');
    setErrorMessage(null);
    setModalMode('reset');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (modalMode === 'create') {
      const parsed = createUserSchema.safeParse({ name, email, password, roleId });
      if (!parsed.success) {
        setErrorMessage(parsed.error.issues[0].message);
        return;
      }
      createMutation.mutate(parsed.data);
    } else if (modalMode === 'edit' && targetUser) {
      const parsed = updateUserSchema.safeParse({ name, email, roleId });
      if (!parsed.success) {
        setErrorMessage(parsed.error.issues[0].message);
        return;
      }
      updateMutation.mutate({ id: targetUser.id, payload: parsed.data });
    } else if (modalMode === 'reset' && targetUser) {
      const parsed = resetPasswordSchema.safeParse({ newPassword });
      if (!parsed.success) {
        setErrorMessage(parsed.error.issues[0].message);
        return;
      }
      resetMutation.mutate({ id: targetUser.id, newPassword: parsed.data.newPassword });
    }
  };

  const getRoleBadge = (roleName: string) => {
    switch (roleName) {
      case 'SUPER_ADMIN':
        return (
          <span className="bg-red-500/10 text-red-400 border border-red-500/30 px-2.5 py-1 rounded text-xs font-mono font-semibold">
            SUPER ADMIN
          </span>
        );
      case 'WAREHOUSE_MANAGER':
        return (
          <span className="bg-sky-500/10 text-sky-400 border border-sky-500/30 px-2.5 py-1 rounded text-xs font-mono font-semibold">
            WAREHOUSE MANAGER
          </span>
        );
      case 'SALES_SPECIALIST':
        return (
          <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded text-xs font-mono font-semibold">
            SALES SPECIALIST
          </span>
        );
      case 'PURCHASING_OFFICER':
        return (
          <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded text-xs font-mono font-semibold">
            PURCHASING OFFICER
          </span>
        );
      case 'FINANCE_OFFICER':
        return (
          <span className="bg-violet-500/10 text-violet-400 border border-violet-500/30 px-2.5 py-1 rounded text-xs font-mono font-semibold">
            FINANCE OFFICER
          </span>
        );
      default:
        return <span className="text-slate-400 text-xs font-mono">{roleName}</span>;
    }
  };

  const columns: ColumnDef<UserListItem, any>[] = [
    {
      accessorKey: 'name',
      header: 'Nama',
      enableSorting: true,
      cell: ({ row }) => (
        <div>
          <div className="font-medium text-white">{row.original.name}</div>
          {row.original.id === currentUser?.id && (
            <div className="text-xs text-sky-400">(Anda)</div>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'email',
      header: 'Email',
      enableSorting: true,
      cell: ({ row }) => <span className="text-slate-300 text-xs">{row.original.email}</span>,
    },
    {
      id: 'role',
      header: 'Role',
      enableSorting: false,
      cell: ({ row }) => getRoleBadge(row.original.role?.name),
    },
    {
      accessorKey: 'createdAt',
      header: 'Dibuat',
      enableSorting: true,
      cell: ({ row }) => (
        <span className="text-xs font-mono text-slate-400 whitespace-nowrap">
          {new Date(row.original.createdAt).toLocaleDateString('id-ID', {
            dateStyle: 'medium',
          })}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Aksi',
      enableSorting: false,
      meta: { align: 'right' as const },
      cell: ({ row }) => {
        const isSelf = row.original.id === currentUser?.id;
        return (
          <div className="space-x-2 inline-flex">
            <button
              onClick={() => openEditModal(row.original)}
              className="text-slate-400 hover:text-sky-400 p-1.5 rounded hover:bg-slate-800 transition"
              title="Edit pengguna"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => openResetModal(row.original)}
              className="text-slate-400 hover:text-amber-400 p-1.5 rounded hover:bg-slate-800 transition"
              title="Reset kata sandi"
            >
              <KeyRound className="w-4 h-4" />
            </button>
            {!isSelf && (
              <button
                onClick={() => setDeleteTarget(row.original)}
                className="text-slate-400 hover:text-red-400 p-1.5 rounded hover:bg-slate-800 transition"
                title="Hapus pengguna"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        );
      },
    },
  ];

  const modalTitle =
    modalMode === 'create'
      ? 'Tambah Pengguna Baru'
      : modalMode === 'edit'
        ? `Edit Pengguna - ${targetUser?.name ?? ''}`
        : `Reset Kata Sandi - ${targetUser?.email ?? ''}`;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <UserCog className="text-sky-400 w-7 h-7" />
              Manajemen Pengguna & Role
            </h1>
            <p className="text-slate-400 text-sm">
              Kelola akun pengguna, penugasan role, dan reset kata sandi
            </p>
          </div>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 bg-sky-600 hover:bg-sky-500 text-white font-medium px-4 py-2.5 rounded-lg shadow-lg shadow-sky-600/20 transition"
          >
            <Plus className="w-5 h-5" />
            <span>Tambah Pengguna</span>
          </button>
        </div>

        {/* Toolbar */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Cari nama, email, atau role..."
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
          emptyMessage="Tidak ada data pengguna ditemukan"
          page={page}
          totalPages={data?.meta?.totalPages}
          totalItems={data?.meta?.totalItems}
          onPageChange={setPage}
          sorting={sorting}
          onSortingChange={(next) => {
            setSorting(next);
            setPage(1);
          }}
          entityLabel="pengguna"
        />
      </div>

      {/* Modal Form (create / edit / reset) */}
      <Modal isOpen={!!modalMode} onClose={closeModal} title={modalTitle}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm flex items-start gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {modalMode === 'reset' ? (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Kata Sandi Baru (min. 8 karakter)
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimal 8 karakter"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Nama Lengkap</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Budi Santoso"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="budi@erp.com"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Role</label>
                <select
                  required
                  value={roleId}
                  onChange={(e) => setRoleId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-sky-500"
                >
                  <option value="">-- Pilih Role --</option>
                  {roles?.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              {modalMode === 'create' && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Kata Sandi Awal (min. 8 karakter)
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimal 8 karakter"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                  />
                </div>
              )}
            </>
          )}

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
              disabled={
                createMutation.isPending || updateMutation.isPending || resetMutation.isPending
              }
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
            >
              {createMutation.isPending || updateMutation.isPending || resetMutation.isPending
                ? 'Menyimpan...'
                : 'Simpan'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Konfirmasi Hapus */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Hapus Pengguna"
        description={`Apakah Anda yakin ingin menghapus pengguna "${deleteTarget?.name}" (${deleteTarget?.email})? Pengguna tidak dapat mengakses sistem setelah dihapus.`}
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </DashboardLayout>
  );
}
