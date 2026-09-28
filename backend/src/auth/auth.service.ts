import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { durationToMs } from '../common/utils/duration.util';
import * as bcrypt from 'bcrypt';
import { Response } from 'express';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  private get accessTokenExpiresIn(): string {
    return this.configService.get<string>('JWT_EXPIRES_IN') || '15m';
  }

  private get refreshTokenExpiresIn(): string {
    return this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d';
  }

  async login(dto: LoginDto, response?: Response, ip?: string) {
    const email = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        role: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Email atau kata sandi salah');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email atau kata sandi salah');
    }

    const payload = { sub: user.id, email: user.email, role: user.role.name };

    const accessTokenSecret =
      this.configService.get<string>('JWT_SECRET') ||
      'super-secret-access-token-key-change-in-production';
    const refreshTokenSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET') ||
      'super-secret-refresh-token-key-change-in-production';

    const accessToken = this.jwtService.sign(payload, {
      secret: accessTokenSecret,
      expiresIn: this.accessTokenExpiresIn,
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: refreshTokenSecret,
      expiresIn: this.refreshTokenExpiresIn,
    });

    const accessMaxAge = durationToMs(this.accessTokenExpiresIn, 15 * 60 * 1000);
    const refreshMaxAge = durationToMs(this.refreshTokenExpiresIn, 7 * 24 * 60 * 60 * 1000);

    // Set Refresh Token as HTTP-Only Cookie if response object passed
    if (response) {
      response.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: refreshMaxAge,
      });

      response.cookie('access_token', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: accessMaxAge,
      });
    }

    // Create Audit Log (IP asli dari request, bukan literal)
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        entity: 'User',
        entityId: user.id,
        payload: { ip: ip || null },
      },
    });

    const { passwordHash, ...userData } = user;
    return {
      message: 'Login berhasil',
      accessToken,
      refreshToken,
      user: userData,
    };
  }

  async refreshToken(refreshTokenString: string, response?: Response) {
    if (!refreshTokenString) {
      throw new UnauthorizedException('Refresh token tidak ditemukan');
    }

    try {
      const refreshTokenSecret =
        this.configService.get<string>('JWT_REFRESH_SECRET') ||
        'super-secret-refresh-token-key-change-in-production';

      const payload = this.jwtService.verify(refreshTokenString, {
        secret: refreshTokenSecret,
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { role: true },
      });

      if (!user) {
        throw new UnauthorizedException('Pengguna tidak ditemukan');
      }

      const newPayload = { sub: user.id, email: user.email, role: user.role.name };
      const accessTokenSecret =
        this.configService.get<string>('JWT_SECRET') ||
        'super-secret-access-token-key-change-in-production';

      const newAccessToken = this.jwtService.sign(newPayload, {
        secret: accessTokenSecret,
        expiresIn: this.accessTokenExpiresIn,
      });

      if (response) {
        response.cookie('access_token', newAccessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: durationToMs(this.accessTokenExpiresIn, 15 * 60 * 1000),
        });
      }

      return {
        accessToken: newAccessToken,
      };
    } catch (err) {
      throw new UnauthorizedException('Refresh token kadaluwarsa atau tidak valid');
    }
  }

  async logout(response: Response, userId?: string) {
    response.clearCookie('refresh_token');
    response.clearCookie('access_token');

    if (userId) {
      await this.prisma.auditLog.create({
        data: {
          userId,
          action: 'LOGOUT',
          entity: 'User',
          entityId: userId,
        },
      });
    }

    return { message: 'Logout berhasil' };
  }

  async getRoles() {
    return this.prisma.role.findMany({
      orderBy: { name: 'asc' },
    });
  }
}
