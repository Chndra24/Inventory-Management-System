import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';

/**
 * Faktur PDF (Fase 5) — dirender on-demand di server (renderToBuffer),
 * sinkron tanpa antrian Redis (keputusan Fase 5).
 */

// TODO: ganti dengan identitas perusahaan sebenarnya bila sudah tersedia.
const COMPANY = {
  name: 'NextERP',
  tagline: 'Inventory & ERP System',
  address: '',
};

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  UNPAID: { label: 'BELUM LUNAS', color: '#B45309' },
  PARTIALLY_PAID: { label: 'LUNAS SEBAGIAN', color: '#1D4ED8' },
  PAID: { label: 'LUNAS', color: '#15803D' },
  OVERDUE: { label: 'TERLAMBAT', color: '#B91C1C' },
};

const BULAN = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

function formatRupiah(value: number): string {
  return `Rp ${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(value)}`;
}

function formatTanggal(tanggal: string | Date | null | undefined): string {
  if (!tanggal) return '-';
  const date = new Date(tanggal);
  return `${date.getDate()} ${BULAN[date.getMonth()]} ${date.getFullYear()}`;
}

export interface InvoicePdfData {
  invoiceNumber: string;
  status: string;
  dueDate: string | Date | null;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  createdAt: string | Date;
  salesOrder: {
    soNumber: string;
    customer: {
      name: string;
      address: string | null;
      phone: string | null;
      email: string | null;
    };
    warehouse: { code: string; name: string };
    items: Array<{
      quantity: number;
      unitPrice: number;
      product: { sku: string; name: string; unit: string };
    }>;
  };
  payments: Array<{
    amount: number;
    paidAt: string | Date;
    method: string | null;
    note: string | null;
    user: { name: string } | null;
  }>;
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 9, fontFamily: 'Helvetica', color: '#0F172A' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  brand: { fontSize: 18, fontFamily: 'Helvetica-Bold' },
  docTitle: { fontSize: 14, fontFamily: 'Helvetica-Bold', letterSpacing: 1 },
  docNumber: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  status: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginTop: 4, letterSpacing: 0.5 },
  muted: { color: '#64748B', fontSize: 9 },
  strong: { fontFamily: 'Helvetica-Bold', fontSize: 10 },
  rule: { borderBottomWidth: 2, borderBottomColor: '#0F172A', marginVertical: 12 },
  infoRow: { flexDirection: 'row', gap: 24, marginBottom: 18 },
  infoBox: { flexGrow: 1 },
  sectionLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1,
    color: '#64748B',
    marginBottom: 6,
  },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: '#334155' },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  td: { fontSize: 9 },
  colSku: { width: 72 },
  colQty: { width: 55, textAlign: 'center' },
  colPrice: { width: 95, textAlign: 'right' },
  colSub: { width: 100, textAlign: 'right' },
  colGrow: { flexGrow: 1 },
  totals: { width: 240, marginLeft: 'auto', marginTop: 12 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totalLabel: { color: '#475569' },
  totalValue: { fontFamily: 'Helvetica-Bold' },
  footer: { marginTop: 24, paddingTop: 8, borderTopWidth: 1, borderColor: '#E2E8F0' },
});

export function InvoicePdfDocument({ invoice }: { invoice: InvoicePdfData }) {
  const status = STATUS_LABEL[invoice.status] ?? STATUS_LABEL.UNPAID;
  const now = new Date();
  const generatedAt = `${formatTanggal(now)} ${String(now.getHours()).padStart(2, '0')}.${String(
    now.getMinutes(),
  ).padStart(2, '0')}`;

  return (
    <Document title={`Faktur ${invoice.invoiceNumber}`} author={COMPANY.name}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>{COMPANY.name}</Text>
            <Text style={styles.muted}>{COMPANY.tagline}</Text>
            {COMPANY.address ? <Text style={styles.muted}>{COMPANY.address}</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.docTitle}>FAKTUR PENJUALAN</Text>
            <Text style={styles.docNumber}>{invoice.invoiceNumber}</Text>
            <Text style={styles.muted}>Tanggal Terbit: {formatTanggal(invoice.createdAt)}</Text>
            <Text style={{ ...styles.status, color: status.color }}>{status.label}</Text>
          </View>
        </View>
        <View style={styles.rule} />

        <View style={styles.infoRow}>
          <View style={styles.infoBox}>
            <Text style={styles.sectionLabel}>DITAGIHKAN KEPADA</Text>
            <Text style={styles.strong}>{invoice.salesOrder.customer.name}</Text>
            {invoice.salesOrder.customer.address ? (
              <Text style={styles.muted}>{invoice.salesOrder.customer.address}</Text>
            ) : null}
            {invoice.salesOrder.customer.phone ? (
              <Text style={styles.muted}>Telp: {invoice.salesOrder.customer.phone}</Text>
            ) : null}
            {invoice.salesOrder.customer.email ? (
              <Text style={styles.muted}>Email: {invoice.salesOrder.customer.email}</Text>
            ) : null}
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.sectionLabel}>REFERENSI</Text>
            <Text>No. SO: {invoice.salesOrder.soNumber}</Text>
            <Text>
              Gudang: {invoice.salesOrder.warehouse.code} — {invoice.salesOrder.warehouse.name}
            </Text>
            <Text>Jatuh Tempo: {formatTanggal(invoice.dueDate)}</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>RINCIAN BARANG</Text>
        <View style={styles.tableHead}>
          <Text style={{ ...styles.th, ...styles.colSku }}>SKU</Text>
          <Text style={{ ...styles.th, ...styles.colGrow }}>Nama Barang</Text>
          <Text style={{ ...styles.th, ...styles.colQty }}>Jumlah</Text>
          <Text style={{ ...styles.th, ...styles.colPrice }}>Harga Satuan</Text>
          <Text style={{ ...styles.th, ...styles.colSub }}>Subtotal</Text>
        </View>
        {invoice.salesOrder.items.map((item, index) => (
          <View key={`item-${index}`} style={styles.row}>
            <Text style={{ ...styles.td, ...styles.colSku }}>{item.product.sku}</Text>
            <Text style={{ ...styles.td, ...styles.colGrow }}>{item.product.name}</Text>
            <Text style={{ ...styles.td, ...styles.colQty }}>
              {item.quantity} {item.product.unit}
            </Text>
            <Text style={{ ...styles.td, ...styles.colPrice }}>{formatRupiah(item.unitPrice)}</Text>
            <Text style={{ ...styles.td, ...styles.colSub }}>
              {formatRupiah(item.quantity * item.unitPrice)}
            </Text>
          </View>
        ))}

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Tagihan</Text>
            <Text style={styles.totalValue}>{formatRupiah(invoice.totalAmount)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Sudah Dibayar</Text>
            <Text style={styles.totalValue}>{formatRupiah(invoice.paidAmount)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Sisa Tagihan</Text>
            <Text
              style={{
                ...styles.totalValue,
                color: invoice.remainingAmount > 0 ? '#B91C1C' : '#15803D',
              }}
            >
              {formatRupiah(invoice.remainingAmount)}
            </Text>
          </View>
        </View>

        {invoice.payments.length > 0 ? (
          <View style={{ marginTop: 18 }}>
            <Text style={styles.sectionLabel}>RIWAYAT PEMBAYARAN</Text>
            <View style={styles.tableHead}>
              <Text style={{ ...styles.th, width: 90 }}>Tanggal</Text>
              <Text style={{ ...styles.th, width: 70 }}>Metode</Text>
              <Text style={{ ...styles.th, ...styles.colGrow }}>Catatan</Text>
              <Text style={{ ...styles.th, width: 100 }}>Dicatat Oleh</Text>
              <Text style={{ ...styles.th, ...styles.colSub }}>Nominal</Text>
            </View>
            {invoice.payments.map((payment, index) => (
              <View key={`payment-${index}`} style={styles.row}>
                <Text style={{ ...styles.td, width: 90 }}>{formatTanggal(payment.paidAt)}</Text>
                <Text style={{ ...styles.td, width: 70 }}>{payment.method || '-'}</Text>
                <Text style={{ ...styles.td, ...styles.colGrow }}>{payment.note || '-'}</Text>
                <Text style={{ ...styles.td, width: 100 }}>
                  {payment.user ? payment.user.name : '-'}
                </Text>
                <Text style={{ ...styles.td, ...styles.colSub }}>
                  {formatRupiah(payment.amount)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.footer}>
          <Text style={styles.muted}>
            Dokumen ini digenerate otomatis oleh {COMPANY.name} pada {generatedAt}.
          </Text>
        </View>
      </Page>
    </Document>
  );
}

/** Render faktur menjadi buffer PDF siap di-stream. */
export async function renderInvoicePdf(invoice: InvoicePdfData): Promise<Buffer> {
  return renderToBuffer(<InvoicePdfDocument invoice={invoice} />);
}
