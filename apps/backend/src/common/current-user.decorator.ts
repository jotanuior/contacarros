import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { PermissionMap } from './permissions';

export type JwtUser = {
  sub: string;
  email: string;
  role?: string;
  roleId?: string;
  permissions?: PermissionMap;
};

export const CurrentUser = createParamDecorator((_, context: ExecutionContext): JwtUser | undefined => {
  const request = context.switchToHttp().getRequest();
  return request.user as JwtUser | undefined;
});
