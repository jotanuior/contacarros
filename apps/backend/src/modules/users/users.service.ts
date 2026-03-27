import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { PaginatedResponse, PaginationDto } from '../../common/pagination.dto';
import { CreateUserDto, UpdateUserDto } from './dto';
import * as bcrypt from 'bcrypt';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async create(dto: CreateUserDto, actorId?: string) {
    const role = await this.prisma.role.findFirst({ where: { name: dto.role as any } });
    if (!role) throw new BadRequestException('Perfil inválido');

    const exists = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (exists) throw new BadRequestException('E-mail já cadastrado');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email.toLowerCase(),
        passwordHash,
        roleId: role.id,
      },
      include: { role: true },
    });

    await this.auditLogs.create({
      userId: actorId,
      action: 'USER_CREATE',
      entityType: 'User',
      entityId: user.id,
      description: `Usuário ${user.email} criado`,
      afterData: user,
    });

    return user;
  }

  async findAll(pagination: PaginationDto = {}) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        include: { role: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count(),
    ]);

    return PaginatedResponse.of(data, total, page, limit);
  }

  async update(id: string, dto: UpdateUserDto, actorId?: string) {
    const existing = await this.prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!existing) throw new NotFoundException('Usuário não encontrado');

    let roleId = existing.roleId;
    if (dto.role) {
      const role = await this.prisma.role.findFirst({ where: { name: dto.role as any } });
      if (!role) throw new BadRequestException('Perfil inválido');
      roleId = role.id;
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name,
        isActive: dto.isActive,
        roleId,
      },
      include: { role: true },
    });

    await this.auditLogs.create({
      userId: actorId,
      action: 'USER_UPDATE',
      entityType: 'User',
      entityId: id,
      description: `Usuário ${updated.email} atualizado`,
      beforeData: existing,
      afterData: updated,
    });

    return updated;
  }

  async changePasswordByAdmin(id: string, newPassword: string, actorId?: string) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Usuário não encontrado');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });

    await this.auditLogs.create({
      userId: actorId,
      action: 'USER_PASSWORD_RESET',
      entityType: 'User',
      entityId: id,
      description: `Senha do usuário ${existing.email} alterada por administrador`,
    });

    return { success: true };
  }

  async deactivate(id: string, actorId?: string) {
    const existing = await this.prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!existing) throw new NotFoundException('Usuário não encontrado');
    if (existing.role.name === 'ADMIN') {
      throw new BadRequestException('Não é permitido desativar usuário ADMIN');
    }

    const updated = await this.prisma.user.update({ where: { id }, data: { isActive: false }, include: { role: true } });

    await this.auditLogs.create({
      userId: actorId,
      action: 'USER_DEACTIVATE',
      entityType: 'User',
      entityId: id,
      description: `Usuário ${updated.email} desativado`,
      beforeData: existing,
      afterData: updated,
    });

    return updated;
  }
}
