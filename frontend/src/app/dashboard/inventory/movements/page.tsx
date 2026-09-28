'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { type ColumnDef, type SortingState } from '@tanstack/react-table';
import { DashboardLayout } from '@/components/dashboard-layout';
import { DataTable } from '@/components/ui/data-table';
import { apiClient } from '@/lib/api-client';
import type { StockMovement, PaginatedResponse, Warehouse } from '@/types';
import {
  History,
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRightLeft,
  SlidersHorizontal,
} from 'lucide-react';

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function StockMovementsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [warehouseId, setWarehouseId] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }]);

  const sortBy = sorting[0]?.id;
  const sortOrder = sorting[0] ? (sorting[0].desc ? 'desc' : 'asc') : undefined;

  // Fetch Warehouses for filter
  const { data: warehousesData } = useQuery<PaginatedResponse<Warehouse>>({
    queryKey: ['warehouses-list'],
    queryFn: async () => {
      const res = await apiClient.get('/warehouses', { params: { limit: 100 } });
      return res.data;
    },
  });

  // Fetch Stock Movements Log
  const { data, isLoading, isFetching } = useQuery<PaginatedResponse<StockMovement>>({
    queryKey: ['stock-movements', page, search, warehouseId, typeFilter, sortBy, sortOrder],
    queryFn: async () => {
      const res = await apiClient.get('/inventory/movements', {
        params: {
          page,
          limit: 10,
          search,
          warehouseId: warehouseId || undefined,
          type: typeFilter || undefined,
          sortBy,
          sortOrder,
        },
      });
      return res.data;
    },
  });

  const getMovementBadge = (type: string) => {
    switch (type) {
      case 'IN':
        return (
          <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 w-fit">
            <ArrowDownLeft className="w-3.5 h-3.5" />
            STOK MASUK (IN)
          </span>
        );
      case 'OUT':
        return (
          <span className="bg-red-500/10 text-red-400 border border-red-500/30 px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 w-fit">
            <ArrowUpRight className="w-3.5 h-3.5" />
            STOK KELUAR (OUT)
          </span>
        );
      case 'TRANSFER':
        return (
          <span className="bg-sky-500/10 text-sky-400 border border-sky-500/30 px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 w-fit">
            <ArrowRightLeft className="w-3.5 h-3.5" />
            TRANSFER GUDANG
          </span>
        );
      case 'ADJUSTMENT':
        return (
          <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 w-fit">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            PENYESUAIAN (ADJUSTMENT)
          </span>
        );
      default:
        return <span className="text-slate-400">{type}</span>;
    }
  };

  const columns: ColumnDef<StockMovement, any>[] = [
    {
      accessorKey: 'createdAt',
      header: 'Waktu Transaksi',
      enableSorting: true,
      cell: ({ row }) => (
        <span className="text-xs font-mono text-slate-400 whitespace-nowrap">
          {formatDate(row.original.createdAt)}
        </span>
      ),
    },
    {
      accessorKey: 'type',
      header: 'Tipe Movement',
      enableSorting: true,
      cell: ({ row }) => getMovementBadge(row.original.type),
    },
    {
      id: 'product',
      header: 'Produk',
      enableSorting: false,
      cell: ({ row }) => (
        <div>
          <div className="font-semibold text-white">{row.original.product?.name}</div>
          <div className="font-mono text-xs text-sky-400">{row.original.product?.sku}</div>
        </div>
      ),
    },
    {
      id: 'warehouse',
      header: 'Gudang',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="font-medium text-slate-300">{row.original.warehouse?.name}</span>
      ),
    },
    {
      accessorKey: 'quantity',
      header: 'Jumlah (Delta)',
      enableSorting: true,
      meta: { align: 'right' as const },
      cell: ({ row }) => (
        <span
          className={`font-mono font-bold ${
            row.original.quantity > 0 ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {row.original.quantity > 0 ? `+${row.original.quantity}` : row.original.quantity}{' '}
          {row.original.product?.unit}
        </span>
      ),
    },
    {
      accessorKey: 'referenceId',
      header: 'Referensi / Alasan',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-xs text-slate-400 max-w-xs truncate block">
          {row.original.referenceId || '-'}
        </span>
      ),
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <History className="text-sky-400 w-7 h-7" />
            Log Pergerakan Stok (Stock Movements Audit Trail)
          </h1>
          <p className="text-slate-400 text-sm">
            Audit trail otomatis yang mencatat setiap arus keluar-masuk dan pemindahan barang
          </p>
        </div>

        {/* Toolbar Filter */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col md:flex-row items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Cari SKU, nama produk, gudang, atau alasan/referensi..."
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
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-sky-500 text-sm"
            >
              <option value="">Semua Tipe Movement</option>
              <option value="IN">Stok Masuk (IN)</option>
              <option value="OUT">Stok Keluar (OUT)</option>
              <option value="TRANSFER">Transfer Gudang</option>
              <option value="ADJUSTMENT">Penyesuaian (Adjustment)</option>
            </select>

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
                  {wh.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Data Table */}
        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading || isFetching}
          emptyMessage="Tidak ada riwayat pergerakan stok ditemukan"
          page={page}
          totalPages={data?.meta?.totalPages}
          totalItems={data?.meta?.totalItems}
          onPageChange={setPage}
          sorting={sorting}
          onSortingChange={(next) => {
            setSorting(next);
            setPage(1);
          }}
          entityLabel="transaksi"
        />
      </div>
    </DashboardLayout>
  );
}
