import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import {
  EMPTY_PERMISSION_FLAGS,
  SCREEN_KEYS,
  type PermissionMap,
  type PermissionScreenKey,
} from '../../common/permissions';
import { CreateRoleDto, RolePermissionDto, UpdateRoleDto } from './dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

type PermissionRecord = {
  screen: PermissionScreenKey;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDeactivate: boolean;
  canExport: boolean;
};

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  listScreens() {
    return SCREEN_KEYS.map((screen) => ({
      key: screen,
      label: screen
        .toLowerCase()
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' '),
    }));
  }

  private normalizeRoleName(raw: string) {
    return raw.trim().replace(/\s+/g, ' ');
  }

  private buildPermissionMap(permissions: PermissionRecord[]): PermissionMap {
    const map = {} as PermissionMap;

    for (const screen of SCREEN_KEYS) {
      map[screen] = { ...EMPTY_PERMISSION_FLAGS };
    }

    for (const permission of permissions) {
      map[permission.screen] = {
        canView: permission.canView,
        canCreate: permission.canCreate,
        canEdit: permission.canEdit,
        canDeactivate: permission.canDeactivate,
        canExport: permission.canExport,
      };
    }

    return map;
  }

  private normalizePermissions(permissions: RolePermissionDto[] | undefined): PermissionRecord[] {
    const byScreen = new Map<PermissionScreenKey, PermissionRecord>();

    for (const screen of SCREEN_KEYS) {
      byScreen.set(screen, {
        screen,
        canView: false,
        canCreate: false,
        canEdit: false,
        canDeactivate: false,
        canExport: false,
      });
    }

    for (const item of permissions || []) {
      const screen = String(item.screen || '') as PermissionScreenKey;
      if (!SCREEN_KEYS.includes(screen)) {
        throw new BadRequestException(`Tela inválida: ${item.screen}`);
      }

      byScreen.set(screen, {
        screen,
        canView: !!item.canView,
        canCreate: !!item.canCreate,
        canEdit: !!item.canEdit,
        canDeactivate: !!item.canDeactivate,
        canExport: !!item.canExport,
      });
    }

    return SCREEN_KEYS.map((screen) => byScreen.get(screen) as PermissionRecord);
  }

  private formatRole(role: {
    id: string;
    name: string;
    description: string | null;
    isActive: boolean;
    isSystem: boolean;
    permissions: PermissionRecord[];
    _count?: { users: number };
  }) {
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      isActive: role.isActive,
      isSystem: role.isSystem,
      usersCount: role._count?.users ?? 0,
      permissions: this.buildPermissionMap(role.permissions),
    };
  }

  async findAll() {
    const roles = await this.prisma.role.findMany({
      include: {
        permissions: {
          select: {
            screen: true,
            canView: true,
            canCreate: true,
            canEdit: true,
            canDeactivate: true,
            canExport: true,
          },
        },
        _count: {
          select: {
            users: true,
          },
        },
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });

    return roles.map((role) => this.formatRole(role));
  }

  async findAssignable() {
    const roles = await this.prisma.role.findMany({
      where: { isActive: true },
      select: { id: true, name: true, isSystem: true },
      orderBy: { name: 'asc' },
    });

    return roles;
  }

  async create(dto: CreateRoleDto, actorId?: string) {
    const name = this.normalizeRoleName(dto.name);
    if (!name) {
      throw new BadRequestException('Nome da role é obrigatório');
    }

    const existing = await this.prisma.role.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
    if (existing) {
      throw new BadRequestException('Já existe um perfil com esse nome');
    }

    const normalizedPermissions = this.normalizePermissions(dto.permissions);

    const role = await this.prisma.role.create({
      data: {
        name,
        description: dto.description?.trim() || null,
        isActive: true,
        isSystem: false,
        permissions: {
          createMany: {
            data: normalizedPermissions,
          },
        },
      },
      include: {
        permissions: true,
        _count: { select: { users: true } },
      },
    });

    await this.auditLogs.create({
      userId: actorId,
      action: 'ROLE_CREATE',
      entityType: 'Role',
      entityId: role.id,
      description: `Perfil ${role.name} criado`,
      afterData: role,
    });

    return this.formatRole(role);
  }

  async update(id: string, dto: UpdateRoleDto, actorId?: string) {
    const current = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: true,
        _count: { select: { users: true } },
      },
    });
    if (!current) {
      throw new NotFoundException('Perfil não encontrado');
    }

    const nextName = dto.name ? this.normalizeRoleName(dto.name) : undefined;
    if (nextName && nextName !== current.name) {
      if (current.isSystem) {
        throw new BadRequestException('Perfis de sistema não podem ser renomeados');
      }
      const nameTaken = await this.prisma.role.findFirst({
        where: {
          id: { not: id },
          name: { equals: nextName, mode: 'insensitive' },
        },
      });
      if (nameTaken) {
        throw new BadRequestException('Já existe um perfil com esse nome');
      }
    }

    const updated = await this.prisma.role.update({
      where: { id },
      data: {
        name: nextName,
        description: dto.description === undefined ? undefined : dto.description.trim() || null,
      },
      include: {
        permissions: true,
        _count: { select: { users: true } },
      },
    });

    await this.auditLogs.create({
      userId: actorId,
      action: 'ROLE_UPDATE',
      entityType: 'Role',
      entityId: id,
      description: `Perfil ${updated.name} atualizado`,
      beforeData: current,
      afterData: updated,
    });

    return this.formatRole(updated);
  }

  async updatePermissions(id: string, permissions: RolePermissionDto[], actorId?: string) {
    const current = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: true,
        _count: { select: { users: true } },
      },
    });
    if (!current) {
      throw new NotFoundException('Perfil não encontrado');
    }

    if (current.isSystem && current.name.toUpperCase() === 'ADMIN') {
      const hasAdminPanelAccess = permissions.some((item) => String(item.screen) === 'PERFIS' && item.canView);
      if (!hasAdminPanelAccess) {
        throw new BadRequestException('O perfil ADMIN deve manter acesso à tela de perfis');
      }
    }

    const normalized = this.normalizePermissions(permissions);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      await tx.rolePermission.createMany({
        data: normalized.map((item) => ({
          roleId: id,
          screen: item.screen,
          canView: item.canView,
          canCreate: item.canCreate,
          canEdit: item.canEdit,
          canDeactivate: item.canDeactivate,
          canExport: item.canExport,
        })),
      });

      return tx.role.findUniqueOrThrow({
        where: { id },
        include: {
          permissions: true,
          _count: { select: { users: true } },
        },
      });
    });

    await this.auditLogs.create({
      userId: actorId,
      action: 'ROLE_PERMISSIONS_UPDATE',
      entityType: 'Role',
      entityId: id,
      description: `Permissões do perfil ${updated.name} atualizadas`,
      beforeData: current,
      afterData: updated,
    });

    return this.formatRole(updated);
  }

  async deactivate(id: string, actorId?: string) {
    const current = await this.prisma.role.findUnique({
      where: { id },
      include: {
        _count: { select: { users: true } },
      },
    });
    if (!current) {
      throw new NotFoundException('Perfil não encontrado');
    }

    if (current.isSystem || current.name.toUpperCase() === 'ADMIN') {
      throw new BadRequestException('Perfil de sistema não pode ser desativado');
    }

    const activeUsers = await this.prisma.user.count({
      where: { roleId: id, isActive: true },
    });

    if (activeUsers > 0) {
      throw new BadRequestException('Não é possível desativar perfil com usuários ativos');
    }

    const updated = await this.prisma.role.update({
      where: { id },
      data: { isActive: false },
      include: {
        permissions: true,
        _count: { select: { users: true } },
      },
    });

    await this.auditLogs.create({
      userId: actorId,
      action: 'ROLE_DEACTIVATE',
      entityType: 'Role',
      entityId: id,
      description: `Perfil ${updated.name} desativado`,
      beforeData: current,
      afterData: updated,
    });

    return this.formatRole(updated);
  }
}
