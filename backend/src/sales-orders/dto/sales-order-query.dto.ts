import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { SOStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class SalesOrderQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SOStatus, description: 'Filter berdasarkan Status SO' })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsEnum(SOStatus, { message: 'Status tidak valid' })
  status?: SOStatus;

  @ApiPropertyOptional({ example: 'uuid-customer-id', description: 'Filter berdasarkan Pelanggan' })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID('4', { message: 'ID Pelanggan harus format UUID' })
  customerId?: string;

  @ApiPropertyOptional({ example: 'uuid-warehouse-id', description: 'Filter berdasarkan Gudang' })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID('4', { message: 'ID Gudang harus format UUID' })
  warehouseId?: string;
}
