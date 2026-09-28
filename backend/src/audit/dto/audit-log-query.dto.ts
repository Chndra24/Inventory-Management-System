import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class AuditLogQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'CREATE', description: 'Filter nama aksi' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ example: 'Product', description: 'Filter nama entitas' })
  @IsOptional()
  @IsString()
  entity?: string;

  @ApiPropertyOptional({ example: 'uuid-user-id', description: 'Filter ID pengguna pelaku' })
  @IsOptional()
  @IsUUID('4', { message: 'ID pengguna harus format UUID' })
  userId?: string;

  @ApiPropertyOptional({ example: '2026-09-01', description: 'Filter tanggal awal (ISO 8601)' })
  @IsOptional()
  @IsDateString({}, { message: 'Tanggal awal harus format ISO 8601' })
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-09-30', description: 'Filter tanggal akhir (ISO 8601)' })
  @IsOptional()
  @IsDateString({}, { message: 'Tanggal akhir harus format ISO 8601' })
  endDate?: string;
}
