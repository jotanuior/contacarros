import axios from 'axios';

function normalizeBasePath(value?: string) {
  if (!value || value === '/') return '';
  return `/${value.replace(/^\/+|\/+$/g, '')}`;
}

function readCookie(name: string) {
  if (typeof document === 'undefined') {
    return undefined;
  }

  const pair = document.cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));

  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : undefined;
}

function getCsrfToken() {
  return readCookie('cc_csrf_token');
}

const appBasePath = normalizeBasePath(import.meta.env.VITE_APP_BASE_PATH || '/');
const API_BASE_URL = import.meta.env.VITE_API_URL || `${appBasePath}/api`;

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const method = config.method?.toUpperCase();
  if (method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }
  }
  return config;
});

let isRefreshing = false;
let refreshSubscribers: Array<() => void> = [];

function subscribeTokenRefresh(cb: () => void) {
  refreshSubscribers.push(cb);
}

function onTokenRefreshed() {
  refreshSubscribers.forEach((cb) => cb());
  refreshSubscribers = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as (typeof error.config & { _retry?: boolean });
    if (
      error.response?.status !== 401 ||
      original?._retry ||
      original?.url?.includes('/auth/login') ||
      original?.url?.includes('/auth/refresh')
    ) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve) => {
        subscribeTokenRefresh(() => {
          resolve(api(original));
        });
      });
    }

    original._retry = true;
    isRefreshing = true;

    try {
      await axios.post(
        `${API_BASE_URL}/auth/refresh`,
        {},
        {
          withCredentials: true,
          headers: getCsrfToken() ? { 'X-CSRF-Token': getCsrfToken() } : undefined,
        },
      );
      onTokenRefreshed();
      return api(original);
    } catch {
      window.dispatchEvent(new Event('cc:unauthorized'));
      return Promise.reject(error);
    } finally {
      isRefreshing = false;
    }
  },
);

