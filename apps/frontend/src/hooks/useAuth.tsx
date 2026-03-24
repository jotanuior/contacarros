import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  initializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem('cc_user');
    return raw ? (JSON.parse(raw) as User) : null;
  });
  const [loading, setLoading] = useState(false);

  // Listen for forced-logout events emitted by the axios interceptor
  useEffect(() => {
    const handler = () => {
      setUser(null);
      localStorage.removeItem('cc_user');
      setInitializing(false);
    };
    window.addEventListener('cc:unauthorized', handler);
    return () => window.removeEventListener('cc:unauthorized', handler);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        const response = await api.get('/auth/me');
        if (!cancelled) {
          const nextUser = response.data as User;
          setUser(nextUser);
          localStorage.setItem('cc_user', JSON.stringify(nextUser));
        }
      } catch {
        if (!cancelled) {
          setUser(null);
          localStorage.removeItem('cc_user');
        }
      } finally {
        if (!cancelled) {
          setInitializing(false);
        }
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      const response = await api.post('/auth/login', { email, password });
      const nextUser = response.data.user as User;
      setUser(nextUser);
      localStorage.setItem('cc_user', JSON.stringify(nextUser));
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await api.post('/auth/logout').catch(() => {});
    setUser(null);
    localStorage.removeItem('cc_user');
  };

  const value = useMemo(
    () => ({ user, loading, initializing, login, logout }),
    [user, loading, initializing],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return ctx;
}
