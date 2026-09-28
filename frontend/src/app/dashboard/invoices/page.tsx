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
import { recordPaymentSchema, type RecordPaymentInput } from '@/lib/schemas';
import { apiErrorMessage } from '@/lib/utils';
import type { Invoice, PaginatedResponse } from '@/types';
import {
  ReceiptText,
  Search,
  Eye,
  Wallet,
  Download,
  AlertCircle,
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

/** Format tanggal saja: "24 Sep 2026" */
function formatTanggalSingkat(value: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Tunai',
  TRANSFER: 'Transfer',
  QRIS: 'QRIS',
  OTHER: 'Lainnya',
};

export default function InvoicesPage() {
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const canPay = can(role, 'recordPayments');

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }]);

  // Modal Detail (read-only: info + item SO + riwayat pembayaran)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Modal Catat Pembayaran
  const [payInvoice, setPayInvoice] = useState<Invoice | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('');
  const [note, setNote] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);

  const sortBy = sorting[0]?.id;
  const sortOrder = sorting[0] ? (sorting[0].desc ? 'desc' : 'asc') : undefined;

  const { data, isLoading, isFetching } = useQuery<PaginatedResponse<Invoice>>({
    queryKey: ['invoices', page, search, statusFilter, sortBy, sortOrder],
    queryFn: async () => {
      const res = await apiClient.get('/invoices', {
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

  // Catat pembayaran (status PARTIALLY_PAID/PAID dihitung server)
  const paymentMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: RecordPaymentInput }) => {
      const res = await apiClient.post(`/invoices/${id}/payments`, payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Pembayaran berhasil dicatat');
      // status invoice tersimpan ikut berubah → refresh daftar invoice & SO
      invalidateList(queryClient, ['invoices', 'sales-orders']);
      closePaymentModal();
    },
    onError: (err) => setErrorMessage(apiErrorMessage(err, 'Gagal mencatat pembayaran')),
  });

  const openDetailModal = async (invoice: Invoice) => {
    setDetailInvoice(invoice);
    setDetailLoading(true);
    setIsDetailModalOpen(true);
    try {
      const res = await apiClient.get(`/invoices/${invoice.id}`);
      setDetailInvoice(res.data as Invoice);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Gagal memuat detail invoice'));
      setIsDetailModalOpen(false);
      setDetailInvoice(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetailModal = () => {
    setIsDetailModalOpen(false);
    setDetailInvoice(null);
    setDetailLoading(false);
  };

  const openPaymentModal = (invoice: Invoice) => {
    setPayInvoice(invoice);
    // Default nominal = sisa tagihan (bisa diubah utk pembayaran sebagian)
    setAmount(String(invoice.remainingAmount));
    setMethod('TRANSFER');
    setNote('');
    setErrorMessage(null);
  };

  const closePaymentModal = () => {
    setPayInvoice(null);
    setErrorMessage(null);
  };

  const handlePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payInvoice) return;
    const parsed = recordPaymentSchema.safeParse({ amount, method, note });
    if (!parsed.success) {
      setErrorMessage(parsed.error.issues[0].message);
      return;
    }
    setErrorMessage(null);
    paymentMutation.mutate({ id: payInvoice.id, payload: parsed.data });
  };

  const downloadPdf = async (invoice: Invoice) => {
    setPdfLoadingId(invoice.id);
    try {
      const res = await apiClient.get(`/invoices/${invoice.id}/pdf`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${invoice.invoiceNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Gagal mengunduh PDF faktur'));
    } finally {
      setPdfLoadingId(null);
    }
  };

  const getInvoiceBadge = (status: string) => {
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
      case 'UNPAID':
        return badge(
          'UNPAID',
          'Belum ada pembayaran',
          'bg-amber-500/10 text-amber-400 border border-amber-500/30 font-semibold',
        );
      case 'PARTIALLY_PAID':
        return badge(
          'PARTIAL',
          'Lunas sebagian',
          'bg-sky-500/10 text-sky-400 border border-sky-500/30 font-semibold',
        );
      case 'PAID':
        return badge('PAID', 'Lunas', 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold');
      case 'OVERDUE':
        return badge(
          'OVERDUE',
          'Jatuh tempo lewat',
          'bg-red-500/10 text-red-400 border border-red-500/30 font-semibold',
        );
      default:
        return <span>{status}</span>;
    }
  };

  const isOverdueDue = (invoice: Invoice) =>
    invoice.status === 'OVERDUE' ||
    (invoice.status !== 'PAID' &&
      !!invoice.dueDate &&
      new Date(invoice.dueDate).getTime() < Date.now());

  const columns: ColumnDef<Invoice, any>[] = [
    {
      accessorKey: 'invoiceNumber',
      header: 'No. Invoice',
      enableSorting: true,
      cell: ({ row }) => (
        <span className="font-mono font-semibold text-sky-400">{row.original.invoiceNumber}</span>
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
      accessorKey: 'dueDate',
      header: 'Jatuh Tempo',
      enableSorting: true,
      cell: ({ row }) => (
        <span
          className={`text-xs font-mono ${isOverdueDue(row.original) ? 'text-red-400 font-semibold' : 'text-slate-300'}`}
        >
          {formatTanggalSingkat(row.original.dueDate)}
        </span>
      ),
    },
    {
      id: 'customer',
      header: 'Pelanggan',
      enableSorting: false,
      cell: ({ row }) => (
        <div>
          <p className="text-white text-sm">{row.original.salesOrder?.customer?.name}</p>
          <p className="text-[10px] font-mono text-slate-500">
            {row.original.salesOrder?.soNumber}
          </p>
        </div>
      ),
    },
    {
      accessorKey: 'totalAmount',
      header: 'Total Tagihan',
      enableSorting: true,
      cell: ({ row }) => (
        <div>
          <span className="font-mono text-emerald-400 text-sm">
            {formatRupiah(row.original.totalAmount)}
          </span>
          {Number(row.original.paidAmount) > 0 && row.original.status !== 'PAID' && (
            <p className="text-[10px] font-mono text-sky-400 mt-0.5">
              Dibayar: {formatRupiah(row.original.paidAmount)}
            </p>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      enableSorting: false,
      cell: ({ row }) => getInvoiceBadge(row.original.status),
    },
    {
      id: 'actions',
      header: 'Aksi',
      enableSorting: false,
      meta: { align: 'right' as const },
      cell: ({ row }) => {
        const invoice = row.original;
        const showPay = canPay && invoice.status !== 'PAID';
        const isPdfLoading = pdfLoadingId === invoice.id;

        return (
          <div className="space-x-2 inline-flex items-center whitespace-nowrap">
            <button
              onClick={() => openDetailModal(invoice)}
              title="Lihat detail invoice"
              className="text-slate-400 hover:text-sky-400 p-1.5 rounded hover:bg-slate-800 transition"
            >
              <Eye className="w-4 h-4" />
            </button>
            <button
              onClick={() => downloadPdf(invoice)}
              disabled={isPdfLoading}
              title="Unduh faktur PDF"
              className="text-slate-400 hover:text-emerald-400 p-1.5 rounded hover:bg-slate-800 transition disabled:opacity-50"
            >
              {isPdfLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
            </button>
            {showPay && (
              <button
                onClick={() => openPaymentModal(invoice)}
                title="Catat pembayaran"
                className="text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-lg font-medium transition inline-flex items-center gap-1"
              >
                <Wallet className="w-3.5 h-3.5" />
                <span>Bayar</span>
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
              <ReceiptText className="text-sky-400 w-7 h-7" />
              Invoice Penjualan
            </h1>
            <p className="text-slate-400 text-sm">
              Faktur dibuat otomatis saat SO Invoiced (jatuh tempo +30 hari). Catat pembayaran
              (Finance) & unduh faktur PDF. Status OVERDUE dihitung otomatis.
            </p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col sm:flex-row items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Cari nomor invoice (INV-...), nomor SO, atau nama pelanggan..."
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
            <option value="UNPAID">UNPAID (Belum lunas)</option>
            <option value="PARTIALLY_PAID">PARTIALLY_PAID (Sebagian)</option>
            <option value="PAID">PAID (Lunas)</option>
            <option value="OVERDUE">OVERDUE (Jatuh tempo)</option>
          </select>
        </div>

        {/* Data Table */}
        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading || isFetching}
          emptyMessage="Tidak ada invoice ditemukan"
          page={page}
          totalPages={data?.meta?.totalPages}
          totalItems={data?.meta?.totalItems}
          onPageChange={setPage}
          sorting={sorting}
          onSortingChange={(next) => {
            setSorting(next);
            setPage(1);
          }}
          entityLabel="invoice"
        />
      </div>

      {/* Modal Detail Invoice (read-only) */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={closeDetailModal}
        title={`Detail ${detailInvoice?.invoiceNumber ?? 'Invoice'}`}
      >
        {detailInvoice ? (
          <div className="space-y-4">
            {/* Info dokumen */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <p className="text-xs text-slate-500 mb-1">No. Invoice</p>
                <p className="font-mono text-sky-400 font-semibold">
                  {detailInvoice.invoiceNumber}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Tanggal Dibuat</p>
                <p className="font-mono text-slate-300">{formatTanggal(detailInvoice.createdAt)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">No. SO</p>
                <p className="font-mono text-slate-300">{detailInvoice.salesOrder?.soNumber}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Pelanggan</p>
                <p className="text-white">{detailInvoice.salesOrder?.customer?.name}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Gudang Pengirim</p>
                <p className="text-white">
                  {detailInvoice.salesOrder?.warehouse?.name}{' '}
                  <span className="font-mono text-slate-500">
                    ({detailInvoice.salesOrder?.warehouse?.code})
                  </span>
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Jatuh Tempo</p>
                <p
                  className={`font-mono ${isOverdueDue(detailInvoice) ? 'text-red-400 font-semibold' : 'text-slate-300'}`}
                >
                  {formatTanggalSingkat(detailInvoice.dueDate)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Status</p>
                {getInvoiceBadge(detailInvoice.status)}
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Terakhir Diubah</p>
                <p className="font-mono text-slate-300">
                  {formatTanggal(detailInvoice.updatedAt)}
                </p>
              </div>
            </div>

            {/* Rincian barang (dari SO) */}
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
                    {(detailInvoice.salesOrder?.items ?? []).map((it) => (
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
                    {!detailLoading &&
                      (detailInvoice.salesOrder?.items ?? []).length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-3 py-5 text-center text-slate-500 italic">
                            Rincian barang belum dimuat
                          </td>
                        </tr>
                      )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Ringkasan tagihan dari server */}
            <div className="grid grid-cols-3 gap-3 border-t border-slate-800 pt-3">
              <div>
                <p className="text-xs text-slate-500 mb-1">Total Tagihan</p>
                <p className="font-mono text-sm font-semibold text-emerald-400">
                  {formatRupiah(detailInvoice.totalAmount)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Sudah Dibayar</p>
                <p className="font-mono text-sm font-semibold text-sky-400">
                  {formatRupiah(detailInvoice.paidAmount)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Sisa Tagihan</p>
                <p
                  className={`font-mono text-sm font-semibold ${Number(detailInvoice.remainingAmount) > 0 ? 'text-red-400' : 'text-emerald-400'}`}
                >
                  {formatRupiah(detailInvoice.remainingAmount)}
                </p>
              </div>
            </div>

            {/* Riwayat pembayaran */}
            <div>
              <p className="text-xs text-slate-500 mb-2">RIWAYAT PEMBAYARAN</p>
              {detailLoading ? null : (detailInvoice.payments ?? []).length > 0 ? (
                <div className="border border-slate-800 rounded-lg overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-900 text-slate-400 text-left">
                        <th className="px-3 py-2 font-medium">Tanggal</th>
                        <th className="px-3 py-2 font-medium">Metode</th>
                        <th className="px-3 py-2 font-medium">Catatan</th>
                        <th className="px-3 py-2 font-medium">Dicatat Oleh</th>
                        <th className="px-3 py-2 font-medium text-right">Nominal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {(detailInvoice.payments ?? []).map((payment) => (
                        <tr key={payment.id} className="bg-slate-950">
                          <td className="px-3 py-2 font-mono text-slate-300">
                            {formatTanggal(payment.paidAt)}
                          </td>
                          <td className="px-3 py-2 text-slate-300">
                            {payment.method ? METHOD_LABEL[payment.method] ?? payment.method : '-'}
                          </td>
                          <td className="px-3 py-2 text-slate-400">{payment.note || '-'}</td>
                          <td className="px-3 py-2 text-slate-300">{payment.user?.name ?? '-'}</td>
                          <td className="px-3 py-2 font-mono text-right text-sky-400">
                            {formatRupiah(payment.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">
                  Belum ada pembayaran tercatat untuk invoice ini
                </p>
              )}
            </div>

            {/* Aksi modal */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                onClick={() => downloadPdf(detailInvoice)}
                disabled={pdfLoadingId === detailInvoice.id}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition inline-flex items-center gap-2 disabled:opacity-50"
              >
                {pdfLoadingId === detailInvoice.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>Unduh PDF</span>
              </button>
              {canPay && detailInvoice.status !== 'PAID' && (
                <button
                  onClick={() => {
                    const invoice = detailInvoice;
                    closeDetailModal();
                    openPaymentModal(invoice);
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition inline-flex items-center gap-2"
                >
                  <Wallet className="w-4 h-4" />
                  <span>Catat Pembayaran</span>
                </button>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Modal Catat Pembayaran */}
      <Modal
        isOpen={!!payInvoice}
        onClose={closePaymentModal}
        title={`Catat Pembayaran — ${payInvoice?.invoiceNumber ?? ''}`}
      >
        <form onSubmit={handlePaymentSubmit} className="space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm flex items-start gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {payInvoice && (
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Total Tagihan</span>
                <span className="font-mono text-emerald-400">
                  {formatRupiah(payInvoice.totalAmount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Sudah Dibayar</span>
                <span className="font-mono text-sky-400">
                  {formatRupiah(payInvoice.paidAmount)}
                </span>
              </div>
              <div className="flex justify-between font-semibold">
                <span className="text-slate-300">Sisa Tagihan</span>
                <span className="font-mono text-white">{formatRupiah(payInvoice.remainingAmount)}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Nominal Pembayaran (Rp)
              </label>
              <input
                type="number"
                required
                min={0.01}
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Metode</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-sky-500"
              >
                <option value="CASH">Tunai</option>
                <option value="TRANSFER">Transfer Bank</option>
                <option value="QRIS">QRIS</option>
                <option value="OTHER">Lainnya</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Catatan (opsional)
            </label>
            <input
              type="text"
              maxLength={255}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="mis. Transfer BCA a/n finance"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          <p className="text-xs text-slate-500">
            Nominal melebihi sisa tagihan akan ditolak server. Status invoice diperbarui otomatis
            (PARTIALLY_PAID / PAID).
          </p>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={closePaymentModal}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={paymentMutation.isPending}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
            >
              {paymentMutation.isPending ? 'Menyimpan...' : 'Catat Pembayaran'}
            </button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
