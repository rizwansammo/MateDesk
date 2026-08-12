'use client';

import { useState, useEffect } from 'react';
import { clearAuthState } from '@/store/useAuthStore';

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(
    new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)')
  );
  return match ? decodeURIComponent(match[1]) : '';
}

function resolveTenantSlug(): string {
  const fromCookie = getCookie('matedesk_tenant');
  if (fromCookie) return fromCookie;
  try {
    const raw = localStorage.getItem('matedesk_auth');
    if (raw) {
      const parsed = JSON.parse(raw);
      const slug = parsed?.state?.user?.tenant_slug as string | undefined;
      if (slug) return slug;
    }
  } catch { /* ignore */ }
  return '';
}

// Decode the JWT exp claim locally — no network call needed.
// Returns true if the token is past its expiry or structurally invalid.
function isJwtExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return Date.now() >= (payload.exp as number) * 1000;
  } catch {
    return true;
  }
}

function getStoredAccessToken(): string | null {
  try {
    const raw = localStorage.getItem('matedesk_auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { accessToken?: string } };
    return parsed?.state?.accessToken ?? null;
  } catch {
    return null;
  }
}

/**
 * Rule 5: Marketing page must not show Dashboard just because the routing
 * cookie exists. A stale or backfilled cookie must not trigger the CTA.
 *
 * We require ALL of:
 *   1. matedesk_auth cookie === '1'  (routing signal)
 *   2. A non-empty access token in localStorage  (real credential)
 *   3. The access token is not locally expired  (JWT exp claim check)
 *
 * If any condition fails the user is treated as logged out on this page.
 * After a cross-domain logout, /logout-complete clears both cookie and
 * localStorage, so this reliably returns false.
 *
 * Note: a non-expired token could still be server-side blacklisted (e.g.
 * force-logout from another device). That edge case is not detectable from
 * the marketing domain without a cross-origin API call; it clears itself
 * naturally once the access token expires (max 1 hour).
 */
function resolveIsAuth(): boolean {
  if (getCookie('matedesk_auth') !== '1') return false;
  try {
    const token = getStoredAccessToken();
    if (!token) return false;
    return !isJwtExpired(token);
  } catch {
    return false;
  }
}

interface PublicAuthStatus {
  isAuth:       boolean;
  tenantSlug:   string;
  dashboardUrl: string;
}

export function usePublicAuthStatus(): PublicAuthStatus {
  const [isAuth,     setIsAuth]     = useState(false);
  const [tenantSlug, setTenantSlug] = useState('');

  useEffect(() => {
    const auth = resolveIsAuth();
    const slug = resolveTenantSlug();

    setIsAuth(auth);
    setTenantSlug(slug);

    // Rule 6: cookie claims authenticated but there is no real token or the
    // token is expired — clear everything so subsequent visits also see
    // the logged-out UI without waiting for the /logout-complete flow.
    if (!auth && getCookie('matedesk_auth') === '1') {
      clearAuthState();
    }
  }, []);

  function buildDashboardUrl(): string {
    const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN;
    if (!appDomain || appDomain === 'localhost') {
      return tenantSlug ? '/home' : '/login';
    }
    if (!tenantSlug) return '/login';
    return `https://${tenantSlug}.${appDomain}/home`;
  }

  return { isAuth, tenantSlug, dashboardUrl: buildDashboardUrl() };
}
