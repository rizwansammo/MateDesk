'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { BrandLogo } from '@/components/BrandLogo';
import { TransitionLink } from '@/components/TransitionLink';
import { usePublicSignupMode } from '@/hooks/usePublicSignupMode';

interface ApplicationResponse {
  id: string;
  status: 'pending';
  email: string;
  requested_slug: string;
}

const benefits = [
  'Application-based access during the private beta.',
  'No payment or credit card required to apply.',
  'Your request is reviewed by the MateDesk team.',
  'Approved workspaces are activated after review.',
];

export default function PrivateBetaApplyPage() {
  const router = useRouter();
  const { signupMode, ready } = usePublicSignupMode();

  const [companyName, setCompanyName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [displayDomain, setDisplayDomain] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<ApplicationResponse | null>(null);

  useEffect(() => {
    setDisplayDomain(window.location.hostname);
  }, []);

  useEffect(() => {
    if (ready && signupMode !== 'private_beta') {
      router.replace('/register');
    }
  }, [ready, signupMode, router]);

  function deriveSlug(name: string) {
    return name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30);
  }

  function handleCompanyChange(value: string) {
    setCompanyName(value);
    if (!slugTouched) setSlug(deriveSlug(value));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const data = await apiFetch<ApplicationResponse>('/api/beta/apply/', {
        method: 'POST',
        body: JSON.stringify({
          company_name: companyName.trim(),
          owner_name: ownerName.trim(),
          email: email.trim(),
          requested_slug: slug.trim(),
        }),
      });
      setSubmitted(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Application could not be submitted. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', background: '#0E1117', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={22} className="animate-spin" style={{ color: '#60a5fa' }} />
      </div>
    );
  }

  if (signupMode !== 'private_beta') return null;

  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', background: '#0E1117', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 520 }}>
          <div style={{
            width: 64, height: 64,
            background: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.28)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px',
          }}>
            <CheckCircle2 size={30} style={{ color: '#34d399' }} />
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#60a5fa', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
            Private Beta
          </div>
          <h1 style={{
            fontFamily: 'var(--font-hemi), sans-serif',
            fontWeight: 700, fontSize: 30,
            textTransform: 'uppercase', letterSpacing: '0.01em',
            color: '#ECEEF2', marginBottom: 14,
          }}>
            Application received
          </h1>
          <p style={{ fontSize: 15, color: '#9AA2B1', lineHeight: 1.7, marginBottom: 8 }}>
            Thanks for applying to the MateDesk Private Beta. Our team will review your workspace request.
          </p>
          <p style={{ fontSize: 14, color: '#6B7385', lineHeight: 1.6, marginBottom: 30 }}>
            We’ll contact <strong style={{ color: '#ECEEF2' }}>{submitted.email}</strong> when access is approved.
          </p>
          <div style={{
            border: '1px solid #232934', background: '#151821',
            padding: '14px 18px', marginBottom: 28, textAlign: 'left',
          }}>
            <div style={{ fontSize: 11, color: '#6B7385', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
              Requested workspace
            </div>
            <div style={{ color: '#ECEEF2', fontFamily: 'var(--font-mono), monospace', fontSize: 14 }}>
              {submitted.requested_slug}.{displayDomain}
            </div>
          </div>
          <TransitionLink
            href="/"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              height: 44, padding: '0 20px',
              border: '1px solid #2F3744', color: '#ECEEF2',
              fontSize: 14, fontWeight: 600, textDecoration: 'none',
            }}
          >
            <ArrowLeft size={15} /> Back to MateDesk
          </TransitionLink>
        </div>
      </div>
    );
  }

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
          <div style={{ fontSize: 11, fontWeight: 700, color: '#60a5fa', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
            Private Beta · Applications Open
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-hemi), sans-serif',
              fontWeight: 700,
              fontSize: 'clamp(30px, 3.2vw, 48px)',
              lineHeight: 1.05,
              textTransform: 'uppercase',
              letterSpacing: '0.01em',
              color: '#ECEEF2',
              marginBottom: 18,
            }}
          >
            Request early access to <span style={{ color: '#1F4ED8' }}>MateDesk.</span>
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.65, color: '#9AA2B1', maxWidth: 420, marginBottom: 32 }}>
            Tell us about your MSP and your preferred workspace. We’ll review the application before creating your MateDesk tenant.
          </p>

          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {benefits.map(item => (
              <li key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, color: '#9AA2B1' }}>
                <span style={{ color: '#1F4ED8', marginTop: 1, flexShrink: 0 }}>✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p style={{ fontSize: 12, color: '#485168' }}>By NetaMate Solutions</p>
      </aside>

      <main
        style={{
          width: 'clamp(400px, 42vw, 560px)',
          flexShrink: 0,
          background: '#fff',
          display: 'flex',
          flexDirection: 'column',
          padding: '48px',
          overflowY: 'auto',
        }}
      >
        <p style={{ fontSize: 13, color: '#6B7385', marginBottom: 40, textAlign: 'right' }}>
          Already have a workspace?{' '}
          <TransitionLink href="/login" style={{ color: '#1F4ED8', fontWeight: 600, textDecoration: 'none' }}>
            Sign in →
          </TransitionLink>
        </p>

        <div style={{ maxWidth: 420, width: '100%', margin: '0 auto' }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#0B1220', marginBottom: 6 }}>
            Apply for Private Beta
          </h1>
          <p style={{ fontSize: 14, color: '#6B7385', marginBottom: 28, lineHeight: 1.6 }}>
            No account or password is created yet. Your workspace will only be provisioned after approval.
          </p>

          {error && (
            <div style={{
              marginBottom: 20, padding: '10px 14px',
              background: '#FEE2E2', border: '1px solid #FCA5A5',
              color: '#991B1B', fontSize: 13, lineHeight: 1.5,
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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

            <div>
              <label style={lbl}>Work Email</label>
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

            <div>
              <label style={lbl}>Preferred Tenant Subdomain</label>
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
                  Requested workspace: <strong style={{ fontFamily: 'var(--font-mono), monospace' }}>{slug}.{displayDomain}</strong>
                </p>
              )}
            </div>

            <p style={{ fontSize: 12, color: '#6B7385', lineHeight: 1.6 }}>
              By submitting this application you agree that NetaMate Solutions may contact you about your MateDesk Private Beta request. See our{' '}
              <Link href="#" style={{ color: '#1F4ED8', textDecoration: 'none' }}>Privacy Policy</Link>.
            </p>

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
                ? <><Loader2 size={16} className="animate-spin" /> Submitting application…</>
                : <>Submit Application <ArrowRight size={16} /></>
              }
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
