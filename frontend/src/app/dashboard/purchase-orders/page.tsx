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
import { purchaseOrderSchema, type PurchaseOrderInput } from '@/lib/schemas';
import { apiErrorMessage } from '@/lib/utils';
import type { PurchaseOrder, PaginatedResponse, Warehouse, Product, Supplier } from '@/types';
import {
  ShoppingCart,
  Plus,
  Search,
  Pencil,
  Send,
  ArrowLeft,
  PackageCheck,
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

export default function PurchaseOrdersPage() {
  const queryClient = useQueryClient();
  const { role } = useAuth();
  // Buat/ubah/submit/tarik/terima: Purchasing + SA.
  // Approve & cancel setelah APPROVED: SA saja. Lunas (COMPLETED): Finance + SA.
  const canManage = can(role, 'managePurchaseOrders');
  const canApprove = can(role, 'approvePurchaseOrders');
  const canComplete = can(role, 'completePurchaseOrders');

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [items, setItems] = useState<ItemRow[]>([{ productId: '', quantity: '1', unitPrice: '0' }]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusConfirm, setStatusConfirm] = useState<StatusConfirmState | null>(null);

  // Modal Detail barang (read-only)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [detailPo, setDetailPo] = useState<PurchaseOrder | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const sortBy = sorting[0]?.id;
  const sortOrder = sorting[0] ? (sorting[0].desc ? 'desc' : 'asc') : undefined;

  // Fetch Suppliers, Warehouses & Products untuk form
  const { data: suppliersData } = useQuery<PaginatedResponse<Supplier>>({
    queryKey: ['suppliers-list'],
    queryFn: async () => {
      const res = await apiClient.get('/suppliers', { params: { limit: 100 } });
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

  // Fetch Purchase Orders
  const { data, isLoading, isFetching } = useQuery<PaginatedResponse<PurchaseOrder>>({
    queryKey: ['purchase-orders', page, search, statusFilter, sortBy, sortOrder],
    queryFn: async () => {
      const res = await apiClient.get('/purchase-orders', {
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

  // Create PO (DRAFT)
  const createMutation = useMutation({
    mutationFn: async (payload: PurchaseOrderInput) => {
      const res = await apiClient.post('/purchase-orders', payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Dokumen PO (DRAFT) berhasil dibuat');
      invalidateList(queryClient, 'purchase-orders');
      closeModal();
    },
    onError: (err) => setErrorMessage(apiErrorMessage(err, 'Gagal membuat Purchase Order')),
  });

  // Update PO (hanya DRAFT - divalidasi backend)
  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: PurchaseOrderInput }) => {
      const res = await apiClient.put(`/purchase-orders/${id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Purchase Order berhasil diperbarui');
      invalidateList(queryClient, 'purchase-orders');
      closeModal();
    },
    onError: (err) => setErrorMessage(apiErrorMessage(err, 'Gagal memperbarui Purchase Order')),
  });

  // Transisi status (whitelist + role divalidasi backend)
  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiClient.put(`/purchase-orders/${id}/status`, { status });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Status Purchase Order berhasil diperbarui');
      invalidateList(queryClient, ['purchase-orders', 'inventory-overview', 'stock-movements']);
      setStatusConfirm(null);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal memperbarui status Purchase Order')),
  });

  const openCreateModal = () => {
    const supList = suppliersData?.data || [];
    const whList = warehousesData?.data || [];
    const prodList = productsData?.data || [];
    setEditing(null);
    setSupplierId(supList[0]?.id || '');
    setWarehouseId(whList[0]?.id || '');
    setItems([
      {
        productId: prodList[0]?.id || '',
        quantity: '1',
        unitPrice: String(prodList[0]?.buyPrice ?? 0),
      },
    ]);
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  // Edit: ambil detail (list tidak menyertakan items)
  const openEditModal = async (po: PurchaseOrder) => {
    try {
      const res = await apiClient.get(`/purchase-orders/${po.id}`);
      const detail = res.data as PurchaseOrder;
      setEditing({ id: detail.id, number: detail.poNumber });
      setSupplierId(detail.supplierId);
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
      toast.error(apiErrorMessage(err, 'Gagal memuat detail Purchase Order'));
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditing(null);
    setErrorMessage(null);
  };

  // Detail read-only: info dokumen dari baris tabel, rincian barang di-fetch penuh
  const openDetailModal = async (po: PurchaseOrder) => {
    setDetailPo(po);
    setDetailLoading(true);
    setIsDetailModalOpen(true);
    try {
      const res = await apiClient.get(`/purchase-orders/${po.id}`);
      setDetailPo(res.data as PurchaseOrder);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Gagal memuat detail Purchase Order'));
      setIsDetailModalOpen(false);
      setDetailPo(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetailModal = () => {
    setIsDetailModalOpen(false);
    setDetailPo(null);
    setDetailLoading(false);
  };

  const addItemRow = () => {
    const firstProd = productsData?.data?.[0];
    setItems([
      ...items,
      {
        productId: firstProd?.id || '',
        quantity: '1',
        unitPrice: String(firstProd?.buyPrice ?? 0),
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
      // Default harga satuan = harga beli produk terpilih (bisa di-override manual)
      const prod = productsData?.data?.find((p) => p.id === value);
      newItems[index].unitPrice = String(prod?.buyPrice ?? 0);
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
    const parsed = purchaseOrderSchema.safeParse({ supplierId, warehouseId, items });
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

  const requestStatusChange = (po: PurchaseOrder, newStatus: string, actionLabel: string) => {
    setStatusConfirm({ id: po.id, docNumber: po.poNumber, status: newStatus, actionLabel });
  };

  const getPoBadge = (status: string) => {
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
      case 'DRAFT':
        return badge('DRAFT', null, 'bg-slate-800 text-slate-300 border border-slate-700');
      case 'PENDING':
        return badge(
          'PENDING',
          'Menunggu approval',
          'bg-amber-500/10 text-amber-400 border border-amber-500/30 font-semibold',
        );
      case 'APPROVED':
        return badge(
          'APPROVED',
          'Disetujui',
          'bg-sky-500/10 text-sky-400 border border-sky-500/30 font-semibold',
        );
      case 'RECEIVED':
        return badge(
          'RECEIVED',
          'Stok masuk',
          'bg-violet-500/10 text-violet-400 border border-violet-500/30 font-semibold',
        );
      case 'COMPLETED':
        return badge(
          'COMPLETED',
          'Lunas',
          'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold',
        );
      case 'CANCELLED':
        return badge('CANCELLED', null, 'bg-red-500/10 text-red-400 border border-red-500/30');
      default:
        return <span>{status}</span>;
    }
  };

  const columns: ColumnDef<PurchaseOrder, any>[] = [
    {
      accessorKey: 'poNumber',
      header: 'No. PO',
      enableSorting: true,
      cell: ({ row }) => (
        <span className="font-mono font-semibold text-sky-400">{row.original.poNumber}</span>
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
      cell: ({ row }) => getPoBadge(row.original.status),
    },
    {
      id: 'actions',
      header: 'Aksi Workflow',
      enableSorting: false,
      meta: { align: 'right' as const },
      cell: ({ row }) => {
        const po = row.original;
        const isDraft = po.status === 'DRAFT';
        const isPending = po.status === 'PENDING';
        const isApproved = po.status === 'APPROVED';
        const isReceived = po.status === 'RECEIVED';
        const isTerminal = po.status === 'COMPLETED' || po.status === 'CANCELLED';

        const showEdit = canManage && isDraft;
        const showSubmit = canManage && isDraft;
        const showWithdraw = canManage && isPending;
        const showApprove = canApprove && isPending;
        const showReceive = canManage && isApproved;
        const showCancel = (canManage && (isDraft || isPending)) || (canApprove && isApproved);
        const showComplete = canComplete && isReceived;

        if (isTerminal) {
          return <span className="text-xs text-slate-500 italic">Selesai</span>;
        }
        const hasAny =
          showEdit || showSubmit || showWithdraw || showApprove || showReceive || showCancel || showComplete;
        if (!hasAny) return <span className="text-xs text-slate-500 italic">-</span>;

        return (
          <div className="space-x-2 inline-flex items-center whitespace-nowrap">
            {showEdit && (
              <button
                onClick={() => openEditModal(po)}
                title="Ubah PO (masih DRAFT)"
                className="text-slate-400 hover:text-sky-400 p-1.5 rounded hover:bg-slate-800 transition"
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
            {showSubmit && (
              <button
                onClick={() => requestStatusChange(po, 'PENDING', 'MENUNGGU APPROVAL (Pending)')}
                className="text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 px-3 py-1.5 rounded-lg font-medium transition inline-flex items-center gap-1"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Ajukan</span>
              </button>
            )}
            {showWithdraw && (
              <button
                onClick={() => requestStatusChange(po, 'DRAFT', 'kembali ke DRAFT (Tarik)')}
                className="text-xs text-slate-400 hover:text-white border border-slate-700 px-3 py-1.5 rounded-lg font-medium transition inline-flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Tarik</span>
              </button>
            )}
            {showApprove && (
              <button
                onClick={() => requestStatusChange(po, 'APPROVED', 'DISETUJUI (Approved)')}
                className="text-xs bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 px-3 py-1.5 rounded-lg font-medium transition inline-flex items-center gap-1"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Setujui</span>
              </button>
            )}
            {showReceive && (
              <button
                onClick={() =>
                  requestStatusChange(
                    po,
                    'RECEIVED',
                    'DITERIMA — seluruh stok masuk gudang (Received)',
                  )
                }
                className="text-xs bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 border border-violet-500/30 px-3 py-1.5 rounded-lg font-medium transition inline-flex items-center gap-1"
              >
                <PackageCheck className="w-3.5 h-3.5" />
                <span>Terima Barang</span>
              </button>
            )}
            {showComplete && (
              <button
                onClick={() => requestStatusChange(po, 'COMPLETED', 'COMPLETED (dinyatakan lunas)')}
                className="text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-lg font-medium transition inline-flex items-center gap-1"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Tandai Lunas</span>
              </button>
            )}
            {showCancel && (
              <button
                onClick={() => requestStatusChange(po, 'CANCELLED', 'BATAL')}
                className="text-slate-400 hover:text-red-400 p-1.5 rounded hover:bg-slate-800 transition"
                title="Batalkan PO"
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
              <ShoppingCart className="text-sky-400 w-7 h-7" />
              Purchase Order (Pembelian)
            </h1>
            <p className="text-slate-400 text-sm">
              Workflow pembelian: DRAFT → Pending → Approved (Super Admin) → Received (stok masuk)
              → Completed
            </p>
          </div>
          {canManage && (
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 bg-sky-600 hover:bg-sky-500 text-white font-medium px-4 py-2.5 rounded-lg shadow-lg shadow-sky-600/20 transition"
            >
              <Plus className="w-5 h-5" />
              <span>Buat PO Baru</span>
            </button>
          )}
        </div>

        {/* Toolbar */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col sm:flex-row items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Cari nomor PO (PO-...), nama pemasok, atau gudang..."
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
            <option value="DRAFT">DRAFT</option>
            <option value="PENDING">PENDING</option>
            <option value="APPROVED">APPROVED</option>
            <option value="RECEIVED">RECEIVED</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
        </div>

        {/* Data Table */}
        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading || isFetching}
          emptyMessage="Tidak ada dokumen Purchase Order ditemukan"
          page={page}
          totalPages={data?.meta?.totalPages}
          totalItems={data?.meta?.totalItems}
          onPageChange={setPage}
          sorting={sorting}
          onSortingChange={(next) => {
            setSorting(next);
            setPage(1);
          }}
          entityLabel="dokumen Purchase Order"
        />
      </div>

      {/* Create / Edit Purchase Order Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={
          editing
            ? `Ubah ${editing.number} (masih DRAFT)`
            : 'Buat Purchase Order Baru (DRAFT)'
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
                Pemasok (Supplier)
              </label>
              <select
                required
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-sky-500"
              >
                {suppliersData?.data?.map((sup) => (
                  <option key={sup.id} value={sup.id}>
                    {sup.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Gudang Penerima
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
                Daftar Barang yang Dipesan
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
                  ? 'Membuat DRAFT...'
                  : 'Buat Dokumen PO'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Detail Barang (read-only) */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={closeDetailModal}
        title={`Detail ${detailPo?.poNumber ?? 'Purchase Order'}`}
      >
        {detailPo ? (
          <div className="space-y-4">
            {/* Info dokumen */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <p className="text-xs text-slate-500 mb-1">No. PO</p>
                <p className="font-mono text-sky-400 font-semibold">{detailPo.poNumber}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Tanggal Dibuat</p>
                <p className="font-mono text-slate-300">{formatTanggal(detailPo.createdAt)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Pemasok</p>
                <p className="text-white">{detailPo.supplier?.name}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Gudang Penerima</p>
                <p className="text-white">
                  {detailPo.warehouse?.name}{' '}
                  <span className="font-mono text-slate-500">({detailPo.warehouse?.code})</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Status</p>
                {getPoBadge(detailPo.status)}
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Terakhir Diubah</p>
                <p className="font-mono text-slate-300">{formatTanggal(detailPo.updatedAt)}</p>
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
                    {(detailPo.items ?? []).map((it) => (
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
                    {(detailPo.items ?? []).length === 0 && (
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
                  ({detailPo._count?.items ?? detailPo.items?.length ?? 0} macam barang)
                </span>
              </span>
              <span className="font-mono text-lg font-semibold text-emerald-400">
                {formatRupiah(detailPo.totalAmount)}
              </span>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Konfirmasi Ubah Status */}
      <ConfirmDialog
        open={!!statusConfirm}
        onOpenChange={(open) => !open && setStatusConfirm(null)}
        title="Ubah Status Purchase Order"
        description={`Apakah Anda yakin ingin memproses PO "${statusConfirm?.docNumber}" menjadi ${statusConfirm?.actionLabel}?`}
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
