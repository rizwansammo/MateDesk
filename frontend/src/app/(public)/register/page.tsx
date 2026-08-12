'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight, Loader2, PartyPopper } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { BrandLogo } from '@/components/BrandLogo';
import { TransitionLink } from '@/components/TransitionLink';

interface RegisterResponse {
  user: { tenant_slug: string; full_name: string; email: string };
}

const benefits = [
  '14-day free trial. No credit card.',
  'Add unlimited client tenants in trial.',
  'Connect your first mailbox in 4 minutes.',
  'SOC 2 Type II · ISO 27001 · GDPR-compliant.',
  'Cancel anytime. Export your data anytime.',
];

export default function RegisterPage() {
  const [companyName,  setCompanyName]  = useState('');
  const [ownerName,    setOwnerName]    = useState('');
  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [confirm,      setConfirm]      = useState('');
  const [slug,         setSlug]         = useState('');
  const [slugTouched,  setSlugTouched]  = useState(false);
  const [isLoading,    setIsLoading]    = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [registered,   setRegistered]   = useState<{ slug: string; name: string } | null>(null);
  const [displayDomain, setDisplayDomain] = useState('');

  useEffect(() => { setDisplayDomain(window.location.hostname); }, []);

  function deriveSlug(name: string) {
    // Match Django's slugify: spaces → hyphens, strip non-alphanum, collapse hyphens
    return name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30);
  }

  function handleCompanyChange(val: string) {
    setCompanyName(val);
    if (!slugTouched) setSlug(deriveSlug(val));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setIsLoading(true);
    try {
      const data = await apiFetch<RegisterResponse>('/api/auth/register/', {
        method: 'POST',
        body: JSON.stringify({
          company_name: companyName.trim(),
          owner_name:   ownerName.trim(),
          email:        email.trim(),
          password,
          tenant_slug:  slug.trim(),
        }),
      });
      setRegistered({ slug: data.user.tenant_slug, name: companyName.trim() });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  // ── Success screen ───────────────────────────────────────────────────────────

  if (registered) {
    return (
      <div style={{ minHeight: '100vh', background: '#0E1117', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 440 }}>
          <div style={{
            width: 64, height: 64,
            background: 'rgba(19,122,59,0.12)', border: '1px solid rgba(19,122,59,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px',
          }}>
            <PartyPopper size={28} style={{ color: '#137A3B' }} />
          </div>
          <h1 style={{
            fontFamily: 'var(--font-hemi), sans-serif',
            fontWeight: 700, fontSize: 28,
            textTransform: 'uppercase', letterSpacing: '0.01em',
            color: '#ECEEF2', marginBottom: 12,
          }}>
            Workspace created!
          </h1>
          <p style={{ fontSize: 15, color: '#9AA2B1', lineHeight: 1.6, marginBottom: 8 }}>
            <span style={{ color: '#ECEEF2', fontWeight: 600 }}>{registered.name}</span> is ready.
          </p>
          <p style={{ fontSize: 14, color: '#485168', marginBottom: 32 }}>
            Sign in using workspace slug{' '}
            <span style={{ color: '#60a5fa', fontFamily: 'var(--font-mono), monospace', fontWeight: 600 }}>
              {registered.slug}
            </span>
          </p>
          <TransitionLink
            href="/login"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '12px 24px',
              background: '#1F4ED8', color: '#fff',
              fontSize: 15, fontWeight: 600, textDecoration: 'none',
              fontFamily: 'inherit',
            }}
          >
            Sign in to your account <ArrowRight size={16} />
          </TransitionLink>
        </div>
      </div>
    );
  }

  // ── shared input style ─────────────────────────────────────────────────────
  const inp: React.CSSProperties = {
    width: '100%', height: 44, padding: '0 14px',
    fontSize: 14, fontFamily: 'inherit',
    background: '#fff', border: '1px solid #C8CDD6',
    color: '#0B1220', outline: 'none',
    boxSizing: 'border-box', transition: 'border-color 120ms',
  };
  const lbl: React.CSSProperties = {
    display: 'block', fontSize: 13, fontWeight: 600,
    color: '#3A4252', marginBottom: 6,
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>

      {/* ── LEFT — dark brand panel ─────────────────────────────────────── */}
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
          <BrandLogo size="md" />
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
            Spin up your{' '}
            <span style={{ color: '#1F4ED8' }}>tenant</span>
            {' '}in under 5 minutes.
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: '#9AA2B1', maxWidth: 380, marginBottom: 32 }}>
            Every MateDesk tenant is its own isolated workspace — ready for your team and your client organizations.
          </p>

          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {benefits.map(b => (
              <li key={b} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, color: '#9AA2B1' }}>
                <span style={{ color: '#1F4ED8', marginTop: 1, flexShrink: 0 }}>✓</span>
                {b}
              </li>
            ))}
          </ul>
        </div>

        <p style={{ fontSize: 12, color: '#485168' }}>By NetaMate Solutions</p>
      </aside>

      {/* ── RIGHT — light form panel ────────────────────────────────────── */}
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
        <p style={{ fontSize: 13, color: '#6B7385', marginBottom: 40, textAlign: 'right' }}>
          Already have a tenant?{' '}
          <TransitionLink href="/login" style={{ color: '#1F4ED8', fontWeight: 600, textDecoration: 'none' }}>
            Sign in →
          </TransitionLink>
        </p>

        <div style={{ maxWidth: 400, width: '100%', margin: '0 auto' }}>

          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#0B1220', marginBottom: 6 }}>
            Create your workspace
          </h1>
          <p style={{ fontSize: 14, color: '#6B7385', marginBottom: 28 }}>
            Tell us about your MSP and pick a subdomain.
          </p>

          {error && (
            <div style={{
              marginBottom: 20, padding: '10px 14px',
              background: '#FEE2E2', border: '1px solid #FCA5A5',
              color: '#991B1B', fontSize: 13,
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Company Name */}
            <div>
              <label style={lbl}>MSP Company Name</label>
              <input
                type="text"
                placeholder="Acme Managed Services"
                required
                value={companyName}
                onChange={e => handleCompanyChange(e.target.value)}
                style={inp}
                onFocus={e => { e.currentTarget.style.borderColor = '#1F4ED8'; }}
                onBlur={e => { e.currentTarget.style.borderColor = '#C8CDD6'; }}
              />
            </div>

            {/* Owner Name */}
            <div>
              <label style={lbl}>Owner Name</label>
              <input
                type="text"
                placeholder="John Smith"
                required
                value={ownerName}
                onChange={e => setOwnerName(e.target.value)}
                style={inp}
                onFocus={e => { e.currentTarget.style.borderColor = '#1F4ED8'; }}
                onBlur={e => { e.currentTarget.style.borderColor = '#C8CDD6'; }}
              />
            </div>

            {/* Email */}
            <div>
              <label style={lbl}>Work email</label>
              <input
                type="email"
                placeholder="john@acmemsp.com"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={inp}
                onFocus={e => { e.currentTarget.style.borderColor = '#1F4ED8'; }}
                onBlur={e => { e.currentTarget.style.borderColor = '#C8CDD6'; }}
              />
            </div>

            {/* Subdomain */}
            <div>
              <label style={lbl}>Tenant subdomain</label>
              <div style={{ display: 'flex', border: '1px solid #C8CDD6', overflow: 'hidden' }}>
                <input
                  type="text"
                  placeholder="yourname"
                  required
                  pattern="[a-z0-9-]{3,30}"
                  value={slug}
                  onChange={e => {
                    setSlug(
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, '')
                        .replace(/-+/g, '-')
                        .slice(0, 30)
                    );
                    setSlugTouched(true);
                  }}
                  style={{
                    ...inp, border: 'none', flex: 1,
                    fontFamily: 'var(--font-mono), monospace',
                  }}
                  onFocus={e => { e.currentTarget.style.outline = '2px solid #1F4ED8'; e.currentTarget.style.outlineOffset = '-2px'; }}
                  onBlur={e => { e.currentTarget.style.outline = 'none'; }}
                />
                <span style={{
                  padding: '0 12px', display: 'flex', alignItems: 'center',
                  background: '#F7F8FA', borderLeft: '1px solid #E2E5EB',
                  fontSize: 13, color: '#6B7385', fontFamily: 'var(--font-mono), monospace',
                  whiteSpace: 'nowrap',
                }}>
                  .{displayDomain}
                </span>
              </div>
              {slug && (
                <p style={{ fontSize: 12, color: '#6B7385', marginTop: 5 }}>
                  Workspace: <strong style={{ fontFamily: 'var(--font-mono), monospace' }}>{slug}.{displayDomain}</strong>
                </p>
              )}
            </div>

            {/* Password + Confirm */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  required
                  minLength={8}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  style={inp}
                  onFocus={e => { e.currentTarget.style.borderColor = '#1F4ED8'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#C8CDD6'; }}
                />
              </div>
              <div>
                <label style={lbl}>Confirm</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  required
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  style={inp}
                  onFocus={e => { e.currentTarget.style.borderColor = '#1F4ED8'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#C8CDD6'; }}
                />
              </div>
            </div>

            {/* ToS */}
            <p style={{ fontSize: 12, color: '#6B7385' }}>
              By creating an account you agree to our{' '}
              <Link href="#" style={{ color: '#1F4ED8', textDecoration: 'none' }}>Terms of Service</Link>
              {' '}and{' '}
              <Link href="#" style={{ color: '#1F4ED8', textDecoration: 'none' }}>Privacy Policy</Link>.
            </p>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              style={{
                height: 48, background: '#1F4ED8', color: '#fff',
                border: 'none', cursor: isLoading ? 'not-allowed' : 'pointer',
                fontSize: 15, fontWeight: 600, fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: isLoading ? 0.7 : 1, transition: 'background 120ms',
              }}
              onMouseEnter={e => { if (!isLoading) e.currentTarget.style.background = '#1B43BC'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#1F4ED8'; }}
            >
              {isLoading
                ? <><Loader2 size={16} className="animate-spin" /> Creating workspace…</>
                : <>Create workspace <ArrowRight size={16} /></>
              }
            </button>

          </form>

          {/* SSO */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0', color: '#9AA2B1', fontSize: 13 }}>
            <div style={{ flex: 1, height: 1, background: '#E2E5EB' }} />
            or sign up with
            <div style={{ flex: 1, height: 1, background: '#E2E5EB' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {['Google Workspace', 'Microsoft 365'].map(label => (
              <button
                key={label}
                type="button"
                title="Coming soon"
                style={{
                  flex: 1, height: 44,
                  border: '1px solid #E2E5EB', background: '#fff',
                  fontSize: 12, fontWeight: 500, color: '#3A4252',
                  cursor: 'not-allowed', opacity: 0.6, fontFamily: 'inherit',
                }}
              >
                {label}
              </button>
            ))}
          </div>

        </div>
      </main>

    </div>
  );
}
