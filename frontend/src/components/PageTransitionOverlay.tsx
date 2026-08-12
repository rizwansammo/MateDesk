'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { usePageTransition } from '@/store/usePageTransition';

const THEMES = {
  blue: {
    track: 'rgba(31,78,216,0.15)',
    arc: '#1F4ED8',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" width={22} height={22}>
        <path d="M3 4h18v9.5l-4.5 0-1.8 2.5h-5.4l-1.8-2.5h-4.5z" fill="#fff" />
        <path d="M3 13.5v6.5h18v-6.5" stroke="#fff" strokeWidth="1.5" fill="none" />
      </svg>
    ),
    iconBg: '#1F4ED8',
    iconBorder: 'none',
  },
  green: {
    track: 'rgba(16,185,129,0.15)',
    arc: '#10b981',
    icon: (
      <svg viewBox="0 0 64 64" width={22} height={22} fill="none">
        <rect x="10" y="16" width="44" height="32" stroke="#10b981" strokeWidth="3.5" fill="none" />
        <path d="M20 24 L28 32 L20 40" stroke="#10b981" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <line x1="32" y1="40" x2="44" y2="40" stroke="#10b981" strokeWidth="3.5" strokeLinecap="round" />
      </svg>
    ),
    iconBg: 'rgba(16,185,129,0.12)',
    iconBorder: '1px solid rgba(16,185,129,0.35)',
  },
};

export function PageTransitionOverlay() {
  const active         = usePageTransition((s) => s.active);
  const color          = usePageTransition((s) => s.color);
  const dismissPending = usePageTransition((s) => s.dismissPending);
  const dismiss        = usePageTransition((s) => s.dismiss);
  const pathname       = usePathname();
  const theme          = THEMES[color];

  // Ref so the pathname-change effect can read the latest dismissPending
  // without it being a dependency that causes spurious re-runs.
  const dismissPendingRef = useRef(false);
  useEffect(() => {
    dismissPendingRef.current = dismissPending;
  }, [dismissPending]);

  // PRIMARY dismiss path: fires when usePathname() reports the new route,
  // which happens only after React has committed the new page DOM.
  // One requestAnimationFrame gives the browser a chance to paint before
  // the overlay fades, ensuring the new content is visible underneath.
  useEffect(() => {
    if (!dismissPendingRef.current) return;
    let raf: number;
    raf = requestAnimationFrame(() => dismiss());
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]); // intentionally only pathname — see comment above

  // FALLBACK dismiss: in case the route doesn't change (same-page navigation
  // or a navigation error), ensure the overlay eventually clears.
  useEffect(() => {
    if (!dismissPending) return;
    const t = setTimeout(dismiss, 1500);
    return () => clearTimeout(t);
  }, [dismissPending, dismiss]);

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        background: '#0E1117',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: active ? 1 : 0,
        pointerEvents: active ? 'all' : 'none',
        transition: 'opacity 0.22s ease',
      }}
    >
      <div style={{ position: 'relative', width: 72, height: 72 }}>
        {/* Track ring */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: `2px solid ${theme.track}`,
        }} />
        {/* Spinning arc */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: '2px solid transparent',
          borderTopColor: theme.arc,
          borderRightColor: theme.arc,
          animation: active ? 'pt-spin 0.9s linear infinite' : 'none',
        }} />
        {/* Icon */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)',
          width: 38, height: 38,
          background: theme.iconBg,
          border: theme.iconBorder,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {theme.icon}
        </div>
      </div>
      <style>{`@keyframes pt-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
