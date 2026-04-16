import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { AppLayout } from './components/app-layout';
import { getFirstAllowedRoute, type ScreenKey } from './lib/rbac';
import type { ReactElement } from 'react';

const LoginPage = lazy(() => import('./pages/login-page').then((module) => ({ default: module.LoginPage })));
const DashboardPage = lazy(() => import('./pages/dashboard-page').then((module) => ({ default: module.DashboardPage })));
const ReadingsPage = lazy(() => import('./pages/readings-page').then((module) => ({ default: module.ReadingsPage })));
const TripsPage = lazy(() => import('./pages/trips-page').then((module) => ({ default: module.TripsPage })));
const AlertsPage = lazy(() => import('./pages/alerts-page').then((module) => ({ default: module.AlertsPage })));
const HeavyPage = lazy(() => import('./pages/heavy-page').then((module) => ({ default: module.HeavyPage })));
const LocationsPage = lazy(() => import('./pages/locations-page').then((module) => ({ default: module.LocationsPage })));
const CamerasPage = lazy(() => import('./pages/cameras-page').then((module) => ({ default: module.CamerasPage })));
const RouteRulesPage = lazy(() => import('./pages/route-rules-page').then((module) => ({ default: module.RouteRulesPage })));
const UsersPage = lazy(() => import('./pages/users-page').then((module) => ({ default: module.UsersPage })));
const RolesPage = lazy(() => import('./pages/roles-page').then((module) => ({ default: module.RolesPage })));
const AuditPage = lazy(() => import('./pages/audit-page').then((module) => ({ default: module.AuditPage })));
const ReportsPage = lazy(() => import('./pages/reports-page').then((module) => ({ default: module.ReportsPage })));
const SettingsPage = lazy(() => import('./pages/settings-page').then((module) => ({ default: module.SettingsPage })));
const WebhookSimulatorPage = lazy(() => import('./pages/webhook-simulator-page').then((module) => ({ default: module.WebhookSimulatorPage })));
const VehiclesPage = lazy(() => import('./pages/vehicles-page').then((module) => ({ default: module.VehiclesPage })));

function PageFallback() {
  return <div className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">Carregando tela...</div>;
}

function PrivateRoutes() {
  const { user, initializing } = useAuth();
  if (initializing) return <div className="p-6 text-sm text-slate-500">Restaurando sessão...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <AppLayout />;
}

function LoginRoute() {
  const { user, initializing } = useAuth();
  if (initializing) return <div className="p-6 text-sm text-slate-500">Restaurando sessão...</div>;
  if (user) return <Navigate to={getFirstAllowedRoute(user)} replace />;
  return <LoginPage />;
}

function ScreenRoute({ screen, children }: { screen: ScreenKey; children: ReactElement }) {
  const { user, canAccess } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (!canAccess(screen, 'view')) {
    return <Navigate to={getFirstAllowedRoute(user)} replace />;
  }
  return children;
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/" element={<PrivateRoutes />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<ScreenRoute screen="DASHBOARD"><DashboardPage /></ScreenRoute>} />
          <Route path="leituras" element={<ScreenRoute screen="LEITURAS"><ReadingsPage /></ScreenRoute>} />
          <Route path="trajetos" element={<ScreenRoute screen="TRAJETOS"><TripsPage /></ScreenRoute>} />
          <Route path="alertas" element={<ScreenRoute screen="ALERTAS"><AlertsPage /></ScreenRoute>} />
          <Route path="pesados" element={<ScreenRoute screen="PESADOS"><HeavyPage /></ScreenRoute>} />
          <Route path="locais" element={<ScreenRoute screen="LOCAIS"><LocationsPage /></ScreenRoute>} />
          <Route path="cameras" element={<ScreenRoute screen="CAMERAS"><CamerasPage /></ScreenRoute>} />
          <Route path="regras-rota" element={<ScreenRoute screen="REGRAS_ROTA"><RouteRulesPage /></ScreenRoute>} />
          <Route path="usuarios" element={<ScreenRoute screen="USUARIOS"><UsersPage /></ScreenRoute>} />
          <Route path="perfis" element={<ScreenRoute screen="PERFIS"><RolesPage /></ScreenRoute>} />
          <Route path="auditoria" element={<ScreenRoute screen="AUDITORIA"><AuditPage /></ScreenRoute>} />
          <Route path="relatorios" element={<ScreenRoute screen="RELATORIOS"><ReportsPage /></ScreenRoute>} />
          <Route path="veiculos" element={<ScreenRoute screen="VEICULOS"><VehiclesPage /></ScreenRoute>} />
          <Route path="configuracoes" element={<ScreenRoute screen="CONFIGURACOES"><SettingsPage /></ScreenRoute>} />
          <Route path="simulador-webhook" element={<ScreenRoute screen="SIMULADOR_WEBHOOK"><WebhookSimulatorPage /></ScreenRoute>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
