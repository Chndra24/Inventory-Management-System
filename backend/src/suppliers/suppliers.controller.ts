import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiCookieAuth } from '@nestjs/swagger';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Request } from 'express';

@ApiTags('Master Data - Suppliers')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  @ApiOperation({ summary: 'Dapatkan daftar Pemasok/Supplier' })
  findAll(@Query() query: PaginationQueryDto) {
    return this.suppliersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Dapatkan detail Pemasok berdasarkan ID' })
  findOne(@Param('id') id: string) {
    return this.suppliersService.findOne(id);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'PURCHASING_OFFICER')
  @ApiOperation({ summary: 'Buat Pemasok baru' })
  create(@Body() dto: CreateSupplierDto, @CurrentUser('id') userId: string, @Req() req: Request) {
    return this.suppliersService.create(dto, userId, req.ip);
  }

  @Put(':id')
  @Roles('SUPER_ADMIN', 'PURCHASING_OFFICER')
  @ApiOperation({ summary: 'Perbarui Pemasok' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentUser('id') userId: string,
    @Req() req: Request,
  ) {
    return this.suppliersService.update(id, dto, userId, req.ip);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'PURCHASING_OFFICER')
  @ApiOperation({ summary: 'Hapus Pemasok (Restricted Delete)' })
  remove(@Param('id') id: string, @CurrentUser('id') userId: string, @Req() req: Request) {
    return this.suppliersService.remove(id, userId, req.ip);
  }
}
