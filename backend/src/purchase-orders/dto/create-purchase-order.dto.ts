import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class PurchaseOrderItemDto {
  @ApiProperty({ example: 'uuid-product-id', description: 'ID Produk' })
  @IsUUID('4', { message: 'ID Produk harus format UUID' })
  @IsNotEmpty({ message: 'Produk tidak boleh kosong' })
  productId: string;

  @ApiProperty({ example: 10, description: 'Jumlah barang yang dipesan' })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Jumlah minimal 1' })
  quantity: number;

  @ApiProperty({ example: 120000, description: 'Harga satuan saat pemesanan' })
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Harga satuan tidak boleh negatif' })
  unitPrice: number;
}

export class CreatePurchaseOrderDto {
  @ApiProperty({ example: 'uuid-supplier-id', description: 'ID Pemasok' })
  @IsUUID('4')
  @IsNotEmpty({ message: 'Pemasok wajib dipilih' })
  supplierId: string;

  @ApiProperty({ example: 'uuid-warehouse-id', description: 'ID Gudang penerima barang' })
  @IsUUID('4')
  @IsNotEmpty({ message: 'Gudang wajib dipilih' })
  warehouseId: string;

  @ApiProperty({ type: [PurchaseOrderItemDto], description: 'Daftar item produk' })
  @IsArray()
  @ArrayMinSize(1, { message: 'Minimal harus ada 1 item barang' })
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items: PurchaseOrderItemDto[];
}
