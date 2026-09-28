'use client';

import * as React from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DataTableProps<TData> {
  columns: ColumnDef<TData, any>[];
  data: TData[];
  isLoading?: boolean;
  emptyMessage?: string;
  colSpan?: number;
  /* Server-side pagination */
  page?: number;
  totalPages?: number;
  totalItems?: number;
  onPageChange?: (page: number) => void;
  /* Server-side sorting */
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  entityLabel?: string;
  renderedCount?: number;
}

/**
 * DataTable generik berbasis TanStack Table v8 (C2).
 * Sorting & pagination dijalankan di server: arahkan `onSortingChange` dan
 * `onPageChange` ke state query yang dikirim sebagai params request API.
 */
export function DataTable<TData>({
  columns,
  data,
  isLoading = false,
  emptyMessage = 'Tidak ada data ditemukan',
  colSpan,
  page,
  totalPages,
  totalItems,
  onPageChange,
  sorting = [],
  onSortingChange,
  entityLabel = 'data',
  renderedCount,
}: DataTableProps<TData>) {
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    // TanStack dapat memanggil dengan nilai ATAU updater function - dinormalkan dulu
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      onSortingChange?.(next);
    },
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
  });

  const resolvedColSpan = colSpan ?? columns.length;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-950 text-slate-400 uppercase text-xs border-b border-slate-800">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sortDir = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        'px-6 py-4 font-semibold',
                        header.column.columnDef.meta?.align === 'right' && 'text-right',
                      )}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          className="inline-flex items-center gap-1.5 uppercase hover:text-sky-400 transition"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sortDir === 'asc' ? (
                            <ArrowUp className="w-3.5 h-3.5" />
                          ) : sortDir === 'desc' ? (
                            <ArrowDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronsUpDown className="w-3.5 h-3.5 opacity-50" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-800">
            {isLoading ? (
              <tr>
                <td colSpan={resolvedColSpan} className="text-center py-10 text-slate-500">
                  Memuat data...
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={resolvedColSpan} className="text-center py-10 text-slate-500">
                  <Inbox className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-800/50 transition">
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={cn(
                        'px-6 py-4',
                        cell.column.columnDef.meta?.align === 'right' && 'text-right',
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination server-side */}
      {onPageChange && typeof page === 'number' && (
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs text-slate-400">
          <span>
            Menampilkan {renderedCount ?? data.length} dari {totalItems ?? 0} {entityLabel}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page === 1}
              onClick={() => onPageChange(page - 1)}
              className="px-3 py-1 bg-slate-900 border border-slate-800 rounded text-slate-300 disabled:opacity-50 hover:border-sky-500/50 transition"
            >
              Sebelumnya
            </button>
            <span className="px-3 py-1 text-slate-400 font-mono">
              {page} / {totalPages || 1}
            </span>
            <button
              disabled={page >= (totalPages || 1)}
              onClick={() => onPageChange(page + 1)}
              className="px-3 py-1 bg-slate-900 border border-slate-800 rounded text-slate-300 disabled:opacity-50 hover:border-sky-500/50 transition"
            >
              Selanjutnya
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
