import { Controller, Get, Post, Body, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiCookieAuth } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { InventoryQueryDto } from './dto/inventory-query.dto';
import { MovementQueryDto } from './dto/movement-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Request } from 'express';

@ApiTags('Inventory & Stock')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @ApiOperation({ summary: 'Dapatkan Overview Stok Produk (Global & per Gudang)' })
  getOverview(@Query() query: InventoryQueryDto) {
    return this.inventoryService.getOverview({
      ...query,
      lowStockOnly: query.lowStockOnly ?? false,
    });
  }

  @Get('movements')
  @ApiOperation({ summary: 'Dapatkan Audit Log Pergerakan Stok (Movements)' })
  getMovements(@Query() query: MovementQueryDto) {
    return this.inventoryService.getMovements(query);
  }

  @Post('adjust')
  @Roles('SUPER_ADMIN', 'WAREHOUSE_MANAGER')
  @ApiOperation({
    summary: 'Penyesuaian Stok Manual (Penyesuaian Opnam/Barang Rusak - Wajib isi alasan)',
  })
  adjustStock(@Body() dto: AdjustStockDto, @CurrentUser('id') userId: string, @Req() req: Request) {
    return this.inventoryService.adjustStock(dto, userId, req.ip);
  }
}
