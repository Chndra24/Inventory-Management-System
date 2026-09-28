import { Controller, Get, Post, Put, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiCookieAuth } from '@nestjs/swagger';
import { TransfersService } from './transfers.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { UpdateTransferStatusDto } from './dto/update-transfer-status.dto';
import { TransferQueryDto } from './dto/transfer-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Request } from 'express';

@ApiTags('Inventory - Stock Transfers')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Get()
  @ApiOperation({ summary: 'Dapatkan daftar Transfer Stok antar Gudang' })
  findAll(@Query() query: TransferQueryDto) {
    return this.transfersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Dapatkan detail Dokumen Transfer berdasarkan ID' })
  findOne(@Param('id') id: string) {
    return this.transfersService.findOne(id);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'WAREHOUSE_MANAGER')
  @ApiOperation({
    summary: 'Buat Dokumen Transfer Stok baru (Status awal DRAFT, Nomor TRF auto-generate)',
  })
  create(@Body() dto: CreateTransferDto, @CurrentUser('id') userId: string, @Req() req: Request) {
    return this.transfersService.create(dto, userId, req.ip);
  }

  @Put(':id/status')
  @Roles('SUPER_ADMIN', 'WAREHOUSE_MANAGER')
  @ApiOperation({
    summary: 'Perbarui Status Workflow Transfer (DRAFT -> IN_TRANSIT -> RECEIVED / CANCELLED)',
  })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTransferStatusDto,
    @CurrentUser('id') userId: string,
    @Req() req: Request,
  ) {
    return this.transfersService.updateStatus(id, dto, userId, req.ip);
  }
}
