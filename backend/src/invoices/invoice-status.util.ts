import { InvoiceStatus } from '@prisma/client';

/**
 * Status TERSIMPAN di database hanya UNPAID / PARTIALLY_PAID / PAID.
 * OVERDUE dihitung ON-READ (Fase 5, tanpa cron job):
 * jatuh tempo sudah lewat dan invoice belum lunas.
 */
export function resolveInvoiceStatus(
  status: InvoiceStatus,
  dueDate: Date | null | undefined,
  now: Date = new Date(),
): InvoiceStatus {
  if (status === InvoiceStatus.PAID) return status;
  if (dueDate && dueDate.getTime() < now.getTime()) return InvoiceStatus.OVERDUE;
  return status;
}

/** Jumlah pembayaran dari daftar payment (amount adalah Decimal Prisma). */
export function sumPaid(payments: Array<{ amount: unknown }>): number {
  return payments.reduce((acc, payment) => acc + Number(payment.amount), 0);
}
