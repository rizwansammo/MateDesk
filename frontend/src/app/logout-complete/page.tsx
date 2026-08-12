'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { clearAuthState } from '@/store/useAuthStore';

/**
 * Landing page for the production post-logout redirect:
 *   https://matedesk.pro/logout-complete
 *
 * This page runs on the ROOT domain, which shares the .matedesk.pro cookie
 * scope with all tenant subdomains. Calling clearAuthState() here ensures
 * cookies set with domain=.matedesk.pro are expired even after navigating
 * away from the originating subdomain.
 *
 * Flow: subdomain logout → window.location.href = getLogoutUrl()
 *   → this page → clearAuthState() → redirect to /
 */
export default function LogoutCompletePage() {
  const router = useRouter();

  useEffect(() => {
    // Wipe all auth state and cookies from the root domain
    clearAuthState();
    // Small delay so the browser can process the cookie expirations
    // before we navigate away.
    const t = setTimeout(() => router.replace('/'), 800);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#0f1117',
        color: '#64748b',
        fontSize: 13,
        fontFamily: 'system-ui, sans-serif',
        gap: 10,
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 6 }}>Signing you out…</div>
        <div style={{ fontSize: 11, color: '#475569' }}>Clearing session data</div>
      </div>
    </div>
  );
}
