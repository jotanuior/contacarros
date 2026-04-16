import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Button } from './ui';
import { APP_ROUTES } from '../lib/rbac';

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, canAccess } = useAuth();
  const menu = APP_ROUTES.filter((item) => canAccess(item.screen, 'view')).map((item) => ({
    to: item.path,
    label: item.label,
  }));

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto flex max-w-[1600px]">
        <aside className="sticky top-0 h-screen w-64 border-r border-slate-200 bg-white p-4">
          <div className="mb-6 text-lg font-bold">ContaCarros</div>
          <nav className="space-y-1">
            {menu.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`block rounded-md px-3 py-2 text-sm ${location.pathname.startsWith(item.to) ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <main className="flex-1 p-6">
          <header className="mb-4 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
            <div>
              <p className="text-sm text-slate-500">Usuário logado</p>
              <p className="text-sm font-medium">{user?.name} ({user?.role})</p>
            </div>
            <Button
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              Sair
            </Button>
          </header>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
