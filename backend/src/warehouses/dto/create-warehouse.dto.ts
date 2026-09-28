import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateWarehouseDto {
  @ApiPropertyOptional({
    example: 'WH-001',
    description: 'Kode unik gudang (auto-generate jika kosong)',
  })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({ example: 'Gudang Utama Jakarta', description: 'Nama gudang' })
  @IsString()
  @IsNotEmpty({ message: 'Nama gudang tidak boleh kosong' })
  name: string;

  @ApiPropertyOptional({
    example: 'Jl. Industri No. 45, Jakarta Barat',
    description: 'Alamat fisik gudang',
  })
  @IsOptional()
  @IsString()
  address?: string;
}
