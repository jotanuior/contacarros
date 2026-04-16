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

export type ScreenKey = (typeof SCREEN_KEYS)[number];
export type PermissionAction = 'view' | 'create' | 'edit' | 'deactivate' | 'export';

export type PermissionFlags = {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDeactivate: boolean;
  canExport: boolean;
};

export type PermissionMap = Record<ScreenKey, PermissionFlags>;

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  roleId: string;
  permissions: PermissionMap;
};

export type AppRoute = {
  path: string;
  label: string;
  screen: ScreenKey;
};

export const APP_ROUTES: AppRoute[] = [
  { path: '/dashboard', label: 'Dashboard', screen: 'DASHBOARD' },
  { path: '/leituras', label: 'Leituras', screen: 'LEITURAS' },
  { path: '/trajetos', label: 'Trajetos', screen: 'TRAJETOS' },
  { path: '/alertas', label: 'Alertas', screen: 'ALERTAS' },
  { path: '/pesados', label: 'Pesados', screen: 'PESADOS' },
  { path: '/locais', label: 'Locais', screen: 'LOCAIS' },
  { path: '/cameras', label: 'Cameras', screen: 'CAMERAS' },
  { path: '/regras-rota', label: 'Regras de rota', screen: 'REGRAS_ROTA' },
  { path: '/usuarios', label: 'Usuarios', screen: 'USUARIOS' },
  { path: '/perfis', label: 'Perfis', screen: 'PERFIS' },
  { path: '/auditoria', label: 'Auditoria', screen: 'AUDITORIA' },
  { path: '/relatorios', label: 'Relatorios', screen: 'RELATORIOS' },
  { path: '/veiculos', label: 'Veiculos', screen: 'VEICULOS' },
  { path: '/configuracoes', label: 'Configuracoes', screen: 'CONFIGURACOES' },
  { path: '/simulador-webhook', label: 'Simulador Webhook', screen: 'SIMULADOR_WEBHOOK' },
];

export function hasPermission(user: AuthUser | null, screen: ScreenKey, action: PermissionAction = 'view') {
  if (!user) return false;
  const flags = user.permissions?.[screen];
  if (!flags) return false;
  if (action === 'view') return !!flags.canView;
  if (action === 'create') return !!flags.canCreate;
  if (action === 'edit') return !!flags.canEdit;
  if (action === 'deactivate') return !!flags.canDeactivate;
  return !!flags.canExport;
}

export function getFirstAllowedRoute(user: AuthUser | null) {
  if (!user) return '/login';
  const first = APP_ROUTES.find((item) => hasPermission(user, item.screen, 'view'));
  return first?.path || '/login';
}
