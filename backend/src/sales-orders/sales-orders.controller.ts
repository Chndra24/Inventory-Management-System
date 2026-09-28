import { Controller, Get, Post, Put, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiCookieAuth } from '@nestjs/swagger';
import { SalesOrdersService } from './sales-orders.service';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { UpdateSalesOrderDto } from './dto/update-sales-order.dto';
import { UpdateSalesOrderStatusDto } from './dto/sales-order-status.dto';
import { SalesOrderQueryDto } from './dto/sales-order-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Request } from 'express';

@ApiTags('Sales - Sales Orders')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sales-orders')
export class SalesOrdersController {
  constructor(private readonly salesOrdersService: SalesOrdersService) {}

  @Get()
  @ApiOperation({ summary: 'Dapatkan daftar Sales Order' })
  findAll(@Query() query: SalesOrderQueryDto) {
    return this.salesOrdersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Dapatkan detail Sales Order berdasarkan ID' })
  findOne(@Param('id') id: string) {
    return this.salesOrdersService.findOne(id);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'SALES_SPECIALIST')
  @ApiOperation({
    summary: 'Buat SO baru (Status awal PENDING, nomor SO auto-generate, total dihitung server)',
  })
  create(@Body() dto: CreateSalesOrderDto, @CurrentUser('id') userId: string, @Req() req: Request) {
    return this.salesOrdersService.create(dto, userId, req.ip);
  }

  @Put(':id')
  @Roles('SUPER_ADMIN', 'SALES_SPECIALIST')
  @ApiOperation({ summary: 'Perbarui SO (hanya saat status PENDING)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSalesOrderDto,
    @CurrentUser('id') userId: string,
    @Req() req: Request,
  ) {
    return this.salesOrdersService.update(id, dto, userId, req.ip);
  }

  @Put(':id/status')
  @Roles('SUPER_ADMIN', 'SALES_SPECIALIST')
  @ApiOperation({
    summary:
      'Transisi status SO (PENDING->ALLOCATED->INVOICED->COMPLETED / CANCELLED). ALLOCATED memotong stok atomic (anti negative-stock), INVOICED membuat record invoice UNPAID, CANCELLED hanya dari PENDING (stok belum bergerak).',
  })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateSalesOrderStatusDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: { name: string },
    @Req() req: Request,
  ) {
    return this.salesOrdersService.updateStatus(id, dto, userId, role?.name, req.ip);
  }
}
