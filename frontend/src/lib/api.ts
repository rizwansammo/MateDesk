// Empty string → same-origin requests (nginx routes /api/* to backend in production).
// Set NEXT_PUBLIC_API_URL=http://localhost:8000 in frontend/.env.local for local dev.
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

// ── Token-refresh notification (avoids circular import with useAuthStore) ─────
// When a silent refresh succeeds, api.ts updates localStorage directly. But
// Zustand's persist middleware would overwrite that on the next state change,
// reinstating the stale (now-blacklisted) refresh token → auto-logout.
// The store registers a callback here so we can sync in-memory state too.
type TokenRefreshCallback = (access: string, refresh?: string) => void;
let _onTokenRefreshed: TokenRefreshCallback | null = null;
export function registerTokenRefreshCallback(cb: TokenRefreshCallback): void {
  _onTokenRefreshed = cb;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

// ── Token storage helpers ─────────────────────────────────────────────────────

function getStoredAuth(): { accessToken: string | null; refreshToken: string | null } {
  if (typeof window === 'undefined') return { accessToken: null, refreshToken: null };
  try {
    const raw = localStorage.getItem('matedesk_auth');
    if (!raw) return { accessToken: null, refreshToken: null };
    const stored = JSON.parse(raw) as { state?: { accessToken?: string; refreshToken?: string } };
    return {
      accessToken:  stored?.state?.accessToken  ?? null,
      refreshToken: stored?.state?.refreshToken ?? null,
    };
  } catch {
    return { accessToken: null, refreshToken: null };
  }
}

function updateStoredTokens(accessToken: string, refreshToken?: string) {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem('matedesk_auth');
    if (!raw) return;
    const stored = JSON.parse(raw) as { state?: Record<string, unknown> };
    if (stored.state) {
      stored.state.accessToken = accessToken;
      if (refreshToken) stored.state.refreshToken = refreshToken;
      localStorage.setItem('matedesk_auth', JSON.stringify(stored));
    }
  } catch {
    // silently ignore — worst case the user re-auths on next page load
  }
  // Sync Zustand in-memory state so persist doesn't overwrite the new tokens
  // with the stale ones on the next state change (critical for ROTATE_REFRESH_TOKENS).
  if (_onTokenRefreshed) _onTokenRefreshed(accessToken, refreshToken);
}

// ── Token refresh (with dedup lock to prevent race conditions) ────────────────
//
// If two requests fail with 401 simultaneously, only one refresh call is made.
// Both callers await the same promise and receive the same new access token,
// preventing the second caller from using a now-blacklisted refresh token.

let _refreshPromise: Promise<string | null> | null = null;

async function attemptTokenRefresh(): Promise<string | null> {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    const { refreshToken } = getStoredAuth();
    if (!refreshToken) return null;
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh/`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ refresh: refreshToken }),
      });
      if (!res.ok) return null;
      const data = await res.json() as { access: string; refresh?: string };
      // Persist both tokens (ROTATE_REFRESH_TOKENS returns a new refresh token)
      updateStoredTokens(data.access, data.refresh);
      return data.access;
    } catch {
      return null;
    }
  })().finally(() => {
    _refreshPromise = null;
  });

  return _refreshPromise;
}

// ── Core fetch helper ─────────────────────────────────────────────────────────

function buildHeaders(token: string | null, extra?: HeadersInit): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra ?? {}),
  };
}

async function parseError(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => ({})) as Record<string, unknown>;

  // Global error keys first
  const global =
    (body.detail as string) ||
    (body.error as string) ||
    (Array.isArray(body.non_field_errors) ? (body.non_field_errors as string[])[0] : undefined) ||
    (body.non_field_errors as string | undefined);

  if (global) return new ApiError(res.status, global);

  // DRF field-level validation errors: { field: ["msg", ...] }
  for (const key of Object.keys(body)) {
    const val = body[key];
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'string') {
      const label = key.replace(/_/g, ' ');
      return new ApiError(res.status, `${label}: ${val[0]}`);
    }
    if (typeof val === 'string') {
      return new ApiError(res.status, val);
    }
  }

  return new ApiError(res.status, `Request failed (${res.status})`);
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const { accessToken } = getStoredAuth();

  // FormData must not have Content-Type set — the browser adds the multipart boundary automatically.
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = isFormData
    ? { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...((options.headers ?? {}) as Record<string, string>) }
    : buildHeaders(accessToken, options.headers);

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  // Auto-refresh on 401 — skip only login/refresh/logout to avoid loops.
  // /api/auth/me/ and other auth-namespaced endpoints DO support refresh.
  const noRefreshPaths = ['/api/auth/login/', '/api/auth/refresh/', '/api/auth/logout/'];
  if (res.status === 401 && !noRefreshPaths.includes(path)) {
    const newToken = await attemptTokenRefresh();
    if (newToken) {
      const retryHeaders = isFormData
        ? { Authorization: `Bearer ${newToken}`, ...((options.headers ?? {}) as Record<string, string>) }
        : buildHeaders(newToken, options.headers);
      const retry = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: retryHeaders,
      });
      if (!retry.ok) throw await parseError(retry);
      // Empty-body guard, same as the non-retry path below. Without this a
      // DELETE that 401s, refreshes, then succeeds with 204 would reject on
      // .json() — the write landed but the caller saw an error and never
      // invalidated its cache.
      if (retry.status === 204 || retry.status === 205) return null as unknown as T;
      return retry.json() as Promise<T>;
    }
    // Refresh failed (token expired/blacklisted) — surface as 401 so the
    // caller or a global error boundary can redirect to login
    throw new ApiError(401, 'Session expired. Please sign in again.');
  }

  if (!res.ok) throw await parseError(res);
  if (res.status === 204 || res.status === 205) return null as unknown as T;

  return res.json() as Promise<T>;
}

function parseContentDispositionFilename(headerValue: string | null): string | null {
  if (!headerValue) return null;

  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(headerValue);
  if (utf8Match && utf8Match[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const plainMatch = /filename="?([^";]+)"?/i.exec(headerValue);
  if (plainMatch && plainMatch[1]) return plainMatch[1];
  return null;
}

export async function apiFetchBlob(
  path: string,
  options: RequestInit = {},
): Promise<{ blob: Blob; filename: string | null }> {
  const { accessToken } = getStoredAuth();
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = isFormData
    ? { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...((options.headers ?? {}) as Record<string, string>) }
    : buildHeaders(accessToken, options.headers);

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const noRefreshPaths = ['/api/auth/login/', '/api/auth/refresh/', '/api/auth/logout/'];
  if (res.status === 401 && !noRefreshPaths.includes(path)) {
    const newToken = await attemptTokenRefresh();
    if (newToken) {
      const retryHeaders = isFormData
        ? { Authorization: `Bearer ${newToken}`, ...((options.headers ?? {}) as Record<string, string>) }
        : buildHeaders(newToken, options.headers);
      const retry = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: retryHeaders,
      });
      if (!retry.ok) throw await parseError(retry);
      return {
        blob: await retry.blob(),
        filename: parseContentDispositionFilename(retry.headers.get('content-disposition')),
      };
    }
    throw new ApiError(401, 'Session expired. Please sign in again.');
  }

  if (!res.ok) throw await parseError(res);
  return {
    blob: await res.blob(),
    filename: parseContentDispositionFilename(res.headers.get('content-disposition')),
  };
}
