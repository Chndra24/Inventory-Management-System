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
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Request } from 'express';

@ApiTags('Master Data - Customers')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @ApiOperation({ summary: 'Dapatkan daftar Pelanggan/Customer' })
  findAll(@Query() query: PaginationQueryDto) {
    return this.customersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Dapatkan detail Pelanggan berdasarkan ID' })
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'SALES_SPECIALIST')
  @ApiOperation({ summary: 'Buat Pelanggan baru' })
  create(@Body() dto: CreateCustomerDto, @CurrentUser('id') userId: string, @Req() req: Request) {
    return this.customersService.create(dto, userId, req.ip);
  }

  @Put(':id')
  @Roles('SUPER_ADMIN', 'SALES_SPECIALIST')
  @ApiOperation({ summary: 'Perbarui Pelanggan' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser('id') userId: string,
    @Req() req: Request,
  ) {
    return this.customersService.update(id, dto, userId, req.ip);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'SALES_SPECIALIST')
  @ApiOperation({ summary: 'Hapus Pelanggan (Restricted Delete)' })
  remove(@Param('id') id: string, @CurrentUser('id') userId: string, @Req() req: Request) {
    return this.customersService.remove(id, userId, req.ip);
  }
}
