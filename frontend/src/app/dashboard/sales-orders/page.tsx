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
import { salesOrderSchema, type SalesOrderInput } from '@/lib/schemas';
import { apiErrorMessage } from '@/lib/utils';
import type { SalesOrder, PaginatedResponse, Warehouse, Product, Customer } from '@/types';
import {
  Receipt,
  Plus,
  Search,
  Pencil,
  Boxes,
  FileText,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Trash2,
  Eye,
  Loader2,
} from 'lucide-react';

function formatRupiah(value: number | string): string {
  const n = Number(value);
  return `Rp ${n.toLocaleString('id-ID')}`;
}

/** Format tanggal/waktu id-ID: "24 Sep 2026, 14.30" */
function formatTanggal(value: string): string {
  return new Date(value).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface StatusConfirmState {
  id: string;
  docNumber: string;
  status: string;
  actionLabel: string;
}

interface ItemRow {
  productId: string;
  quantity: string;
  unitPrice: string;
}

interface EditingState {
  id: string;
  number: string;
}

export default function SalesOrdersPage() {
  const queryClient = useQueryClient();
  const { role } = useAuth();
  // Seluruh transisi SO: Sales + SA (dicek ulang backend per transisi).
  const canManage = can(role, 'manageSalesOrders');

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [items, setItems] = useState<ItemRow[]>([{ productId: '', quantity: '1', unitPrice: '0' }]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusConfirm, setStatusConfirm] = useState<StatusConfirmState | null>(null);

  // Modal Detail barang (read-only)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [detailSo, setDetailSo] = useState<SalesOrder | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const sortBy = sorting[0]?.id;
  const sortOrder = sorting[0] ? (sorting[0].desc ? 'desc' : 'asc') : undefined;

  // Fetch Customers, Warehouses & Products untuk form
  const { data: customersData } = useQuery<PaginatedResponse<Customer>>({
    queryKey: ['customers-list'],
    queryFn: async () => {
      const res = await apiClient.get('/customers', { params: { limit: 100 } });
      return res.data;
    },
  });

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

  // Fetch Sales Orders
  const { data, isLoading, isFetching } = useQuery<PaginatedResponse<SalesOrder>>({
    queryKey: ['sales-orders', page, search, statusFilter, sortBy, sortOrder],
    queryFn: async () => {
      const res = await apiClient.get('/sales-orders', {
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

  // Create SO (langsung PENDING)
  const createMutation = useMutation({
    mutationFn: async (payload: SalesOrderInput) => {
      const res = await apiClient.post('/sales-orders', payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Sales Order (PENDING) berhasil dibuat');
      invalidateList(queryClient, 'sales-orders');
      closeModal();
    },
    onError: (err) => setErrorMessage(apiErrorMessage(err, 'Gagal membuat Sales Order')),
  });

  // Update SO (hanya PENDING - divalidasi backend)
  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: SalesOrderInput }) => {
      const res = await apiClient.put(`/sales-orders/${id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Sales Order berhasil diperbarui');
      invalidateList(queryClient, 'sales-orders');
      closeModal();
    },
    onError: (err) => setErrorMessage(apiErrorMessage(err, 'Gagal memperbarui Sales Order')),
  });

  // Transisi status (whitelist + role divalidasi backend)
  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiClient.put(`/sales-orders/${id}/status`, { status });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Status Sales Order berhasil diperbarui');
      invalidateList(queryClient, ['sales-orders', 'inventory-overview', 'stock-movements']);
      setStatusConfirm(null);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal memperbarui status Sales Order')),
  });

  const openCreateModal = () => {
    const custList = customersData?.data || [];
    const whList = warehousesData?.data || [];
    const prodList = productsData?.data || [];
    setEditing(null);
    setCustomerId(custList[0]?.id || '');
    setWarehouseId(whList[0]?.id || '');
    setItems([
      {
        productId: prodList[0]?.id || '',
        quantity: '1',
        unitPrice: String(prodList[0]?.sellPrice ?? 0),
      },
    ]);
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  // Edit: ambil detail (list tidak menyertakan items)
  const openEditModal = async (so: SalesOrder) => {
    try {
      const res = await apiClient.get(`/sales-orders/${so.id}`);
      const detail = res.data as SalesOrder;
      setEditing({ id: detail.id, number: detail.soNumber });
      setCustomerId(detail.customerId);
      setWarehouseId(detail.warehouseId);
      setItems(
        (detail.items ?? []).map((it) => ({
          productId: it.productId,
          quantity: String(it.quantity),
          unitPrice: String(it.unitPrice),
        })),
      );
      setErrorMessage(null);
      setIsModalOpen(true);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Gagal memuat detail Sales Order'));
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditing(null);
    setErrorMessage(null);
  };

  // Detail read-only: info dokumen dari baris tabel, rincian barang di-fetch penuh
  const openDetailModal = async (so: SalesOrder) => {
    setDetailSo(so);
    setDetailLoading(true);
    setIsDetailModalOpen(true);
    try {
      const res = await apiClient.get(`/sales-orders/${so.id}`);
      setDetailSo(res.data as SalesOrder);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Gagal memuat detail Sales Order'));
      setIsDetailModalOpen(false);
      setDetailSo(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetailModal = () => {
    setIsDetailModalOpen(false);
    setDetailSo(null);
    setDetailLoading(false);
  };

  const addItemRow = () => {
    const firstProd = productsData?.data?.[0];
    setItems([
      ...items,
      {
        productId: firstProd?.id || '',
        quantity: '1',
        unitPrice: String(firstProd?.sellPrice ?? 0),
      },
    ]);
  };

  const removeItemRow = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItemRow = (
    index: number,
    field: 'productId' | 'quantity' | 'unitPrice',
    value: string,
  ) => {
    const newItems = [...items];
    if (field === 'productId') {
      newItems[index].productId = value;
      // Default harga satuan = harga jual produk terpilih (bisa di-override manual)
      const prod = productsData?.data?.find((p) => p.id === value);
      newItems[index].unitPrice = String(prod?.sellPrice ?? 0);
    } else if (field === 'quantity') {
      newItems[index].quantity = value;
    } else {
      newItems[index].unitPrice = value;
    }
    setItems(newItems);
  };

  const orderTotal = items.reduce(
    (acc, it) => acc + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0),
    0,
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = salesOrderSchema.safeParse({ customerId, warehouseId, items });
    if (!parsed.success) {
      setErrorMessage(parsed.error.issues[0].message);
      return;
    }
    setErrorMessage(null);
    if (editing) {
      updateMutation.mutate({ id: editing.id, payload: parsed.data });
    } else {
      createMutation.mutate(parsed.data);
    }
  };

  const requestStatusChange = (so: SalesOrder, newStatus: string, actionLabel: string) => {
    setStatusConfirm({ id: so.id, docNumber: so.soNumber, status: newStatus, actionLabel });
  };

  const getSoBadge = (status: string) => {
    // Pill pendek (selalu 1 baris) + sub-teks keterangan (tanpa background, wrap aman)
    const badge = (label: string, gloss: string | null, cls: string) => (
      <div>
        <span
          className={`inline-flex whitespace-nowrap px-2.5 py-1 rounded text-xs font-mono ${cls}`}
        >
          {label}
        </span>
        {gloss && <p className="text-[10px] text-slate-500 mt-1">{gloss}</p>}
      </div>
    );
    switch (status) {
      case 'PENDING':
        return badge(
          'PENDING',
          'Menunggu alokasi',
          'bg-amber-500/10 text-amber-400 border border-amber-500/30 font-semibold',
        );
      case 'ALLOCATED':
        return badge(
          'ALLOCATED',
          'Stok dialokasi',
          'bg-violet-500/10 text-violet-400 border border-violet-500/30 font-semibold',
        );
      case 'INVOICED':
        return badge(
          'INVOICED',
          'Ada invoice',
          'bg-sky-500/10 text-sky-400 border border-sky-500/30 font-semibold',
        );
      case 'COMPLETED':
        return badge(
          'COMPLETED',
          'Selesai',
          'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold',
        );
      case 'CANCELLED':
        return badge('CANCELLED', null, 'bg-red-500/10 text-red-400 border border-red-500/30');
      default:
        return <span>{status}</span>;
    }
  };

  const columns: ColumnDef<SalesOrder, any>[] = [
    {
      accessorKey: 'soNumber',
      header: 'No. SO',
      enableSorting: true,
      cell: ({ row }) => (
        <span className="font-mono font-semibold text-sky-400">{row.original.soNumber}</span>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Tanggal',
      enableSorting: true,
      cell: ({ row }) => (
        <span className="text-xs font-mono text-slate-300">
          {formatTanggal(row.original.createdAt)}
        </span>
      ),
    },
    {
      id: 'detail',
      header: 'Detail Transaksi',
      enableSorting: false,
      cell: ({ row }) => (
        <button
          onClick={() => openDetailModal(row.original)}
          title="Lihat rincian transaksi"
          className="inline-flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 px-3 py-1.5 rounded-lg font-medium transition"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Detail</span>
        </button>
      ),
    },
    {
      accessorKey: 'totalAmount',
      header: 'Total Nilai',
      enableSorting: true,
      cell: ({ row }) => (
        <span className="font-mono text-emerald-400 text-sm">
          {formatRupiah(row.original.totalAmount)}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status Workflow',
      enableSorting: false,
      cell: ({ row }) => (
        <div>
          {getSoBadge(row.original.status)}
          {row.original.invoice && (
            <div className="text-[10px] font-mono text-sky-400 mt-1">
              {row.original.invoice.invoiceNumber} · {row.original.invoice.status}
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'actions',
      header: 'Aksi Workflow',
      enableSorting: false,
      meta: { align: 'right' as const },
      cell: ({ row }) => {
        const so = row.original;
        const isPending = so.status === 'PENDING';
        const isAllocated = so.status === 'ALLOCATED';
        const isInvoiced = so.status === 'INVOICED';
        const isTerminal = so.status === 'COMPLETED' || so.status === 'CANCELLED';

        const showEdit = canManage && isPending;
        const showAllocate = canManage && isPending;
        const showInvoice = canManage && isAllocated;
        const showComplete = canManage && isInvoiced;
        const showCancel = canManage && isPending;

        if (isTerminal) {
          return <span className="text-xs text-slate-500 italic">Selesai</span>;
        }
        const hasAny = showEdit || showAllocate || showInvoice || showComplete || showCancel;
        if (!hasAny) return <span className="text-xs text-slate-500 italic">-</span>;

        return (
          <div className="space-x-2 inline-flex items-center whitespace-nowrap">
            {showEdit && (
              <button
                onClick={() => openEditModal(so)}
                title="Ubah SO (masih PENDING)"
                className="text-slate-400 hover:text-sky-400 p-1.5 rounded hover:bg-slate-800 transition"
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
            {showAllocate && (
              <button
                onClick={() =>
                  requestStatusChange(so, 'ALLOCATED', 'DIALOKASI — stok dipotong (Allocated)')
                }
                className="text-xs bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 border border-violet-500/30 px-3 py-1.5 rounded-lg font-medium transition inline-flex items-center gap-1"
              >
                <Boxes className="w-3.5 h-3.5" />
                <span>Alokasi Stok</span>
              </button>
            )}
            {showInvoice && (
              <button
                onClick={() =>
                  requestStatusChange(so, 'INVOICED', 'INVOICED (record invoice UNPAID dibuat)')
                }
                className="text-xs bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 px-3 py-1.5 rounded-lg font-medium transition inline-flex items-center gap-1"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Buat Invoice</span>
              </button>
            )}
            {showComplete && (
              <button
                onClick={() => requestStatusChange(so, 'COMPLETED', 'COMPLETED (pesanan selesai)')}
                className="text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-lg font-medium transition inline-flex items-center gap-1"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Tandai Selesai</span>
              </button>
            )}
            {showCancel && (
              <button
                onClick={() => requestStatusChange(so, 'CANCELLED', 'BATAL')}
                className="text-slate-400 hover:text-red-400 p-1.5 rounded hover:bg-slate-800 transition"
                title="Batalkan SO"
              >
                <XCircle className="w-4 h-4" />
              </button>
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
              <Receipt className="text-sky-400 w-7 h-7" />
              Sales Order (Penjualan)
            </h1>
            <p className="text-slate-400 text-sm">
              Workflow penjualan: Pending → Allocated (stok dipotong) → Invoiced (invoice otomatis)
              → Completed. Cancel hanya sebelum stok bergerak.
            </p>
          </div>
          {canManage && (
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 bg-sky-600 hover:bg-sky-500 text-white font-medium px-4 py-2.5 rounded-lg shadow-lg shadow-sky-600/20 transition"
            >
              <Plus className="w-5 h-5" />
              <span>Buat SO Baru</span>
            </button>
          )}
        </div>

        {/* Toolbar */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col sm:flex-row items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Cari nomor SO (SO-...), nama pelanggan, atau gudang..."
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
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-sky-500 text-sm w-full sm:w-60"
          >
            <option value="">Semua Status</option>
            <option value="PENDING">PENDING</option>
            <option value="ALLOCATED">ALLOCATED</option>
            <option value="INVOICED">INVOICED</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
        </div>

        {/* Data Table */}
        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading || isFetching}
          emptyMessage="Tidak ada dokumen Sales Order ditemukan"
          page={page}
          totalPages={data?.meta?.totalPages}
          totalItems={data?.meta?.totalItems}
          onPageChange={setPage}
          sorting={sorting}
          onSortingChange={(next) => {
            setSorting(next);
            setPage(1);
          }}
          entityLabel="dokumen Sales Order"
        />
      </div>

      {/* Create / Edit Sales Order Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={
          editing ? `Ubah ${editing.number} (masih PENDING)` : 'Buat Sales Order Baru (PENDING)'
        }
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
                Pelanggan (Customer)
              </label>
              <select
                required
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-sky-500"
              >
                {customersData?.data?.map((cust) => (
                  <option key={cust.id} value={cust.id}>
                    {cust.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Gudang Pengirim
              </label>
              <select
                required
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
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
                Daftar Barang yang Dijual
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

            <div className="max-h-48 overflow-y-auto overflow-x-hidden pr-1">
              {/* Header kolom input item - sticky agar selalu sejajar saat scroll */}
              <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_4.5rem_7.5rem_1.75rem] gap-2 bg-slate-900 border border-slate-800 rounded-t-lg px-2 py-1.5 text-xs font-medium text-slate-400">
                <span>Produk</span>
                <span>Jumlah</span>
                <span>Harga</span>
                <span aria-hidden />
              </div>
              <div className="space-y-2 mt-2">
                {items.map((item, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-[minmax(0,1fr)_4.5rem_7.5rem_1.75rem] gap-2 items-center bg-slate-950 border border-slate-800 rounded-lg p-2"
                  >
                    <select
                      required
                      value={item.productId}
                      onChange={(e) => updateItemRow(idx, 'productId', e.target.value)}
                      className="min-w-0 w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white text-xs focus:outline-none focus:border-sky-500"
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
                      onChange={(e) => updateItemRow(idx, 'quantity', e.target.value)}
                      title="Jumlah"
                      className="min-w-0 w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white text-xs font-mono focus:outline-none focus:border-sky-500"
                    />
                    <input
                      type="number"
                      required
                      min={0}
                      value={item.unitPrice}
                      onChange={(e) => updateItemRow(idx, 'unitPrice', e.target.value)}
                      title="Harga Satuan"
                      className="min-w-0 w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white text-xs font-mono focus:outline-none focus:border-sky-500"
                    />
                    {items.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeItemRow(idx)}
                        title="Hapus item"
                        className="text-slate-500 hover:text-red-400 p-1 rounded flex justify-center"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    ) : (
                      <span aria-hidden />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-2 text-xs text-slate-400">
              Total Perkiraan:{' '}
              <span className="font-mono text-emerald-400 font-semibold">
                {formatRupiah(orderTotal)}
              </span>{' '}
              — total resmi dihitung ulang oleh server.
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
              {editing
                ? updateMutation.isPending
                  ? 'Menyimpan...'
                  : 'Simpan Perubahan'
                : createMutation.isPending
                  ? 'Membuat SO...'
                  : 'Buat Dokumen SO'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Detail Barang (read-only) */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={closeDetailModal}
        title={`Detail ${detailSo?.soNumber ?? 'Sales Order'}`}
      >
        {detailSo ? (
          <div className="space-y-4">
            {/* Info dokumen */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <p className="text-xs text-slate-500 mb-1">No. SO</p>
                <p className="font-mono text-sky-400 font-semibold">{detailSo.soNumber}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Tanggal Dibuat</p>
                <p className="font-mono text-slate-300">{formatTanggal(detailSo.createdAt)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Pelanggan</p>
                <p className="text-white">{detailSo.customer?.name}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Gudang Pengirim</p>
                <p className="text-white">
                  {detailSo.warehouse?.name}{' '}
                  <span className="font-mono text-slate-500">({detailSo.warehouse?.code})</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Status</p>
                {getSoBadge(detailSo.status)}
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Terakhir Diubah</p>
                <p className="font-mono text-slate-300">{formatTanggal(detailSo.updatedAt)}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-slate-500 mb-1">Invoice</p>
                {detailSo.invoice ? (
                  <p className="font-mono text-sky-400">
                    {detailSo.invoice.invoiceNumber} ·{' '}
                    <span className="text-slate-400">{detailSo.invoice.status}</span>
                  </p>
                ) : (
                  <p className="text-xs text-slate-500 italic">Belum ada invoice</p>
                )}
              </div>
            </div>

            {/* Rincian barang */}
            {detailLoading ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                <Loader2 className="w-7 h-7 animate-spin text-sky-400 mb-2" />
                <span className="text-sm">Memuat rincian barang...</span>
              </div>
            ) : (
              <div className="border border-slate-800 rounded-lg overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-900 text-slate-400 text-left">
                      <th className="px-3 py-2 font-medium">SKU</th>
                      <th className="px-3 py-2 font-medium">Nama Barang</th>
                      <th className="px-3 py-2 font-medium text-right">Jumlah</th>
                      <th className="px-3 py-2 font-medium text-right">Harga Satuan</th>
                      <th className="px-3 py-2 font-medium text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {(detailSo.items ?? []).map((it) => (
                      <tr key={it.id} className="bg-slate-950">
                        <td className="px-3 py-2 font-mono text-slate-400">{it.product?.sku}</td>
                        <td className="px-3 py-2 text-white">{it.product?.name}</td>
                        <td className="px-3 py-2 font-mono text-right text-slate-300">
                          {it.quantity}
                        </td>
                        <td className="px-3 py-2 font-mono text-right text-slate-300">
                          {formatRupiah(it.unitPrice)}
                        </td>
                        <td className="px-3 py-2 font-mono text-right text-emerald-400">
                          {formatRupiah(Number(it.quantity) * Number(it.unitPrice))}
                        </td>
                      </tr>
                    ))}
                    {(detailSo.items ?? []).length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-5 text-center text-slate-500 italic">
                          Tidak ada barang pada dokumen ini
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Total dari server */}
            <div className="flex items-center justify-between border-t border-slate-800 pt-3">
              <span className="text-sm text-slate-400">
                Total{' '}
                <span className="font-mono text-slate-500">
                  ({detailSo._count?.items ?? detailSo.items?.length ?? 0} macam barang)
                </span>
              </span>
              <span className="font-mono text-lg font-semibold text-emerald-400">
                {formatRupiah(detailSo.totalAmount)}
              </span>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Konfirmasi Ubah Status */}
      <ConfirmDialog
        open={!!statusConfirm}
        onOpenChange={(open) => !open && setStatusConfirm(null)}
        title="Ubah Status Sales Order"
        description={`Apakah Anda yakin ingin memproses SO "${statusConfirm?.docNumber}" menjadi ${statusConfirm?.actionLabel}?`}
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
