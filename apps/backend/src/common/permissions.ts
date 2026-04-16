export const SCREEN_KEYS = [
  'DASHBOARD',
  'LEITURAS',
  'TRAJETOS',
  'ALERTAS',
  'PESADOS',
  'LOCAIS',
  'CAMERAS',
  'REGRAS_ROTA',
  'USUARIOS',
  'PERFIS',
  'AUDITORIA',
  'RELATORIOS',
  'VEICULOS',
  'CONFIGURACOES',
  'SIMULADOR_WEBHOOK',
] as const;

export const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'deactivate', 'export'] as const;

export type PermissionScreenKey = (typeof SCREEN_KEYS)[number];
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export type PermissionFlags = {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDeactivate: boolean;
  canExport: boolean;
};

export type PermissionMap = Record<PermissionScreenKey, PermissionFlags>;

export const EMPTY_PERMISSION_FLAGS: PermissionFlags = {
  canView: false,
  canCreate: false,
  canEdit: false,
  canDeactivate: false,
  canExport: false,
};

export function canByAction(flags: PermissionFlags | undefined, action: PermissionAction) {
  if (!flags) return false;
  if (action === 'view') return flags.canView;
  if (action === 'create') return flags.canCreate;
  if (action === 'edit') return flags.canEdit;
  if (action === 'deactivate') return flags.canDeactivate;
  return flags.canExport;
}
