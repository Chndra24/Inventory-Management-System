import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsString, IsUUID, Min } from 'class-validator';

export enum AdjustmentType {
  IN = 'IN',
  OUT = 'OUT',
}

export class AdjustStockDto {
  @ApiProperty({ example: 'uuid-product-id', description: 'ID Produk' })
  @IsUUID('4', { message: 'ID Produk harus format UUID' })
  @IsNotEmpty({ message: 'Produk tidak boleh kosong' })
  productId: string;

  @ApiProperty({ example: 'uuid-warehouse-id', description: 'ID Gudang' })
  @IsUUID('4', { message: 'ID Gudang harus format UUID' })
  @IsNotEmpty({ message: 'Gudang tidak boleh kosong' })
  warehouseId: string;

  @ApiProperty({
    enum: AdjustmentType,
    example: AdjustmentType.IN,
    description: 'Jenis penyesuaian (IN atau OUT)',
  })
  @IsEnum(AdjustmentType, { message: 'Jenis penyesuaian harus IN atau OUT' })
  type: AdjustmentType;

  @ApiProperty({ example: 10, description: 'Jumlah penyesuaian stok' })
  @Type(() => Number)
  @IsInt({ message: 'Jumlah harus berupa angka bulat' })
  @Min(1, { message: 'Jumlah minimal 1' })
  quantity: number;

  @ApiProperty({
    example: 'Selisih opnam fisik bulanan',
    description: 'Alasan penyesuaian stok (WAJIB)',
  })
  @IsString()
  @IsNotEmpty({ message: 'Alasan penyesuaian stok wajib diisi' })
  reason: string;
}
