import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ProductQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 'uuid-kategori-id',
    description: 'Filter berdasarkan Kategori ID',
  })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID('4', { message: 'ID Kategori harus format UUID' })
  categoryId?: string;
}
