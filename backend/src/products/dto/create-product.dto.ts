import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateProductDto {
  @ApiPropertyOptional({
    example: 'PRD-202609-0001',
    description: 'SKU unik produk (auto-generate jika kosong)',
  })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({ example: '8991234567890', description: 'Barcode produk' })
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiProperty({ example: 'Laptop Asus Zenbook', description: 'Nama produk' })
  @IsString()
  @IsNotEmpty({ message: 'Nama produk tidak boleh kosong' })
  name: string;

  @ApiPropertyOptional({ example: 'Pcs', default: 'Pcs', description: 'Satuan unit produk' })
  @IsOptional()
  @IsString()
  unit?: string = 'Pcs';

  @ApiProperty({ example: 'uuid-kategori-id', description: 'ID Kategori' })
  @IsUUID('4', { message: 'ID Kategori harus berupa UUID' })
  @IsNotEmpty({ message: 'Kategori tidak boleh kosong' })
  categoryId: string;

  @ApiPropertyOptional({ example: 5, default: 0, description: 'Batas stok minimum' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minStock?: number = 0;

  @ApiProperty({ example: 12000000, description: 'Harga beli (HPP)' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  buyPrice: number;

  @ApiProperty({ example: 15000000, description: 'Harga jual' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sellPrice: number;
}
