function normalizeBasePath(value?: string) {
  if (!value || value === '/') {
    return '';
  }

  return `/${value.replace(/^\/+|\/+$/g, '')}`;
}

export function getAppBasePath() {
  return normalizeBasePath(process.env.APP_BASE_PATH);
}

export function readCookie(rawCookieHeader: string | undefined, name: string) {
  if (!rawCookieHeader) {
    return undefined;
  }

  const pair = rawCookieHeader
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));

  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : undefined;
}

function getCookieBaseOptions(path: string) {
  const publicHost = process.env.PUBLIC_HOST?.toLowerCase() || 'localhost';
  const isLocalHost = publicHost === 'localhost' || publicHost === '127.0.0.1';
  const secure = process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === 'true'
    : process.env.NODE_ENV === 'production' && !isLocalHost;

  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path,
  };
}

export function getAccessCookieName() {
  return 'cc_access_token';
}

export function getRefreshCookieName() {
  return 'cc_refresh_token';
}

export function getCsrfCookieName() {
  return 'cc_csrf_token';
}

export function getAccessCookieOptions() {
  const appBasePath = getAppBasePath();
  return getCookieBaseOptions(`${appBasePath}/api` || '/api');
}

export function getRefreshCookieOptions() {
  const appBasePath = getAppBasePath();
  return {
    ...getCookieBaseOptions(`${appBasePath}/api/auth` || '/api/auth'),
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

export function getCsrfCookieOptions() {
  const appBasePath = getAppBasePath();
  const publicHost = process.env.PUBLIC_HOST?.toLowerCase() || 'localhost';
  const isLocalHost = publicHost === 'localhost' || publicHost === '127.0.0.1';
  const secure = process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === 'true'
    : process.env.NODE_ENV === 'production' && !isLocalHost;

  return {
    httpOnly: false,
    sameSite: 'lax' as const,
    secure,
    path: appBasePath || '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}
