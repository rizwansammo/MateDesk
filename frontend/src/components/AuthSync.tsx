'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore, clearAuthState } from '@/store/useAuthStore';

function hasStoredToken(): boolean {
  try {
    const raw = localStorage.getItem('matedesk_auth');
    if (!raw) return false;
    const stored = JSON.parse(raw) as { state?: { accessToken?: string } };
    return !!stored?.state?.accessToken;
  } catch {
    return false;
  }
}

export function AuthSync() {
  const fetchMe         = useAuthStore((s) => s.fetchMe);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const router          = useRouter();
  const lastFetchRef    = useRef(0);

  // On mount: verify the session is real before allowing any dashboard route.
  useEffect(() => {
    if (!hasStoredToken()) {
      // Cookie exists (we're past middleware) but no real token — stale session.
      // Clear the cookie so the middleware stops redirecting here.
      clearAuthState();
      router.replace('/login');
      return;
    }
    lastFetchRef.current = Date.now();
    fetchMe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-validate when the user returns to this tab (catches expired tokens from
  // long idle periods without spamming the backend on every focus event).
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState !== 'visible') return;
      if (!hasStoredToken()) return;
      // Throttle: re-validate at most once every 5 minutes.
      const now = Date.now();
      if (now - lastFetchRef.current < 5 * 60 * 1000) return;
      lastFetchRef.current = now;
      fetchMe();
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchMe]);

  // If isAuthenticated drops to false while on a dashboard route, redirect to login.
  useEffect(() => {
    if (isAuthenticated === false) {
      if (!hasStoredToken()) router.replace('/login');
    }
  }, [isAuthenticated, router]);

  return null;
}
