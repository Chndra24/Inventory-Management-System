import { ApiProperty } from '@nestjs/swagger';
import { POStatus } from '@prisma/client';
import { IsEnum, IsNotEmpty } from 'class-validator';

export class UpdatePurchaseOrderStatusDto {
  @ApiProperty({
    enum: POStatus,
    example: POStatus.PENDING,
    description: 'Status baru Purchase Order (transisi divalidasi di service)',
  })
  @IsEnum(POStatus, { message: 'Status tidak valid' })
  @IsNotEmpty()
  status: POStatus;
}
