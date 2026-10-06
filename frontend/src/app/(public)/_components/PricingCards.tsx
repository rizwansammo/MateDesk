'use client';

import Link from 'next/link';
import { Check, ArrowRight } from 'lucide-react';
import { usePublicAuthStatus } from '@/hooks/usePublicAuthStatus';
import { usePublicSignupMode } from '@/hooks/usePublicSignupMode';
import { useState, useEffect } from 'react';

type Tier = {
  plan_key?: string;
  name: string;
  tagline: string;
  price: string;
  annual: string;
  featured: boolean;
  features: string[];
};

const FALLBACK_TIERS: Tier[] = [
  {
    name: 'Starter', tagline: 'For independent IT consultants and small MSPs getting off shared inboxes.',
    price: '$19', annual: 'billed annually · $24 monthly', featured: false,
    features: ['Up to 5 client tenants', 'Email + portal ingestion', 'Basic SLA tracking', 'Internal notes & @mentions', 'Standard reports', 'Email + community support'],
  },
  {
    name: 'Pro', tagline: 'For growing MSPs serving 10–50 client organizations with multi-tier support.',
    price: '$39', annual: 'billed annually · $49 monthly', featured: true,
    features: ['Unlimited client tenants', 'L1/L2/L3 routing + skill-based assignment', 'Per-tenant SLA policies + breach alerts', 'Quarterly business review export', 'Custom fields + ticket forms', 'API + 100+ integrations', 'Priority chat support'],
  },
  {
    name: 'Scale', tagline: 'For established MSPs and IT departments with compliance and audit needs.',
    price: '$79', annual: 'billed annually · $99 monthly', featured: false,
    features: ['Everything in Pro', 'SSO (SAML, OIDC) + SCIM provisioning', 'Role-based access control', 'Audit log export (SIEM-ready)', 'Custom domains per tenant', '99.9% uptime SLA', 'Dedicated customer success manager'],
  },
];

const FAQS = [
  { q: 'How does multi-tenant pricing work?', a: 'You pay per agent seat, regardless of how many client organizations you serve. Starter caps at 5 tenants; Pro and Scale are unlimited. No per-end-user fee.' },
  { q: 'Can I bring my own domain?', a: 'Yes. Every tenant gets a free tenant.matedesk.com subdomain. On the Scale plan you can map a custom domain like support.client.com with automatic TLS provisioning.' },
  { q: 'How do I migrate from Freshdesk / Zoho / ServiceNow?', a: 'We import tickets, contacts, organizations, custom fields, and attachments from most major helpdesks via a guided importer. Our success team handles complex migrations on Pro and Scale plans.' },
  { q: 'What about email deliverability?', a: 'MateDesk signs outbound replies with DKIM under your tenant\'s domain and supports SPF + DMARC alignment per client. A deliverability dashboard lets you monitor bounce and spam rates.' },
  { q: 'Is my client data isolated between tenants?', a: 'Yes. Tenant data is logically isolated at the database level. Cross-tenant queries are gated by role-based access control. Enterprise plans support physical isolation in dedicated regions.' },
  { q: 'Do you offer a free trial?', a: '14 days, all features, unlimited tenants, no credit card. After trial, your data is preserved for 90 days. Cancel anytime.' },
];

const wrap: React.CSSProperties = { maxWidth: 1280, margin: '0 auto', padding: '0 32px' };

export default function PricingCards() {
  const { isAuth, dashboardUrl } = usePublicAuthStatus();
  const { signupMode } = usePublicSignupMode();
  const isPrivateBeta = signupMode === 'private_beta';
  const signupHref = isPrivateBeta ? '/apply' : '/register';
  const [tiers, setTiers] = useState<Tier[]>(FALLBACK_TIERS);

  useEffect(() => {
    fetch('/api/plans/public/')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.plans?.length) setTiers(data.plans);
      })
      .catch(() => {});
  }, []);

  return (
    <>
      {/* Pricing */}
      <section id="pricing" style={{ padding: '96px 0', background: '#F7F8FA' }}>
        <div style={wrap}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#1F4ED8', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 12 }}>Pricing</span>
            <h2 style={{ fontFamily: 'var(--font-hemi), sans-serif', fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 700, textTransform: 'uppercase', color: '#0B1220', marginBottom: 16 }}>
              One platform. Pay for agents, not tenants.
            </h2>
            <p style={{ fontSize: 16, color: '#6B7385', maxWidth: 560, margin: '0 auto', lineHeight: 1.6 }}>
              {isPrivateBeta
                ? 'MateDesk is currently in Private Beta. Access is approval-based, and no payment is collected during the application process.'
                : 'No per-client fees, no surprise overage charges. Pay only for the agents working tickets.'}
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', border: '1px solid #E2E5EB' }}>
            {tiers.map((t, i) => (
              <div key={t.name} style={{ padding: '32px 28px', borderRight: i < 2 ? '1px solid #E2E5EB' : 'none', background: t.featured ? '#fff' : 'transparent', position: 'relative' }}>
                {t.featured && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: '#1F4ED8' }} />}
                {t.featured && <div style={{ fontSize: 11, fontWeight: 700, color: '#1F4ED8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Most popular</div>}
                <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0B1220', marginBottom: 8 }}>{t.name}</h3>
                <p style={{ fontSize: 13, color: '#6B7385', lineHeight: 1.5, marginBottom: 20, minHeight: 52 }}>{t.tagline}</p>
                <div style={{ marginBottom: 4 }}>
                  <span style={{ fontFamily: 'var(--font-hemi), sans-serif', fontSize: 52, fontWeight: 700, color: '#0B1220' }}>{t.price}</span>
                  <span style={{ fontSize: 14, color: '#6B7385' }}> /agent/mo</span>
                </div>
                <p style={{ fontSize: 12, color: '#9AA2B1', marginBottom: 24 }}>{t.annual}</p>
                {isAuth ? (
                  <a
                    href={dashboardUrl}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      height: 44, width: '100%', marginBottom: 28,
                      background: t.featured ? '#1F4ED8' : 'transparent',
                      border: t.featured ? 'none' : '1px solid #C8CDD6',
                      color: t.featured ? '#fff' : '#0B1220',
                      fontSize: 14, fontWeight: 600, textDecoration: 'none', transition: 'background 120ms',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = t.featured ? '#1B43BC' : '#F7F8FA'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = t.featured ? '#1F4ED8' : 'transparent'; }}
                  >
                    Go to Dashboard
                  </a>
                ) : (
                  <Link
                    href={signupHref}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      height: 44, width: '100%', marginBottom: 28,
                      background: t.featured ? '#1F4ED8' : 'transparent',
                      border: t.featured ? 'none' : '1px solid #C8CDD6',
                      color: t.featured ? '#fff' : '#0B1220',
                      fontSize: 14, fontWeight: 600, textDecoration: 'none', transition: 'background 120ms',
                    }}
                    onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.background = t.featured ? '#1B43BC' : '#F7F8FA'; }}
                    onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.background = t.featured ? '#1F4ED8' : 'transparent'; }}
                  >
                    {isPrivateBeta ? 'Apply for Beta' : 'Start free trial'}
                  </Link>
                )}
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {t.features.map(f => (
                    <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#3A4252' }}>
                      <Check size={14} style={{ color: '#1F4ED8', flexShrink: 0, marginTop: 1 }} />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Enterprise */}
          <div style={{ marginTop: 24, padding: '28px 32px', border: '1px solid #E2E5EB', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0B1220', marginBottom: 6 }}>Enterprise</h3>
              <p style={{ fontSize: 14, color: '#6B7385', maxWidth: 640, lineHeight: 1.55 }}>
                Self-hosted, regional data residency, custom security review, and white-glove onboarding for MSPs with 200+ agents or regulated workloads.
              </p>
            </div>
            <a href="#" style={{ height: 44, padding: '0 24px', display: 'inline-flex', alignItems: 'center', background: '#1F4ED8', color: '#fff', fontSize: 14, fontWeight: 600, textDecoration: 'none', flexShrink: 0, transition: 'background 120ms' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#1B43BC'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#1F4ED8'; }}
            >
              Talk to sales
            </a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" style={{ padding: '80px 0' }}>
        <div style={wrap}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#1F4ED8', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 12 }}>FAQ</span>
            <h2 style={{ fontFamily: 'var(--font-hemi), sans-serif', fontSize: 'clamp(22px, 2.8vw, 32px)', fontWeight: 700, textTransform: 'uppercase', color: '#0B1220' }}>
              Questions, answered
            </h2>
          </div>
          <div style={{ maxWidth: 800, margin: '0 auto', border: '1px solid #E2E5EB' }}>
            {FAQS.map((f, i) => (
              <details key={f.q} style={{ borderBottom: i < FAQS.length - 1 ? '1px solid #E2E5EB' : 'none' }}>
                <summary style={{ padding: '18px 24px', cursor: 'pointer', fontSize: 15, fontWeight: 600, color: '#0B1220', display: 'flex', justifyContent: 'space-between', alignItems: 'center', listStyle: 'none', userSelect: 'none' }}>
                  {f.q}
                  <span style={{ color: '#9AA2B1', fontSize: 20, flexShrink: 0, marginLeft: 12 }}>+</span>
                </summary>
                <p style={{ padding: '0 24px 20px', fontSize: 14, color: '#6B7385', lineHeight: 1.7, margin: 0 }}>
                  {isPrivateBeta && f.q === 'Do you offer a free trial?'
                    ? 'MateDesk is currently available through a limited private beta. Submit an application for access; no payment is required to apply.'
                    : f.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA banner */}
      <section style={{ background: '#0B1220', padding: '96px 0', textAlign: 'center' }}>
        <div style={wrap}>
          <h2 style={{ fontFamily: 'var(--font-hemi), sans-serif', fontSize: 'clamp(28px, 4vw, 52px)', fontWeight: 700, textTransform: 'uppercase', color: '#ECEEF2', lineHeight: 1.05, marginBottom: 20 }}>
            Ready to retire the<br /><span style={{ color: '#1F4ED8' }}>shared inbox?</span>
          </h2>
          <p style={{ fontSize: 16, color: '#6B7385', maxWidth: 560, margin: '0 auto 36px', lineHeight: 1.6 }}>
            {isPrivateBeta
              ? 'Join the MateDesk Private Beta. Tell us about your MSP and we’ll review your workspace request for early access.'
              : 'Spin up your MateDesk tenant in under 5 minutes. Pull in your first client mailbox and never lose track of an SLA again.'}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            {isAuth ? (
              <a href={dashboardUrl} style={{ height: 52, padding: '0 28px', display: 'inline-flex', alignItems: 'center', gap: 8, background: '#1F4ED8', color: '#fff', fontSize: 16, fontWeight: 600, textDecoration: 'none', transition: 'background 120ms' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#1B43BC'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#1F4ED8'; }}
              >
                Go to Dashboard <ArrowRight size={18} />
              </a>
            ) : (
              <Link href={signupHref} style={{ height: 52, padding: '0 28px', display: 'inline-flex', alignItems: 'center', gap: 8, background: '#1F4ED8', color: '#fff', fontSize: 16, fontWeight: 600, textDecoration: 'none', transition: 'background 120ms' }}
                onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.background = '#1B43BC'; }}
                onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.background = '#1F4ED8'; }}
              >
                {isPrivateBeta ? 'Apply for Private Beta' : 'Start free trial'} <ArrowRight size={18} />
              </Link>
            )}
            <a href="#" style={{ height: 52, padding: '0 28px', display: 'inline-flex', alignItems: 'center', border: '1px solid #2F3744', color: '#ECEEF2', fontSize: 16, fontWeight: 500, textDecoration: 'none', background: 'transparent', transition: 'background 120ms' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              Book a demo
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
