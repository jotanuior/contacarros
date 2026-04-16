import { SCREEN_KEYS } from './permissions';
import type { PermissionMap, PermissionScreenKey } from './permissions';

export function buildPermissionMap(
  permissions: Array<{
    screen: PermissionScreenKey;
    canView: boolean;
    canCreate: boolean;
    canEdit: boolean;
    canDeactivate: boolean;
    canExport: boolean;
  }>,
): PermissionMap {
  const map = {} as PermissionMap;

  for (const screen of SCREEN_KEYS) {
    map[screen] = {
      canView: false,
      canCreate: false,
      canEdit: false,
      canDeactivate: false,
      canExport: false,
    };
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
