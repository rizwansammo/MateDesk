'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Shield, Key, Clock, ArrowRight, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { BrandLogo } from '@/components/BrandLogo';
import { TransitionLink } from '@/components/TransitionLink';
import { usePageTransition } from '@/store/usePageTransition';

const features = [
  { Icon: Shield, text: 'SAML SSO available on the Scale plan.'         },
  { Icon: Key,    text: 'Hardware key (FIDO2 / WebAuthn) supported.'     },
  { Icon: Clock,  text: 'Sessions expire after 12 hours of inactivity.' },
];

interface InstanceConfig {
  product_name: string;
  vendor_name: string;
  product_logo_url: string;
  tenant_name: string;
  login_headline: string;
  login_subtitle: string;
}

function LoginForm() {
  const router            = useRouter();
  const searchParams      = useSearchParams();
  const { login, isLoading, error, clearError } = useAuthStore();
  const triggerTransition = usePageTransition((s) => s.trigger);

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const isSingleTenant = (process.env.NEXT_PUBLIC_DEPLOYMENT_MODE ?? 'multi_tenant') === 'single_tenant';
  const [instance, setInstance] = useState<InstanceConfig | null>(null);

  useEffect(() => {
    if (!isSingleTenant) return;
    fetch('/api/instance/public/')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setInstance(data as InstanceConfig); })
      .catch(() => {});
  }, [isSingleTenant]);

  const productName = instance?.product_name || (isSingleTenant ? 'HelpDesk' : 'MateDesk');
  const vendorName = instance?.vendor_name || 'NetaMate Solutions';
  const loginHeadline = instance?.login_headline || (isSingleTenant
    ? `Welcome to ${productName}.`
    : 'Welcome back.');
  const loginSubtitle = instance?.login_subtitle || (isSingleTenant
    ? 'Sign in to access your support workspace.'
    : "Sign in with your email and password. We'll take you straight to your workspace.");
  const loginFeatures = isSingleTenant
    ? [
        { Icon: Shield, text: 'Secure access to your support workspace.' },
        { Icon: Key, text: 'Your requests and conversations stay in one place.' },
        { Icon: Clock, text: instance?.tenant_name ? `Support managed by ${instance.tenant_name}.` : 'Dedicated support portal.' },
      ]
    : features;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    try {
      await login(email.trim(), password);
      // Root-domain logins redirect via window.location inside login() —
      // they never reach this line.  Subdomain / localhost land here.
      const dest = searchParams.get('next') ?? '/home';
      triggerTransition(() => router.push(dest));
    } catch {
      // error already set in store
    }
  }

  const inputCls: React.CSSProperties = {
    width: '100%', height: 44, padding: '0 14px',
    fontSize: 14, fontFamily: 'inherit',
    background: '#fff',
    border: '1px solid #C8CDD6',
    color: '#0B1220',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 120ms',
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>

      {/* LEFT — dark brand panel */}
      <aside
        style={{
          flex: '1 1 0',
          background: '#0E1117',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '48px 56px',
          minWidth: 0,
        }}
      >
        <TransitionLink href="/" style={{ textDecoration: 'none', color: '#ECEEF2' }}>
          <BrandLogo
            size="md"
            label={isSingleTenant ? productName : undefined}
            logoUrl={isSingleTenant ? instance?.product_logo_url : undefined}
          />
        </TransitionLink>

        <div>
          <h2
            style={{
              fontFamily: 'var(--font-hemi), sans-serif',
              fontWeight: 700,
              fontSize: 'clamp(28px, 3vw, 44px)',
              lineHeight: 1.08,
              textTransform: 'uppercase',
              letterSpacing: '0.01em',
              color: '#ECEEF2',
              marginBottom: 16,
            }}
          >
            {isSingleTenant ? (
              <>{loginHeadline}<br /><span style={{ color: '#1F4ED8' }}>Support, in one place.</span></>
            ) : (
              <>Welcome back.<br />Your <span style={{ color: '#1F4ED8' }}>queue is waiting.</span></>
            )}
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: '#9AA2B1', maxWidth: 380, marginBottom: 32 }}>
            {loginSubtitle}
          </p>

          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {loginFeatures.map(({ Icon, text }) => (
              <li key={text} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, color: '#9AA2B1' }}>
                <Icon size={15} style={{ color: '#1F4ED8', flexShrink: 0 }} />
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p style={{ fontSize: 12, color: '#485168' }}>By {vendorName}</p>
      </aside>

      {/* RIGHT — light form panel */}
      <main
        style={{
          width: 'clamp(380px, 40vw, 520px)',
          flexShrink: 0,
          background: '#fff',
          display: 'flex',
          flexDirection: 'column',
          padding: '48px',
          overflowY: 'auto',
        }}
      >
        {isSingleTenant ? (
          <p style={{ fontSize: 13, color: '#6B7385', marginBottom: 40, textAlign: 'right' }}>
            Secure support portal
          </p>
        ) : (
          <p style={{ fontSize: 13, color: '#6B7385', marginBottom: 40, textAlign: 'right' }}>
            New to MateDesk?{' '}
            <TransitionLink href="/register" style={{ color: '#1F4ED8', fontWeight: 600, textDecoration: 'none' }}>
              Create a workspace →
            </TransitionLink>
          </p>
        )}

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: 400, width: '100%', margin: '0 auto' }}>

          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#0B1220', marginBottom: 6 }}>
            {isSingleTenant ? `Sign in to ${productName}` : 'Sign in'}
          </h1>
          <p style={{ fontSize: 14, color: '#6B7385', marginBottom: 28 }}>
            Enter your email and password to access your workspace.
          </p>

          {error && (
            <div
              style={{
                marginBottom: 20, padding: '10px 14px',
                background: '#FEE2E2', border: '1px solid #FCA5A5',
                color: '#991B1B', fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#3A4252', marginBottom: 6 }}>
                Work email
              </label>
              <input
                type="email"
                placeholder="you@yourcompany.com"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={inputCls}
                onFocus={e => { e.currentTarget.style.borderColor = '#1F4ED8'; }}
                onBlur={e => { e.currentTarget.style.borderColor = '#C8CDD6'; }}
              />
            </div>

            <div>
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, fontWeight: 600, color: '#3A4252', marginBottom: 6 }}>
                <span>Password</span>
                <Link href="#" style={{ fontSize: 12, fontWeight: 600, color: '#1F4ED8', textDecoration: 'none' }}>
                  Forgot?
                </Link>
              </label>
              <input
                type="password"
                placeholder="Your password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={inputCls}
                onFocus={e => { e.currentTarget.style.borderColor = '#1F4ED8'; }}
                onBlur={e => { e.currentTarget.style.borderColor = '#C8CDD6'; }}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              style={{
                height: 48, background: '#1F4ED8', color: '#fff',
                border: 'none', cursor: isLoading ? 'not-allowed' : 'pointer',
                fontSize: 15, fontWeight: 600, fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: isLoading ? 0.7 : 1,
                transition: 'background 120ms',
              }}
              onMouseEnter={e => { if (!isLoading) e.currentTarget.style.background = '#1B43BC'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#1F4ED8'; }}
            >
              {isLoading
                ? <><Loader2 size={16} className="animate-spin" /> Signing in…</>
                : <>Sign in <ArrowRight size={16} /></>
              }
            </button>

          </form>

          {!isSingleTenant && <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0', color: '#9AA2B1', fontSize: 13 }}>
            <div style={{ flex: 1, height: 1, background: '#E2E5EB' }} />
            or continue with
            <div style={{ flex: 1, height: 1, background: '#E2E5EB' }} />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {[
              {
                label: 'Google',
                icon: (
                  <svg viewBox="0 0 24 24" width="16" height="16">
                    <path fill="#4285F4" d="M22 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.6c-.2 1.3-1 2.4-2 3.1v2.6h3.3c2-1.8 3.1-4.5 3.1-7.7z"/>
                    <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.6c-.9.6-2.1 1-3.4 1-2.6 0-4.8-1.7-5.6-4.1H3v2.6C4.7 19.7 8.1 22 12 22z"/>
                    <path fill="#FBBC05" d="M6.4 13.9c-.2-.6-.3-1.3-.3-1.9s.1-1.3.3-1.9V7.5H3C2.4 8.9 2 10.4 2 12s.4 3.1 1 4.5l3.4-2.6z"/>
                    <path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9C16.9 3 14.7 2 12 2 8.1 2 4.7 4.3 3 7.5l3.4 2.6C7.2 7.7 9.4 6 12 6z"/>
                  </svg>
                ),
              },
              {
                label: 'Microsoft',
                icon: (
                  <svg viewBox="0 0 24 24" width="16" height="16">
                    <path fill="#F25022" d="M2 2h9v9H2z"/>
                    <path fill="#7FBA00" d="M13 2h9v9h-9z"/>
                    <path fill="#00A4EF" d="M2 13h9v9H2z"/>
                    <path fill="#FFB900" d="M13 13h9v9h-9z"/>
                  </svg>
                ),
              },
            ].map(({ label, icon }) => (
              <button
                key={label}
                type="button"
                title="Coming soon"
                style={{
                  flex: 1, height: 44,
                  border: '1px solid #E2E5EB', background: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  fontSize: 13, fontWeight: 500, color: '#3A4252',
                  cursor: 'not-allowed', opacity: 0.6, fontFamily: 'inherit',
                }}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
          </>}

        </div>
      </main>

    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
