import { Controller, Get, Post, Body, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiCookieAuth } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { InvoicesService } from './invoices.service';
import { InvoiceQueryDto } from './dto/invoice-query.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { renderInvoicePdf, InvoicePdfData } from './invoice-pdf';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Finance - Invoices')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @ApiOperation({ summary: 'Daftar invoice (filter & badge OVERDUE dihitung on-read)' })
  findAll(@Query() query: InvoiceQueryDto) {
    return this.invoicesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail invoice: item SO + riwayat pembayaran + sisa tagihan' })
  findOne(@Param('id') id: string) {
    return this.invoicesService.findOne(id);
  }

  @Post(':id/payments')
  @Roles('SUPER_ADMIN', 'FINANCE_OFFICER')
  @ApiOperation({
    summary: 'Catat pembayaran invoice (status otomatis PARTIALLY_PAID/PAID + audit log)',
  })
  recordPayment(
    @Param('id') id: string,
    @Body() dto: CreatePaymentDto,
    @CurrentUser('id') userId: string,
    @Req() req: Request,
  ) {
    return this.invoicesService.recordPayment(id, dto, userId, req.ip);
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Unduh faktur dalam format PDF' })
  async downloadPdf(@Param('id') id: string, @Res() res: Response) {
    const invoice = await this.invoicesService.findOne(id);

    const pdfData: InvoicePdfData = {
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      dueDate: invoice.dueDate,
      totalAmount: invoice.totalAmount,
      paidAmount: invoice.paidAmount,
      remainingAmount: invoice.remainingAmount,
      createdAt: invoice.createdAt,
      salesOrder: {
        soNumber: invoice.salesOrder.soNumber,
        customer: invoice.salesOrder.customer,
        warehouse: invoice.salesOrder.warehouse,
        items: invoice.salesOrder.items.map((item: any) => ({
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          product: item.product,
        })),
      },
      payments: invoice.payments.map((payment: any) => ({
        amount: Number(payment.amount),
        paidAt: payment.paidAt,
        method: payment.method,
        note: payment.note,
        user: payment.user,
      })),
    };

    const buffer = await renderInvoicePdf(pdfData);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${invoice.invoiceNumber}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }
}
