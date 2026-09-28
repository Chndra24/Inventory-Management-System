import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class TransferItemDto {
  @ApiProperty({ example: 'uuid-product-id', description: 'ID Produk' })
  @IsUUID('4', { message: 'ID Produk harus format UUID' })
  @IsNotEmpty({ message: 'Produk tidak boleh kosong' })
  productId: string;

  @ApiProperty({ example: 5, description: 'Jumlah barang yang dipindahkan' })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Jumlah minimal 1' })
  quantity: number;
}

export class CreateTransferDto {
  @ApiProperty({ example: 'uuid-warehouse-asal', description: 'ID Gudang Asal' })
  @IsUUID('4')
  @IsNotEmpty({ message: 'Gudang asal wajib dipilih' })
  fromWarehouseId: string;

  @ApiProperty({ example: 'uuid-warehouse-tujuan', description: 'ID Gudang Tujuan' })
  @IsUUID('4')
  @IsNotEmpty({ message: 'Gudang tujuan wajib dipilih' })
  toWarehouseId: string;

  @ApiPropertyOptional({
    example: 'Permintaan penambahan stok toko cabang',
    description: 'Catatan tambahan',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [TransferItemDto], description: 'Daftar item produk' })
  @IsArray()
  @ArrayMinSize(1, { message: 'Minimal harus ada 1 item barang yang dipindahkan' })
  @ValidateNested({ each: true })
  @Type(() => TransferItemDto)
  items: TransferItemDto[];
}
