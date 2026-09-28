import { InvoiceStatus } from '@prisma/client';
import { resolveInvoiceStatus, sumPaid } from './invoice-status.util';

const NOW = new Date('2026-09-28T00:00:00.000Z');
const FUTURE = new Date('2026-10-24T00:00:00.000Z');
const PAST = new Date('2026-09-24T00:00:00.000Z');

describe('resolveInvoiceStatus (OVERDUE on-read, tanpa cron)', () => {
  it('PAID tetap PAID walau jatuh tempo lewat', () => {
    expect(resolveInvoiceStatus(InvoiceStatus.PAID, PAST, NOW)).toBe(InvoiceStatus.PAID);
  });

  it('UNPAID dengan jatuh tempo masa depan tetap UNPAID', () => {
    expect(resolveInvoiceStatus(InvoiceStatus.UNPAID, FUTURE, NOW)).toBe(InvoiceStatus.UNPAID);
  });

  it('UNPAID yang lewat jatuh tempo menjadi OVERDUE', () => {
    expect(resolveInvoiceStatus(InvoiceStatus.UNPAID, PAST, NOW)).toBe(InvoiceStatus.OVERDUE);
  });

  it('PARTIALLY_PAID yang lewat jatuh tempo menjadi OVERDUE', () => {
    expect(resolveInvoiceStatus(InvoiceStatus.PARTIALLY_PAID, PAST, NOW)).toBe(
      InvoiceStatus.OVERDUE,
    );
  });

  it('PARTIALLY_PAID sebelum jatuh tempo tetap PARTIALLY_PAID', () => {
    expect(resolveInvoiceStatus(InvoiceStatus.PARTIALLY_PAID, FUTURE, NOW)).toBe(
      InvoiceStatus.PARTIALLY_PAID,
    );
  });

  it('Tanpa jatuh tempo tidak pernah OVERDUE', () => {
    expect(resolveInvoiceStatus(InvoiceStatus.UNPAID, null, NOW)).toBe(InvoiceStatus.UNPAID);
    expect(resolveInvoiceStatus(InvoiceStatus.UNPAID, undefined, NOW)).toBe(InvoiceStatus.UNPAID);
  });

  it('Tepat di saat jatuh tempo (>= now) belum dianggap lewat', () => {
    expect(resolveInvoiceStatus(InvoiceStatus.UNPAID, NOW, NOW)).toBe(InvoiceStatus.UNPAID);
  });
});

describe('sumPaid (jumlah pembayaran dari Decimal Prisma)', () => {
  it('0 bila belum ada pembayaran', () => {
    expect(sumPaid([])).toBe(0);
  });

  it('menjumlahkan nilai number & string (konversi Decimal)', () => {
    expect(sumPaid([{ amount: 2000 }, { amount: '2500' }])).toBe(4500);
  });

  it('akurat untuk desimal uang', () => {
    expect(sumPaid([{ amount: '1500.50' }, { amount: 499.5 }])).toBe(2000);
  });
});
