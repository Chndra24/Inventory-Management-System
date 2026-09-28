import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateSupplierDto {
  @ApiProperty({ example: 'PT Supplier Nusantara', description: 'Nama Pemasok' })
  @IsString()
  @IsNotEmpty({ message: 'Nama pemasok tidak boleh kosong' })
  name: string;

  @ApiPropertyOptional({ example: 'sales@supplier.com', description: 'Email pemasok' })
  @IsOptional()
  @IsEmail({}, { message: 'Format email tidak valid' })
  email?: string;

  @ApiPropertyOptional({ example: '081234567890', description: 'Nomor telepon' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    example: 'Jl. Rawa Gelam No. 10, Kawasan Industri Pulogadung',
    description: 'Alamat',
  })
  @IsOptional()
  @IsString()
  address?: string;
}
