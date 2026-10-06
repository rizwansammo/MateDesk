'use client';

import { useState, useEffect } from 'react';
import { BrandLogo } from '@/components/BrandLogo';
import { TransitionLink } from '@/components/TransitionLink';
import { usePublicAuthStatus } from '@/hooks/usePublicAuthStatus';
import { usePublicSignupMode } from '@/hooks/usePublicSignupMode';

const NAV_LINKS = [
  { label: 'Product',      id: 'product'    },
  { label: 'How it works', id: 'howitworks' },
  { label: 'Pricing',      id: 'pricing'    },
  { label: 'FAQ',          id: 'faq'        },
];

function smoothScrollTo(id: string) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

export default function PublicNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const { isAuth, dashboardUrl } = usePublicAuthStatus();
  const { signupMode } = usePublicSignupMode();
  const isPrivateBeta = signupMode === 'private_beta';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav
      style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: scrolled ? 'rgba(255,255,255,0.94)' : '#fff',
        backdropFilter: scrolled ? 'blur(8px)' : 'none',
        borderBottom: '1px solid #E2E5EB',
        transition: 'box-shadow 160ms',
        boxShadow: scrolled ? '0 1px 8px rgba(11,18,32,0.06)' : 'none',
      }}
    >
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 32px', height: 64, display: 'flex', alignItems: 'center', gap: 40 }}>

        {/* Logo — scrolls to top of landing page */}
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#0B1220', flexShrink: 0, display: 'flex', alignItems: 'center' }}
          aria-label="Scroll to top"
        >
          <BrandLogo size="md" />
        </button>

        <div style={{ display: 'flex', gap: 28, flex: 1 }}>
          {NAV_LINKS.map(l => (
            <button
              key={l.label}
              onClick={() => smoothScrollTo(l.id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                fontSize: 14, fontWeight: 500, color: '#3A4252',
                fontFamily: 'inherit', transition: 'color 120ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#0B1220'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#3A4252'; }}
            >
              {l.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {isAuth ? (
            <a
              href={dashboardUrl}
              style={{
                height: 36, padding: '0 16px', display: 'inline-flex', alignItems: 'center',
                fontSize: 14, fontWeight: 600, color: '#fff',
                background: '#1F4ED8', textDecoration: 'none', transition: 'background 120ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#1B43BC'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#1F4ED8'; }}
            >
              Go to Dashboard
            </a>
          ) : (
            <>
              <TransitionLink
                href="/login"
                style={{
                  height: 36, padding: '0 16px', display: 'inline-flex', alignItems: 'center',
                  fontSize: 14, fontWeight: 500, color: '#0B1220',
                  border: '1px solid #E2E5EB', background: 'transparent', textDecoration: 'none',
                  transition: 'background 120ms',
                }}
              >
                Sign in
              </TransitionLink>
              <TransitionLink
                href={isPrivateBeta ? '/apply' : '/register'}
                style={{
                  height: 36, padding: '0 16px', display: 'inline-flex', alignItems: 'center',
                  fontSize: 14, fontWeight: 600, color: '#fff',
                  background: '#1F4ED8', textDecoration: 'none', transition: 'background 120ms',
                }}
              >
                {isPrivateBeta ? 'Apply for Private Beta' : 'Start free trial'}
              </TransitionLink>
            </>
          )}
        </div>

      </div>
    </nav>
  );
}
