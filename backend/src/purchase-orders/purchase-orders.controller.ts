import { Controller, Get, Post, Put, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiCookieAuth } from '@nestjs/swagger';
import { PurchaseOrdersService } from './purchase-orders.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { UpdatePurchaseOrderStatusDto } from './dto/purchase-order-status.dto';
import { PurchaseOrderQueryDto } from './dto/purchase-order-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Request } from 'express';

@ApiTags('Procurement - Purchase Orders')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  @Get()
  @ApiOperation({ summary: 'Dapatkan daftar Purchase Order' })
  findAll(@Query() query: PurchaseOrderQueryDto) {
    return this.purchaseOrdersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Dapatkan detail Purchase Order berdasarkan ID' })
  findOne(@Param('id') id: string) {
    return this.purchaseOrdersService.findOne(id);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'PURCHASING_OFFICER')
  @ApiOperation({
    summary: 'Buat PO baru (Status awal DRAFT, nomor PO auto-generate, total dihitung server)',
  })
  create(
    @Body() dto: CreatePurchaseOrderDto,
    @CurrentUser('id') userId: string,
    @Req() req: Request,
  ) {
    return this.purchaseOrdersService.create(dto, userId, req.ip);
  }

  @Put(':id')
  @Roles('SUPER_ADMIN', 'PURCHASING_OFFICER')
  @ApiOperation({ summary: 'Perbarui PO (hanya saat status DRAFT)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseOrderDto,
    @CurrentUser('id') userId: string,
    @Req() req: Request,
  ) {
    return this.purchaseOrdersService.update(id, dto, userId, req.ip);
  }

  @Put(':id/status')
  @Roles('SUPER_ADMIN', 'PURCHASING_OFFICER', 'FINANCE_OFFICER')
  @ApiOperation({
    summary:
      'Transisi status PO (DRAFT->PENDING->APPROVED->RECEIVED->COMPLETED / CANCELLED). Whitelist transisi + role per aksi divalidasi di service: APPROVED hanya SUPER_ADMIN, RECEIVED menambah stok atomic, COMPLETED hanya FINANCE/SUPER_ADMIN.',
  })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseOrderStatusDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: { name: string },
    @Req() req: Request,
  ) {
    return this.purchaseOrdersService.updateStatus(id, dto, userId, role?.name, req.ip);
  }
}
