import { ApiProperty } from '@nestjs/swagger';
import { SOStatus } from '@prisma/client';
import { IsEnum, IsNotEmpty } from 'class-validator';

export class UpdateSalesOrderStatusDto {
  @ApiProperty({
    enum: SOStatus,
    example: SOStatus.ALLOCATED,
    description: 'Status baru Sales Order (transisi divalidasi di service)',
  })
  @IsEnum(SOStatus, { message: 'Status tidak valid' })
  @IsNotEmpty()
  status: SOStatus;
}
