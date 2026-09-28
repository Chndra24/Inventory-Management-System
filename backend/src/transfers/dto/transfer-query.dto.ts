import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { TransferStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class TransferQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TransferStatus, description: 'Filter berdasarkan Status Transfer' })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsEnum(TransferStatus, { message: 'Status tidak valid' })
  status?: TransferStatus;

  @ApiPropertyOptional({ example: 'uuid-warehouse-asal', description: 'Filter Gudang Asal' })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID('4', { message: 'ID Gudang Asal harus format UUID' })
  fromWarehouseId?: string;

  @ApiPropertyOptional({ example: 'uuid-warehouse-tujuan', description: 'Filter Gudang Tujuan' })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID('4', { message: 'ID Gudang Tujuan harus format UUID' })
  toWarehouseId?: string;
}
