import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreatePaymentDto {
  @ApiProperty({ example: 500000, description: 'Nominal pembayaran dalam Rupiah' })
  @Type(() => Number)
  @IsNumber({}, { message: 'Nominal pembayaran harus berupa angka' })
  @Min(0.01, { message: 'Nominal pembayaran harus lebih dari 0' })
  amount: number;

  @ApiPropertyOptional({
    enum: ['CASH', 'TRANSFER', 'QRIS', 'OTHER'],
    description: 'Metode pembayaran',
  })
  @IsOptional()
  @IsIn(['CASH', 'TRANSFER', 'QRIS', 'OTHER'], { message: 'Metode pembayaran tidak valid' })
  method?: string;

  @ApiPropertyOptional({ example: 'Transfer BCA a/n finance', description: 'Catatan (opsional)' })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Catatan maksimal 255 karakter' })
  note?: string;
}
