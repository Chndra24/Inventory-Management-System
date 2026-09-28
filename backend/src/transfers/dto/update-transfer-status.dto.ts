import { ApiProperty } from '@nestjs/swagger';
import { TransferStatus } from '@prisma/client';
import { IsEnum, IsNotEmpty } from 'class-validator';

export class UpdateTransferStatusDto {
  @ApiProperty({
    enum: TransferStatus,
    example: TransferStatus.IN_TRANSIT,
    description: 'Status baru transfer',
  })
  @IsEnum(TransferStatus, { message: 'Status tidak valid' })
  @IsNotEmpty()
  status: TransferStatus;
}
