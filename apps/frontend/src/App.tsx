import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { AppLayout } from './components/app-layout';

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

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<PrivateRoutes />}>
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="leituras" element={<ReadingsPage />} />
          <Route path="trajetos" element={<TripsPage />} />
          <Route path="alertas" element={<AlertsPage />} />
          <Route path="pesados" element={<HeavyPage />} />
          <Route path="locais" element={<LocationsPage />} />
          <Route path="cameras" element={<CamerasPage />} />
          <Route path="regras-rota" element={<RouteRulesPage />} />
          <Route path="usuarios" element={<UsersPage />} />
          <Route path="auditoria" element={<AuditPage />} />
          <Route path="relatorios" element={<ReportsPage />} />
          <Route path="veiculos" element={<VehiclesPage />} />
          <Route path="configuracoes" element={<SettingsPage />} />
          <Route path="simulador-webhook" element={<WebhookSimulatorPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}
