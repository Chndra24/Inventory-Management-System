import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildPageMeta, resolvePaging } from '../common/utils/paging.util';
import { InvoiceQueryDto } from './dto/invoice-query.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { InvoiceStatus } from '@prisma/client';
import { resolveSort } from '../common/utils/sort.util';
import { resolveInvoiceStatus, sumPaid } from './invoice-status.util';

const SORTABLE_FIELDS = [
  'createdAt',
  'updatedAt',
  'invoiceNumber',
  'dueDate',
  'totalAmount',
  'status',
] as const;

/** Shape list: data ringkas utk tabel (tanpa item). */
const LIST_INCLUDE = {
  salesOrder: {
    select: {
      id: true,
      soNumber: true,
      status: true,
      customer: { select: { id: true, name: true } },
      warehouse: { select: { id: true, code: true, name: true } },
    },
  },
  payments: { select: { id: true, amount: true, paidAt: true, method: true } },
} as const;

/** Shape detail: item SO (untuk modal & PDF) + riwayat pembayaran lengkap. */
const DETAIL_INCLUDE = {
  salesOrder: {
    include: {
      customer: true,
      warehouse: { select: { id: true, code: true, name: true, address: true } },
      items: {
        include: {
          product: { select: { id: true, sku: true, name: true, unit: true } },
        },
      },
    },
  },
  payments: {
    orderBy: { paidAt: 'desc' as const },
    include: { user: { select: { id: true, name: true } } },
  },
} as const;

@Injectable()
export class InvoicesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Normalisasi row invoice: total/paid/remaining jadi number +
   * status efektif (OVERDUE turunan, bukan nilai tersimpan).
   */
  private toDto(invoice: any) {
    const totalAmount = Number(invoice.totalAmount);
    const paidAmount = sumPaid(invoice.payments || []);
    return {
      ...invoice,
      totalAmount,
      paidAmount,
      remainingAmount: Math.max(totalAmount - paidAmount, 0),
      status: resolveInvoiceStatus(invoice.status, invoice.dueDate),
      storedStatus: invoice.status,
    };
  }

  async findAll(query: InvoiceQueryDto) {
    const { page, limit, skip } = resolvePaging(query);
    const sort = resolveSort(query.sortBy, SORTABLE_FIELDS, 'createdAt', query.sortOrder);

    const conditions: any[] = [];

    // Filter OVERDUE = kondisi turunan (status belum lunas + jatuh tempo lewat),
    // selaras dengan status efektif yang ditampilkan di respons.
    if (query.status === InvoiceStatus.OVERDUE) {
      conditions.push({
        OR: [
          { status: InvoiceStatus.OVERDUE },
          {
            AND: [
              { status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIALLY_PAID] } },
              { dueDate: { lt: new Date() } },
            ],
          },
        ],
      });
    } else if (
      query.status === InvoiceStatus.UNPAID ||
      query.status === InvoiceStatus.PARTIALLY_PAID
    ) {
      // Selaras dgn status efektif: baris yang jatuh tempo-nya sudah lewat
      // tampil sbg OVERDUE, sehingga tidak boleh ikut masuk filter ini.
      conditions.push({
        AND: [
          { status: query.status },
          { OR: [{ dueDate: null }, { dueDate: { gte: new Date() } }] },
        ],
      });
    } else if (query.status) {
      conditions.push({ status: query.status });
    }

    if (query.search) {
      conditions.push({
        OR: [
          { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
          { salesOrder: { soNumber: { contains: query.search, mode: 'insensitive' } } },
          { salesOrder: { customer: { name: { contains: query.search, mode: 'insensitive' } } } },
        ],
      });
    }

    const where = conditions.length > 0 ? { AND: conditions } : {};

    const [items, totalItems] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sort.field]: sort.order },
        include: LIST_INCLUDE,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      data: items.map((invoice) => this.toDto(invoice)),
      meta: buildPageMeta(page, limit, totalItems),
    };
  }

  async findOne(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    });
    if (!invoice) throw new NotFoundException('Invoice tidak ditemukan');
    return this.toDto(invoice);
  }

  /**
   * Catat pembayaran (SUPER_ADMIN / FINANCE_OFFICER).
   * - Kunci baris invoice (FOR UPDATE) agar pembayaran paralel tidak double-count.
   * - Nominal > sisa tagihan → 400; invoice lunas → 400.
   * - Status disimpan: UNPAID → PARTIALLY_PAID → PAID (OVERDUE tetap on-read).
   */
  async recordPayment(id: string, dto: CreatePaymentDto, userId: string, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${id} FOR UPDATE`;

      const invoice = await tx.invoice.findUnique({
        where: { id },
        include: { payments: { select: { amount: true } } },
      });
      if (!invoice) throw new NotFoundException('Invoice tidak ditemukan');
      if (invoice.status === InvoiceStatus.PAID) {
        throw new BadRequestException('Invoice sudah lunas dan tidak menerima pembayaran lagi');
      }

      const totalAmount = Number(invoice.totalAmount);
      const paidAmount = sumPaid(invoice.payments);
      const remaining = totalAmount - paidAmount;
      if (dto.amount > remaining + 1e-9) {
        throw new BadRequestException(
          `Nominal melebihi sisa tagihan (sisa: Rp ${remaining.toLocaleString('id-ID')})`,
        );
      }

      await tx.payment.create({
        data: {
          invoiceId: id,
          amount: dto.amount,
          method: dto.method,
          note: dto.note,
          recordedBy: userId,
        },
      });

      const newStatus =
        paidAmount + dto.amount >= totalAmount - 1e-9
          ? InvoiceStatus.PAID
          : InvoiceStatus.PARTIALLY_PAID;
      await tx.invoice.update({ where: { id }, data: { status: newStatus } });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'RECORD_PAYMENT',
          entity: 'Invoice',
          entityId: id,
          payload: {
            invoiceNumber: invoice.invoiceNumber,
            amount: dto.amount,
            method: dto.method || null,
            newStatus,
            ip: ip || null,
          },
        },
      });

      const updated = await tx.invoice.findUnique({
        where: { id },
        include: DETAIL_INCLUDE,
      });
      return this.toDto(updated);
    });
  }
}
