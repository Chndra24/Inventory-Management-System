import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildPageMeta, resolvePaging } from '../common/utils/paging.util';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { resolveSort } from '../common/utils/sort.util';
import { isUniqueViolation } from '../common/utils/unique.util';
import * as bcrypt from 'bcrypt';

const SORTABLE_FIELDS = ['createdAt', 'updatedAt', 'name', 'email'] as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: PaginationQueryDto) {
    const { page, limit, skip } = resolvePaging(query);
    const sort = resolveSort(query.sortBy, SORTABLE_FIELDS, 'createdAt', query.sortOrder);

    const where: any = {};
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' as const } },
        { email: { contains: query.search, mode: 'insensitive' as const } },
        { role: { name: { contains: query.search, mode: 'insensitive' as const } } },
      ];
    }

    const [items, totalItems] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sort.field]: sort.order },
        include: { role: { select: { id: true, name: true, description: true } } },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: items.map(({ passwordHash: _, ...user }) => user),
      meta: buildPageMeta(page, limit, totalItems),
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { role: { select: { id: true, name: true, description: true } } },
    });
    if (!user) throw new NotFoundException('Pengguna tidak ditemukan');
    const { passwordHash: _, ...result } = user;
    return result;
  }

  async create(dto: CreateUserDto, adminId?: string, ip?: string) {
    const email = dto.email.toLowerCase().trim();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email sudah terdaftar');

    const role = await this.prisma.role.findUnique({ where: { id: dto.roleId } });
    if (!role) throw new NotFoundException('Role tidak ditemukan');

    const passwordHash = await bcrypt.hash(dto.password, 10);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { name: dto.name, email, passwordHash, roleId: dto.roleId },
          include: { role: { select: { id: true, name: true, description: true } } },
        });

        await tx.auditLog.create({
          data: {
            userId: adminId,
            action: 'CREATE_USER',
            entity: 'User',
            entityId: user.id,
            payload: { name: user.name, email: user.email, role: role.name, ip: ip || null },
          },
        });

        const { passwordHash: _, ...result } = user;
        return result;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Email sudah terdaftar');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateUserDto, adminId?: string, ip?: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Pengguna tidak ditemukan');

    if (dto.email) {
      const email = dto.email.toLowerCase().trim();
      const existing = await this.prisma.user.findFirst({
        where: { email, NOT: { id } },
      });
      if (existing) throw new ConflictException('Email sudah digunakan pengguna lain');
    }

    if (dto.roleId) {
      const role = await this.prisma.role.findUnique({ where: { id: dto.roleId } });
      if (!role) throw new NotFoundException('Role tidak ditemukan');
    }

    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.email !== undefined) updateData.email = dto.email.toLowerCase().trim();
    if (dto.roleId !== undefined) updateData.roleId = dto.roleId;

    const newRole = dto.roleId
      ? await this.prisma.role.findUnique({ where: { id: dto.roleId } })
      : null;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id },
          data: updateData,
          include: { role: { select: { id: true, name: true, description: true } } },
        });

        await tx.auditLog.create({
          data: {
            userId: adminId,
            action: 'UPDATE_USER',
            entity: 'User',
            entityId: id,
            payload: {
              oldRole: user.roleId === updated.roleId ? undefined : user.roleId,
              newRole: newRole ? newRole.name : undefined,
              ...updateData,
              passwordHash: undefined,
              ip: ip || null,
            },
          },
        });

        const { passwordHash: _, ...result } = updated;
        return result;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Email sudah digunakan pengguna lain');
      }
      throw error;
    }
  }

  async resetPassword(id: string, dto: ResetPasswordDto, adminId?: string, ip?: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Pengguna tidak ditemukan');

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);

    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { passwordHash },
      });

      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: 'RESET_PASSWORD',
          entity: 'User',
          entityId: id,
          payload: { target: user.email, ip: ip || null },
        },
      });

      return { message: `Kata sandi "${user.email}" berhasil direset` };
    });
  }

  async remove(id: string, adminId?: string, ip?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });
    if (!user) throw new NotFoundException('Pengguna tidak ditemukan');

    // Tolak self-delete
    if (adminId && id === adminId) {
      throw new BadRequestException('Anda tidak dapat menghapus akun sendiri');
    }

    // Tolak menghapus Super Admin terakhir
    if (user.role.name === 'SUPER_ADMIN') {
      const superAdminCount = await this.prisma.user.count({
        where: { role: { name: 'SUPER_ADMIN' } },
      });
      if (superAdminCount <= 1) {
        throw new BadRequestException(
          'Tidak dapat menghapus Super Admin terakhir yang tersisa di sistem',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.user.delete({ where: { id } });

      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: 'DELETE_USER',
          entity: 'User',
          entityId: id,
          payload: { name: user.name, email: user.email, role: user.role.name, ip: ip || null },
        },
      });

      return { message: 'Pengguna berhasil dihapus' };
    });
  }
}
