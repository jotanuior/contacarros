import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { PrismaService } from './prisma.service';
import { PERMISSION_KEY } from './permissions.decorator';
import type { PermissionMap, PermissionScreenKey } from './permissions';
import { canByAction } from './permissions';
import { buildPermissionMap } from './permission-map';

type RequestUser = {
  sub: string;
  email: string;
  role?: string;
  roleId?: string;
  permissions?: PermissionMap;
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredPermission = this.reflector.getAllAndOverride<{ screen: PermissionScreenKey; action: 'view' | 'create' | 'edit' | 'deactivate' | 'export' }>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if ((!requiredRoles || requiredRoles.length === 0) && !requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as RequestUser | undefined;

    if (!user?.sub) {
      return false;
    }

    const userWithRole = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: {
        id: true,
        email: true,
        isActive: true,
        role: {
          select: {
            id: true,
            name: true,
            isActive: true,
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
          },
        },
      },
    });

    if (!userWithRole?.isActive || !userWithRole.role?.isActive) {
      return false;
    }

    const permissionMap = buildPermissionMap(userWithRole.role.permissions as Array<{
      screen: PermissionScreenKey;
      canView: boolean;
      canCreate: boolean;
      canEdit: boolean;
      canDeactivate: boolean;
      canExport: boolean;
    }>);

    request.user = {
      ...user,
      role: userWithRole.role.name,
      roleId: userWithRole.role.id,
      permissions: permissionMap,
    } as RequestUser;

    if (requiredPermission) {
      const flags = permissionMap[requiredPermission.screen];
      return canByAction(flags, requiredPermission.action);
    }

    return !!userWithRole.role?.name && Boolean(requiredRoles?.includes(userWithRole.role.name));
  }
}
