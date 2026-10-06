'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Shield, Key, Clock, ArrowRight, Loader2, Mail, Lock, Sun, Moon } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { BrandLogo } from '@/components/BrandLogo';
import { TransitionLink } from '@/components/TransitionLink';
import { usePageTransition } from '@/store/usePageTransition';
import { useTheme } from 'next-themes';
import { NetaMateMark } from '@/components/NetaMateMark';
import { MateDeskMark } from '@/components/MateDeskMark';

const features = [
  { Icon: Shield, text: 'SAML SSO available on the Scale plan.'         },
  { Icon: Key,    text: 'Hardware key (FIDO2 / WebAuthn) supported.'     },
  { Icon: Clock,  text: 'Sessions expire after 12 hours of inactivity.' },
];

interface InstanceConfig {
  product_name: string;
  product_wordmark: string;
  vendor_name: string;
  product_logo_url: string;
  product_logo_variant: string;
  product_logo_theme_aware: boolean;
  tenant_name: string;
  login_headline: string;
  login_subtitle: string;
}

function LoginForm() {
  const router            = useRouter();
  const searchParams      = useSearchParams();
  const { login, isLoading, error, clearError } = useAuthStore();
  const triggerTransition = usePageTransition((s) => s.trigger);
  const { resolvedTheme, setTheme } = useTheme();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const isSingleTenant = (process.env.NEXT_PUBLIC_DEPLOYMENT_MODE ?? 'multi_tenant') === 'single_tenant';
  const [instance, setInstance] = useState<InstanceConfig | null>(null);

  useEffect(() => {
    fetch('/api/instance/public/')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setInstance(data as InstanceConfig); })
      .catch(() => {});
  }, []);

  const isTenantPortal = isSingleTenant || Boolean(instance?.tenant_name);
  const productName = instance?.product_name
    || process.env.NEXT_PUBLIC_PRODUCT_NAME
    || (isSingleTenant ? 'HelpDesk' : 'MateDesk');
  const productWordmark = instance?.product_wordmark
    || process.env.NEXT_PUBLIC_PRODUCT_WORDMARK
    || (isSingleTenant ? 'NetaMate' : 'MateDesk');
  const vendorName = instance?.vendor_name || 'NetaMate Solutions';
  const loginHeadline = instance?.login_headline || (isTenantPortal
    ? `Welcome to ${productName}.`
    : 'Welcome back.');
  const loginSubtitle = instance?.login_subtitle || (isTenantPortal
    ? 'Sign in to access your support workspace.'
    : "Sign in with your email and password. We'll take you straight to your workspace.");
  const loginFeatures = isTenantPortal
    ? [
        { Icon: Shield, text: 'Secure access to your support workspace.' },
        { Icon: Key, text: 'Your requests and conversations stay in one place.' },
        { Icon: Clock, text: instance?.tenant_name ? `Support managed by ${instance.tenant_name}.` : 'Dedicated support portal.' },
      ]
    : features;

  useEffect(() => {
    if (isTenantPortal && productName) {
      document.title = `${productName} — Support Portal`;
    }
  }, [isTenantPortal, productName]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    try {
      await login(email.trim(), password);

      if (isTenantPortal) {
        const signedInUser = useAuthStore.getState().user;
        const isStaff = ['msp_owner', 'msp_manager', 'msp_agent'].includes(signedInUser?.role ?? '');
        const dest = searchParams.get('next') ?? (isStaff ? '/home' : '/requests');
        triggerTransition(() => router.push(dest));
        return;
      }

      // Multi-tenant root-domain login hard-navigates to the tenant subdomain
      // inside login(). Subdomain / localhost sessions land here normally.
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

  if (isTenantPortal) {
    const isDark = resolvedTheme !== 'light';
    const logoVariant = instance?.product_logo_variant || process.env.NEXT_PUBLIC_PRODUCT_LOGO_VARIANT || 'matedesk';
    const logoUrl = instance?.product_logo_url || '';
    const logoThemeAware = instance?.product_logo_theme_aware ?? true;

    const dedicatedInput: React.CSSProperties = {
      width: '100%',
      height: 44,
      padding: '0 14px 0 40px',
      fontSize: 13,
      fontFamily: 'inherit',
      background: 'var(--bg-input)',
      border: '1px solid var(--border-md)',
      color: 'var(--text-0)',
      outline: 'none',
      boxSizing: 'border-box',
    };

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          backgroundColor: 'var(--bg-base)',
          backgroundImage: isDark
            ? 'radial-gradient(rgba(96,165,250,0.10) 1px, transparent 1px)'
            : 'radial-gradient(rgba(37,99,235,0.09) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          color: 'var(--text-1)',
        }}
      >
        <div style={{ width: '100%', maxWidth: 430 }}>
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-md)',
              boxShadow: isDark
                ? '0 22px 70px rgba(0,0,0,0.28)'
                : '0 22px 70px rgba(15,23,42,0.10)',
            }}
          >
            <div
              style={{
                minHeight: 40,
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                padding: '0 12px',
              }}
            >
              <button
                type="button"
                onClick={() => setTheme(isDark ? 'light' : 'dark')}
                aria-label="Toggle theme"
                style={{
                  width: 30,
                  height: 30,
                  display: 'grid',
                  placeItems: 'center',
                  background: 'transparent',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-2)',
                  cursor: 'pointer',
                }}
              >
                {isDark ? <Sun size={14} /> : <Moon size={14} />}
              </button>
            </div>

            <div style={{ padding: '28px 30px 30px' }}>
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <div
                  style={{
                    width: 46,
                    height: 46,
                    margin: '0 auto 12px',
                    display: 'grid',
                    placeItems: 'center',
                    color: 'var(--brand-monochrome)',
                  }}
                >
                  {logoVariant === 'matedesk' ? (
                    <MateDeskMark size={43} />
                  ) : logoVariant === 'netamate' ? (
                    <NetaMateMark size={43} />
                  ) : logoUrl && logoThemeAware ? (
                    <span
                      aria-hidden="true"
                      style={{
                        width: 43,
                        height: 43,
                        display: 'block',
                        background: 'var(--text-0)',
                        WebkitMaskImage: `url("${logoUrl}")`,
                        maskImage: `url("${logoUrl}")`,
                        WebkitMaskRepeat: 'no-repeat',
                        maskRepeat: 'no-repeat',
                        WebkitMaskPosition: 'center',
                        maskPosition: 'center',
                        WebkitMaskSize: 'contain',
                        maskSize: 'contain',
                      }}
                    />
                  ) : logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="" width={43} height={43} style={{ objectFit: 'contain' }} />
                  ) : (
                    <MateDeskMark size={43} />
                  )}
                </div>

                <div
                  style={{
                    marginTop: 2,
                    fontFamily: 'var(--font-hemi), sans-serif',
                    fontSize: 23,
                    fontWeight: 700,
                    letterSpacing: '0.025em',
                    lineHeight: 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ color: 'var(--brand-monochrome)' }}>{productWordmark}</span>
                  <span style={{ color: 'var(--accent-info-fg)' }}> HelpDesk</span>
                </div>
                <p style={{ marginTop: 10, fontSize: 12, lineHeight: 1.55, color: 'var(--text-3)' }}>
                  Sign in to access your support workspace.
                </p>
              </div>

              {error && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: '10px 12px',
                    background: 'var(--accent-danger-bg)',
                    border: '1px solid rgba(239,68,68,0.28)',
                    color: 'var(--accent-danger-fg)',
                    fontSize: 12,
                  }}
                >
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    Email address
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={14} style={{ position: 'absolute', left: 14, top: 15, color: 'var(--text-4)' }} />
                    <input
                      type="email"
                      placeholder="you@company.com"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      style={dedicatedInput}
                    />
                  </div>
                </div>

                <div>
                  <div style={{ marginBottom: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      Password
                    </label>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <Lock size={14} style={{ position: 'absolute', left: 14, top: 15, color: 'var(--text-4)' }} />
                    <input
                      type="password"
                      placeholder="Your password"
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      style={dedicatedInput}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  style={{
                    height: 44,
                    marginTop: 3,
                    background: '#2563eb',
                    color: '#fff',
                    border: '1px solid #2563eb',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: '0.045em',
                    textTransform: 'uppercase',
                    fontFamily: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    opacity: isLoading ? 0.7 : 1,
                  }}
                >
                  {isLoading
                    ? <><Loader2 size={14} className="animate-spin" /> Signing in…</>
                    : <>Sign in <ArrowRight size={14} /></>
                  }
                </button>
              </form>

              <div
                style={{
                  marginTop: 18,
                  padding: '10px 12px',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-card)',
                  fontSize: 11,
                  lineHeight: 1.5,
                  color: 'var(--text-3)',
                  textAlign: 'center',
                }}
              >
                Secure access for {instance?.tenant_name || productWordmark} staff, agents, and supported clients.
              </div>
            </div>

            <div
              style={{
                borderTop: '1px solid var(--border-subtle)',
                padding: '12px 16px',
                textAlign: 'center',
                fontSize: 10,
                letterSpacing: '0.035em',
                color: 'var(--text-4)',
              }}
            >
              Powered by {vendorName}
            </div>
          </div>

          <div style={{ marginTop: 12, textAlign: 'center', fontSize: 10, color: 'var(--text-4)' }}>
            {productName}
          </div>
        </div>
      </div>
    );
  }

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
