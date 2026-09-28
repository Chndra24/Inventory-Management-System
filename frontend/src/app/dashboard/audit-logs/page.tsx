'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { type ColumnDef, type SortingState } from '@tanstack/react-table';
import { DashboardLayout } from '@/components/dashboard-layout';
import { Modal } from '@/components/ui/modal';
import { DataTable } from '@/components/ui/data-table';
import { apiClient } from '@/lib/api-client';
import type { AuditLog, AuditLogResponse } from '@/types';
import { ScrollText, Search, Eye, FilterX } from 'lucide-react';

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function AuditLogsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }]);

  const [detailLog, setDetailLog] = useState<AuditLog | null>(null);

  const sortBy = sorting[0]?.id;
  const sortOrder = sorting[0] ? (sorting[0].desc ? 'desc' : 'asc') : undefined;

  const { data, isLoading, isFetching } = useQuery<AuditLogResponse>({
    queryKey: ['audit-logs', page, search, actionFilter, entityFilter, startDate, endDate, sortBy, sortOrder],
    queryFn: async () => {
      const res = await apiClient.get('/audit-logs', {
        params: {
          page,
          limit: 10,
          search,
          action: actionFilter || undefined,
          entity: entityFilter || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          sortBy,
          sortOrder,
        },
      });
      return res.data;
    },
  });

  const hasFilter =
    !!actionFilter || !!entityFilter || !!startDate || !!endDate || !!search;

  const clearFilters = () => {
    setSearch('');
    setActionFilter('');
    setEntityFilter('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const getActionBadge = (action: string) => {
    if (action.startsWith('CREATE') || action === 'LOGIN') {
      return (
        <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded text-xs font-mono font-semibold">
          {action}
        </span>
      );
    }
    if (action.startsWith('UPDATE') || action === 'LOGOUT') {
      return (
        <span className="bg-sky-500/10 text-sky-400 border border-sky-500/30 px-2.5 py-1 rounded text-xs font-mono font-semibold">
          {action}
        </span>
      );
    }
    if (action.startsWith('DELETE') || action === 'LOGIN_FAILED' || action === 'RESET_PASSWORD') {
      return (
        <span className="bg-red-500/10 text-red-400 border border-red-500/30 px-2.5 py-1 rounded text-xs font-mono font-semibold">
          {action}
        </span>
      );
    }
    return (
      <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded text-xs font-mono font-semibold">
        {action}
      </span>
    );
  };

  const columns: ColumnDef<AuditLog, any>[] = [
    {
      accessorKey: 'createdAt',
      header: 'Waktu',
      enableSorting: true,
      cell: ({ row }) => (
        <span className="text-xs font-mono text-slate-400 whitespace-nowrap">
          {formatDateTime(row.original.createdAt)}
        </span>
      ),
    },
    {
      id: 'user',
      header: 'Pelaku (User)',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.user ? (
          <div className="text-xs">
            <div className="font-medium text-white">{row.original.user.name}</div>
            <div className="text-slate-500">{row.original.user.email}</div>
          </div>
        ) : (
          <span className="text-xs text-slate-500 italic">Sistem</span>
        ),
    },
    {
      accessorKey: 'action',
      header: 'Aksi',
      enableSorting: true,
      cell: ({ row }) => getActionBadge(row.original.action),
    },
    {
      accessorKey: 'entity',
      header: 'Entitas',
      enableSorting: true,
      cell: ({ row }) => (
        <div className="text-xs">
          <div className="text-slate-300 font-mono">{row.original.entity}</div>
          {row.original.entityId && (
            <div className="text-slate-500 font-mono truncate max-w-[140px]">
              {row.original.entityId}
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'payload',
      header: 'Payload',
      enableSorting: false,
      meta: { align: 'right' as const },
      cell: ({ row }) => (
        <button
          onClick={() => setDetailLog(row.original)}
          className="inline-flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-sky-400 font-medium px-3 py-1.5 rounded-lg border border-slate-700 transition"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Lihat Detail</span>
        </button>
      ),
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ScrollText className="text-sky-400 w-7 h-7" />
            Log Audit Sistem (Audit Trail)
          </h1>
          <p className="text-slate-400 text-sm">
            Jejak lengkap siapa melakukan apa, kapan, dan dengan data apa
          </p>
        </div>

        {/* Toolbar Filter */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-4">
          <div className="flex flex-col md:flex-row items-center gap-4">
            <div className="relative flex-1 w-full">
              <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Cari aksi, entitas, ID entitas, atau nama/email pelaku..."
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
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-sky-500 text-sm"
              >
                <option value="">Semua Aksi</option>
                {data?.filters?.actions?.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>

              <select
                value={entityFilter}
                onChange={(e) => {
                  setEntityFilter(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-sky-500 text-sm"
              >
                <option value="">Semua Entitas</option>
                {data?.filters?.entities?.map((en) => (
                  <option key={en} value={en}>
                    {en}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400">Dari</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-sky-500 text-xs font-mono"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400">Sampai</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-sky-500 text-xs font-mono"
              />
            </div>

            {hasFilter && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700 transition"
              >
                <FilterX className="w-3.5 h-3.5" />
                <span>Reset Filter</span>
              </button>
            )}
          </div>
        </div>

        {/* Data Table */}
        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading || isFetching}
          emptyMessage="Tidak ada log audit ditemukan"
          page={page}
          totalPages={data?.meta?.totalPages}
          totalItems={data?.meta?.totalItems}
          onPageChange={setPage}
          sorting={sorting}
          onSortingChange={(next) => {
            setSorting(next);
            setPage(1);
          }}
          entityLabel="log"
        />
      </div>

      {/* Modal Detail Payload */}
      <Modal
        isOpen={!!detailLog}
        onClose={() => setDetailLog(null)}
        title={`Detail Log - ${detailLog?.action ?? ''} ${detailLog?.entity ?? ''}`}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-slate-500 text-xs mb-1">Waktu</div>
              <div className="text-slate-200 font-mono text-xs">
                {detailLog ? formatDateTime(detailLog.createdAt) : '-'}
              </div>
            </div>
            <div>
              <div className="text-slate-500 text-xs mb-1">Pelaku</div>
              <div className="text-slate-200 text-xs">
                {detailLog?.user
                  ? `${detailLog.user.name} (${detailLog.user.email})`
                  : 'Sistem'}
              </div>
            </div>
            <div>
              <div className="text-slate-500 text-xs mb-1">Entitas</div>
              <div className="text-slate-200 font-mono text-xs">{detailLog?.entity}</div>
            </div>
            <div>
              <div className="text-slate-500 text-xs mb-1">Entity ID</div>
              <div className="text-slate-200 font-mono text-xs break-all">
                {detailLog?.entityId || '-'}
              </div>
            </div>
          </div>

          <div>
            <div className="text-slate-500 text-xs mb-2">Payload (data terkait)</div>
            <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-300 font-mono overflow-x-auto max-h-72 overflow-y-auto whitespace-pre-wrap break-all">
              {detailLog?.payload
                ? JSON.stringify(detailLog.payload, null, 2)
                : '(tidak ada payload)'}
            </pre>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setDetailLog(null)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition"
            >
              Tutup
            </button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
