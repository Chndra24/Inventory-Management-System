import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'Budi Santoso', description: 'Nama lengkap pengguna' })
  @IsString()
  @IsNotEmpty({ message: 'Nama tidak boleh kosong' })
  name: string;

  @ApiProperty({ example: 'budi@erp.com', description: 'Email pengguna (unik)' })
  @IsEmail({}, { message: 'Format email tidak valid' })
  @IsNotEmpty({ message: 'Email tidak boleh kosong' })
  email: string;

  @ApiProperty({ example: 'Password123!', description: 'Kata sandi (minimal 8 karakter)' })
  @IsString()
  @IsNotEmpty({ message: 'Kata sandi tidak boleh kosong' })
  @MinLength(8, { message: 'Kata sandi minimal 8 karakter' })
  password: string;

  @ApiProperty({ example: 'uuid-role-id', description: 'ID Role pengguna' })
  @IsUUID('4', { message: 'ID Role harus format UUID' })
  @IsNotEmpty({ message: 'Role tidak boleh kosong' })
  roleId: string;
}
