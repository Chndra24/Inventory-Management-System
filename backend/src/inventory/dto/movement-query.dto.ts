import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { StockMovementType } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class MovementQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'uuid-warehouse-id', description: 'Filter berdasarkan Gudang' })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID('4', { message: 'ID Gudang harus format UUID' })
  warehouseId?: string;

  @ApiPropertyOptional({ example: 'uuid-product-id', description: 'Filter berdasarkan Produk' })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID('4', { message: 'ID Produk harus format UUID' })
  productId?: string;

  @ApiPropertyOptional({ enum: StockMovementType, description: 'Filter berdasarkan Jenis Gerakan' })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsEnum(StockMovementType, { message: 'Jenis gerakan stok tidak valid' })
  type?: StockMovementType;
}
