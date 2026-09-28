import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Budi Santoso', description: 'Nama lengkap pengguna' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Nama tidak boleh kosong' })
  name?: string;

  @ApiPropertyOptional({ example: 'budi@erp.com', description: 'Email pengguna (unik)' })
  @IsOptional()
  @IsEmail({}, { message: 'Format email tidak valid' })
  email?: string;

  @ApiPropertyOptional({ example: 'uuid-role-id', description: 'ID Role pengguna' })
  @IsOptional()
  @IsUUID('4', { message: 'ID Role harus format UUID' })
  roleId?: string;
}
