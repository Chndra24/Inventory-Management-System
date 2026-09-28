import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ example: 'Password456!', description: 'Kata sandi baru (minimal 8 karakter)' })
  @IsString()
  @IsNotEmpty({ message: 'Kata sandi baru tidak boleh kosong' })
  @MinLength(8, { message: 'Kata sandi minimal 8 karakter' })
  newPassword: string;
}
