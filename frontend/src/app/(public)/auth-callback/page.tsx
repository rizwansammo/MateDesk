'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';

export default function AuthCallbackPage() {
  const router             = useRouter();
  const hydrateFromCallback = useAuthStore((s) => s.hydrateFromCallback);
  const [status, setStatus] = useState<'loading' | 'error'>('loading');

  useEffect(() => {
    const hash   = window.location.hash.slice(1); // strip leading '#'
    const params = new URLSearchParams(hash);
    const access  = params.get('access');
    const refresh = params.get('refresh');

    if (!access || !refresh) {
      setStatus('error');
      setTimeout(() => router.replace('/login'), 2000);
      return;
    }

    // Remove tokens from browser history immediately — they're single-use.
    window.history.replaceState(null, '', window.location.pathname);

    hydrateFromCallback(access, refresh).then(() => {
      router.replace('/home');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#0E1117',
        gap: 16,
      }}
    >
      {status === 'loading' ? (
        <>
          <Loader2 size={32} className="animate-spin" style={{ color: '#1F4ED8' }} />
          <p style={{ fontSize: 14, color: '#9AA2B1' }}>Signing you in…</p>
        </>
      ) : (
        <p style={{ fontSize: 14, color: '#f87171' }}>Invalid session link. Redirecting to login…</p>
      )}
    </div>
  );
}
