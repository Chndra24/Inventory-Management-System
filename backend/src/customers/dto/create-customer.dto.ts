import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCustomerDto {
  @ApiProperty({ example: 'CV Maju Bersama', description: 'Nama Pelanggan' })
  @IsString()
  @IsNotEmpty({ message: 'Nama pelanggan tidak boleh kosong' })
  name: string;

  @ApiPropertyOptional({ example: 'purchasing@majubersama.com', description: 'Email pelanggan' })
  @IsOptional()
  @IsEmail({}, { message: 'Format email tidak valid' })
  email?: string;

  @ApiPropertyOptional({ example: '089876543210', description: 'Nomor telepon' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    example: 'Jl. Gatot Subroto No. 88, Jakarta Selatan',
    description: 'Alamat',
  })
  @IsOptional()
  @IsString()
  address?: string;
}
