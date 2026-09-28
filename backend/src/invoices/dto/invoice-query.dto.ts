import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional } from 'class-validator';
import { InvoiceStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class InvoiceQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: InvoiceStatus,
    description: 'Filter status invoice — OVERDUE dihitung on-read (dueDate lewat & belum lunas)',
  })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsEnum(InvoiceStatus, { message: 'Status tidak valid' })
  status?: InvoiceStatus;
}
