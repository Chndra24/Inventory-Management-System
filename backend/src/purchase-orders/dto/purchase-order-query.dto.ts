import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { POStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class PurchaseOrderQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: POStatus, description: 'Filter berdasarkan Status PO' })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsEnum(POStatus, { message: 'Status tidak valid' })
  status?: POStatus;

  @ApiPropertyOptional({ example: 'uuid-supplier-id', description: 'Filter berdasarkan Pemasok' })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID('4', { message: 'ID Pemasok harus format UUID' })
  supplierId?: string;

  @ApiPropertyOptional({ example: 'uuid-warehouse-id', description: 'Filter berdasarkan Gudang' })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID('4', { message: 'ID Gudang harus format UUID' })
  warehouseId?: string;
}
