import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/prisma.service';
import { LoginDto } from './dto';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { AuditLogsService } from '../../modules/audit-logs/audit-logs.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  private async issueTokens(userId: string, email: string, roleName: string) {
    const accessToken = await this.jwt.signAsync({ sub: userId, email, role: roleName });

    const rawToken = crypto.randomBytes(48).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await this.prisma.refreshToken.create({ data: { userId, tokenHash, expiresAt } });

    return { accessToken, refreshToken: rawToken };
  }

  private hashRefreshToken(rawToken: string) {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  async login(dto: LoginDto, ip?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { role: true },
    });

    if (!user || !user.isActive) {
      await this.auditLogs.create({
        action: 'LOGIN_FALHA',
        entityType: 'Auth',
        description: `Falha de login para ${dto.email}`,
        ip,
        userAgent,
      });
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const validPassword = await bcrypt.compare(dto.password, user.passwordHash);
    if (!validPassword) {
      await this.auditLogs.create({
        userId: user.id,
        action: 'LOGIN_FALHA',
        entityType: 'Auth',
        description: `Falha de login para ${dto.email}`,
        ip,
        userAgent,
      });
      throw new UnauthorizedException('Credenciais inválidas');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const { accessToken, refreshToken } = await this.issueTokens(user.id, user.email, user.role.name);

    await this.auditLogs.create({
      userId: user.id,
      action: 'LOGIN',
      entityType: 'Auth',
      description: `Login realizado por ${user.email}`,
      ip,
      userAgent,
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role.name,
      },
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    if (!user) {
      throw new UnauthorizedException();
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role.name,
    };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException();
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new BadRequestException('Senha atual inválida');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });

    await this.auditLogs.create({
      userId,
      action: 'CHANGE_PASSWORD',
      entityType: 'User',
      entityId: userId,
      description: 'Troca de senha realizada',
    });

    return { success: true };
  }

  async refresh(rawToken?: string) {
    if (!rawToken) {
      throw new UnauthorizedException('Refresh token ausente');
    }

    const tokenHash = this.hashRefreshToken(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { role: true } } },
    });

    if (!stored || stored.expiresAt < new Date() || !stored.user.isActive) {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    // Token rotation: delete old, issue new pair
    await this.prisma.refreshToken.delete({ where: { id: stored.id } });

    const tokens = await this.issueTokens(stored.user.id, stored.user.email, stored.user.role.name);
    return { ...tokens, user: { id: stored.user.id, name: stored.user.name, email: stored.user.email, role: stored.user.role.name } };
  }

  async logout(userId: string, rawToken?: string) {
    if (rawToken) {
      const tokenHash = this.hashRefreshToken(rawToken);
      await this.prisma.refreshToken.deleteMany({ where: { tokenHash, userId } });
    } else {
      // Revoke all refresh tokens for user (logout everywhere)
      await this.prisma.refreshToken.deleteMany({ where: { userId } });
    }

    await this.auditLogs.create({
      userId,
      action: 'LOGOUT',
      entityType: 'Auth',
      description: 'Logout realizado',
    });
    return { success: true };
  }
}