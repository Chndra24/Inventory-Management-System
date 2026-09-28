import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class InventoryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'uuid-warehouse-id', description: 'Filter berdasarkan Gudang' })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID('4', { message: 'ID Gudang harus format UUID' })
  warehouseId?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Hanya tampilkan produk dengan stok di bawah batas minimum',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean({ message: 'lowStockOnly harus "true" atau "false"' })
  lowStockOnly?: boolean = false;
}
