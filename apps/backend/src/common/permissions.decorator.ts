import { SetMetadata } from '@nestjs/common';
import type { PermissionAction, PermissionScreenKey } from './permissions';

export const PERMISSION_KEY = 'permission';

export type PermissionRequirement = {
  screen: PermissionScreenKey;
  action: PermissionAction;
};

export const Permission = (screen: PermissionScreenKey, action: PermissionAction = 'view') =>
  SetMetadata(PERMISSION_KEY, { screen, action } satisfies PermissionRequirement);
