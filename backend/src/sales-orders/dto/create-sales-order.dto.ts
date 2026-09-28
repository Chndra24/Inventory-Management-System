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

export class SalesOrderItemDto {
  @ApiProperty({ example: 'uuid-product-id', description: 'ID Produk' })
  @IsUUID('4', { message: 'ID Produk harus format UUID' })
  @IsNotEmpty({ message: 'Produk tidak boleh kosong' })
  productId: string;

  @ApiProperty({ example: 5, description: 'Jumlah barang yang dijual' })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Jumlah minimal 1' })
  quantity: number;

  @ApiProperty({ example: 150000, description: 'Harga satuan saat pemesanan' })
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Harga satuan tidak boleh negatif' })
  unitPrice: number;
}

export class CreateSalesOrderDto {
  @ApiProperty({ example: 'uuid-customer-id', description: 'ID Pelanggan' })
  @IsUUID('4')
  @IsNotEmpty({ message: 'Pelanggan wajib dipilih' })
  customerId: string;

  @ApiProperty({ example: 'uuid-warehouse-id', description: 'ID Gudang pengirim barang' })
  @IsUUID('4')
  @IsNotEmpty({ message: 'Gudang wajib dipilih' })
  warehouseId: string;

  @ApiProperty({ type: [SalesOrderItemDto], description: 'Daftar item produk' })
  @IsArray()
  @ArrayMinSize(1, { message: 'Minimal harus ada 1 item barang' })
  @ValidateNested({ each: true })
  @Type(() => SalesOrderItemDto)
  items: SalesOrderItemDto[];
}
