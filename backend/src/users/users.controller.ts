import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiCookieAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Request } from 'express';

@ApiTags('User & Role Management')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Dapatkan daftar pengguna (Khusus Super Admin)' })
  findAll(@Query() query: PaginationQueryDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Dapatkan detail pengguna berdasarkan ID' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Buat pengguna baru dengan role tertentu' })
  create(@Body() dto: CreateUserDto, @CurrentUser('id') adminId: string, @Req() req: Request) {
    return this.usersService.create(dto, adminId, req.ip);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Perbarui nama/email/role pengguna' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser('id') adminId: string,
    @Req() req: Request,
  ) {
    return this.usersService.update(id, dto, adminId, req.ip);
  }

  @Put(':id/password')
  @ApiOperation({ summary: 'Reset kata sandi pengguna' })
  resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser('id') adminId: string,
    @Req() req: Request,
  ) {
    return this.usersService.resetPassword(id, dto, adminId, req.ip);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Hapus pengguna (Ditolak untuk self-delete & Super Admin terakhir)' })
  remove(@Param('id') id: string, @CurrentUser('id') adminId: string, @Req() req: Request) {
    return this.usersService.remove(id, adminId, req.ip);
  }
}
