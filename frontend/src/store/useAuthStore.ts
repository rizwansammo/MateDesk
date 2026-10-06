import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiFetch, ApiError, registerTokenRefreshCallback } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';

export interface AuthUser {
  id:          string;
  email:       string;
  full_name:   string;
  role:        string;
  tenant_id:   string;
  tenant_slug: string;
  tenant_name: string;
  job_title:   string;
  department:  string;
}

interface LoginResponse {
  access:  string;
  refresh: string;
  user:    AuthUser;
}

interface AuthState {
  user:            AuthUser | null;
  accessToken:     string | null;
  refreshToken:    string | null;
  isAuthenticated: boolean;
  isLoading:       boolean;
  error:           string | null;

  login:              (email: string, password: string) => Promise<void>;
  logout:             () => void;
  clearError:         () => void;
  fetchMe:            () => Promise<void>;
  hydrateFromCallback:(access: string, refresh: string) => Promise<void>;
}

function isCustomDomainHost(host: string, appDomain?: string): boolean {
  if (!appDomain || appDomain === 'localhost') return false;
  return host !== appDomain && !host.endsWith(`.${appDomain}`);
}

function cookieAttrs(maxAge: number): string {
  const d = process.env.NEXT_PUBLIC_APP_DOMAIN;
  const mode = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE ?? 'multi_tenant';
  const isProd = Boolean(d && d !== 'localhost');
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const customHost = isCustomDomainHost(host, d);

  // Shared .matedesk.pro cookies are valid only on the platform domain tree.
  // Customer-owned hostnames always receive host-only cookies.
  const domain = mode !== 'single_tenant' && isProd && !customHost ? `; domain=.${d}` : '';
  const secure = isProd ? '; Secure' : '';
  return `path=/${domain}; max-age=${maxAge}; SameSite=Lax${secure}`;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user:            null,
      accessToken:     null,
      refreshToken:    null,
      isAuthenticated: false,
      isLoading:       false,
      error:           null,

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const data = await apiFetch<LoginResponse>('/api/auth/login/', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
          });

          // If we're on the root domain (not a tenant subdomain), the tokens must
          // live in the subdomain's localStorage — redirect there via auth-callback.
          const d = process.env.NEXT_PUBLIC_APP_DOMAIN;
          const mode = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE ?? 'multi_tenant';
          const host = typeof window !== 'undefined' ? window.location.hostname : '';
          const isRootDomain = mode !== 'single_tenant' && d && d !== 'localhost' && host === d;

          if (isRootDomain) {
            // Hard-navigate to the subdomain auth-callback page with tokens in
            // the URL hash (never sent to server, immediately cleared by the page).
            const hash = `#access=${encodeURIComponent(data.access)}&refresh=${encodeURIComponent(data.refresh)}`;
            window.location.href = `https://${data.user.tenant_slug}.${d}/auth-callback${hash}`;
            // Don't resolve — the page is navigating away.
            return;
          }

          // Subdomain or localhost — set state normally.
          document.cookie = `matedesk_auth=1; ${cookieAttrs(60 * 60 * 24 * 7)}`;
          document.cookie = `matedesk_tenant=${data.user.tenant_slug}; ${cookieAttrs(60 * 60 * 24 * 7)}`;
          set({
            user:            data.user,
            accessToken:     data.access,
            refreshToken:    data.refresh,
            isAuthenticated: true,
            isLoading:       false,
            error:           null,
          });
        } catch (err) {
          const message = err instanceof ApiError ? err.message : 'Login failed. Please try again.';
          set({ isLoading: false, error: message });
          throw err;
        }
      },

      logout: () => {
        const { refreshToken } = get();
        if (refreshToken) {
          apiFetch('/api/auth/logout/', {
            method: 'POST',
            body: JSON.stringify({ refresh: refreshToken }),
          }).catch(() => {});
        }
        clearAuthState();
      },

      clearError: () => set({ error: null }),

      fetchMe: async () => {
        try {
          const raw = typeof window !== 'undefined' ? localStorage.getItem('matedesk_auth') : null;
          if (!raw) return;
          const stored = JSON.parse(raw) as { state?: { accessToken?: string } };
          if (!stored?.state?.accessToken) return;
          const data = await apiFetch<AuthUser>('/api/auth/me/');
          set({ user: data });
        } catch (err) {
          // On 401: backend rejected the token. Clear everything — AuthSync
          // watches isAuthenticated and will redirect to login automatically.
          if (err instanceof ApiError && err.status === 401) {
            clearAuthState();
          }
          // Network / 5xx errors are transient — leave state intact.
        }
      },

      hydrateFromCallback: async (access, refresh) => {
        // Write tokens into Zustand state — persist middleware immediately writes
        // them to localStorage in the correct format for apiFetch to pick up.
        set({ accessToken: access, refreshToken: refresh, isAuthenticated: true });

        // Set auth cookies on the subdomain so the middleware sees the session.
        const d = process.env.NEXT_PUBLIC_APP_DOMAIN;
        if (typeof window !== 'undefined' && d && d !== 'localhost') {
          const host   = window.location.hostname;
          const suffix = `.${d}`;
          const slug   = host.endsWith(suffix) ? host.slice(0, -suffix.length) : '';
          const customHost = isCustomDomainHost(host, d);

          if (slug || customHost) {
            document.cookie = `matedesk_auth=1; ${cookieAttrs(60 * 60 * 24 * 7)}`;
            if (slug) {
              document.cookie = `matedesk_tenant=${slug}; ${cookieAttrs(60 * 60 * 24 * 7)}`;
            }
          }
        }

        // Fetch full user object (tokens are in localStorage now so apiFetch works).
        try {
          const data = await apiFetch<AuthUser>('/api/auth/me/');
          set({ user: data });
        } catch {
          // Transient error — isAuthenticated is already true; AuthSync will retry.
        }
      },
    }),
    {
      name: 'matedesk_auth',
      partialize: (state) => ({
        user:            state.user,
        accessToken:     state.accessToken,
        refreshToken:    state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);

// Keep Zustand in-memory state in sync when api.ts silently refreshes tokens.
// Without this, ROTATE_REFRESH_TOKENS causes the next Zustand persist write to
// overwrite localStorage with the stale (now-blacklisted) refresh token → auto-logout.
registerTokenRefreshCallback((access, refresh) => {
  useAuthStore.setState(s => ({
    ...s,
    accessToken:  access,
    ...(refresh ? { refreshToken: refresh } : {}),
  }));
});

/**
 * Clears ALL auth state on the current origin:
 *   - Zustand in-memory store
 *   - Zustand persisted localStorage (key: matedesk_auth)
 *   - access token, refresh token, user object
 *   - matedesk_auth cookie  (host-only, exact domain, .parent domain)
 *   - matedesk_tenant cookie (same three variants)
 *
 * Defined after useAuthStore so it can call useAuthStore.setState().
 * Safe to call from any origin (subdomain or root domain).
 * Used by: logout(), fetchMe() 401 handler, AuthSync, logout-complete page,
 *          usePublicAuthStatus stale-cookie cleanup.
 */
export function clearAuthState(): void {
  if (typeof window === 'undefined') return;

  // 1. Clear Zustand in-memory state + triggers Zustand persist to write
  //    the cleared state back to localStorage before we remove it below.
  useAuthStore.setState({
    user:            null,
    accessToken:     null,
    refreshToken:    null,
    isAuthenticated: false,
    error:           null,
  });

  // 2. Remove the Zustand persisted key entirely.
  try { localStorage.removeItem('matedesk_auth'); } catch { /* ignore */ }

  // 2b. Drop all cached server data so the next user to sign in on this browser
  //     can't briefly see the previous user's tickets/notifications.
  try { queryClient.clear(); } catch { /* ignore */ }

  // 3. Expire both auth cookies in every possible scope so no stale variant
  //    survives regardless of how it was originally set:
  //      - host-only (no domain attribute) — covers the current origin
  //      - domain=matedesk.pro             — exact root domain
  //      - domain=.matedesk.pro            — shared: root + all subdomains
  const d = process.env.NEXT_PUBLIC_APP_DOMAIN;
  const isReal = d && d !== 'localhost';

  // Use both max-age=0 AND expires=epoch to ensure the cookie is cleared
  // even if the browser has edge-case handling for one or the other.
  const gone = 'max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  const cookieVariants: string[] = [
    `path=/; ${gone}; SameSite=Lax`,
    ...(isReal ? [
      `path=/; domain=${d};  ${gone}; SameSite=Lax; Secure`,
      `path=/; domain=.${d}; ${gone}; SameSite=Lax; Secure`,
    ] : []),
  ];

  for (const attrs of cookieVariants) {
    document.cookie = `matedesk_auth=;   ${attrs}`;
    document.cookie = `matedesk_tenant=; ${attrs}`;
  }
}

/**
 * Returns the post-logout redirect URL.
 * Production → https://matedesk.pro/logout-complete  (clears root-domain state)
 * Dev        → /login
 */
export function getLogoutUrl(): string {
  const d = process.env.NEXT_PUBLIC_APP_DOMAIN;
  const mode = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE ?? 'multi_tenant';
  if (mode === 'single_tenant') return '/logout-complete';
  if (!d || d === 'localhost') return '/login';

  if (typeof window !== 'undefined' && isCustomDomainHost(window.location.hostname, d)) {
    // localStorage is origin-scoped, so custom-domain logout must complete on
    // the same hostname to clear the persisted access/refresh tokens.
    return '/logout-complete';
  }
  return `https://${d}/logout-complete`;
}
