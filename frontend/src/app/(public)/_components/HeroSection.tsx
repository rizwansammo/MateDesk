'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { usePublicAuthStatus } from '@/hooks/usePublicAuthStatus';
import { usePublicSignupMode } from '@/hooks/usePublicSignupMode';

const FEED = [
  { av: 'TA', bg: '#0B7A6E', name: 'Tanvir',     action: 'replied to a request',  tag: '0008', isNew: false },
  { av: 'NA', bg: '#5B3FD9', name: 'Nusrat',     action: 'resolved a request',    tag: '0011', isNew: false },
  { av: 'SA', bg: '#C2710C', name: 'Sarah',      action: 'escalated to L3',        tag: '0014', isNew: false },
  { av: '+',  bg: '#1F4ED8', name: 'ABC Textile', action: 'New ticket from',       tag: '0017', isNew: true  },
];

const PP_ROWS = [
  { id: 'T15052026-0001', subj: 'Cannot access shared folder',   status: 'Open',        sBg: '#E6ECFB', sC: '#1F4ED8', prio: 'High',     pC: '#D6510E', org: 'ABC Textile' },
  { id: 'T15052026-0002', subj: 'Outlook email not syncing',     status: 'Pending',     sBg: '#FFF1D6', sC: '#A8650B', prio: 'Medium',   pC: '#C2710C', org: 'Northstar'   },
  { id: 'T15052026-0003', subj: 'Printer not responding',        status: 'In Progress', sBg: '#ECE6FB', sC: '#5B3FD9', prio: 'Low',      pC: '#6B7385', org: 'Walk-In IT'  },
  { id: 'T15052026-0004', subj: 'VPN login failed',              status: 'Actioned',    sBg: '#D6F2EE', sC: '#0B7A6E', prio: 'Critical', pC: '#C81E1E', org: 'Uconnex'     },
  { id: 'T15052026-0005', subj: 'Laptop running slow',           status: 'Solved',      sBg: '#DCF1E2', sC: '#137A3B', prio: 'Medium',   pC: '#C2710C', org: 'ABC Textile' },
];

export default function HeroSection() {
  const { isAuth, dashboardUrl } = usePublicAuthStatus();
  const { signupMode } = usePublicSignupMode();
  const isPrivateBeta = signupMode === 'private_beta';
  const signupHref = isPrivateBeta ? '/apply' : '/register';
  return (
    <section style={{ background: '#fff' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '72px 32px 0' }}>

        {/* Two-column hero */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 64, alignItems: 'center', paddingBottom: 72 }}>

          {/* Left copy */}
          <div>
            <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 600, color: '#1F4ED8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 20 }}>
              {isPrivateBeta ? 'Private Beta · Applications Open' : 'MSP Helpdesk · Multi-tenant by design'}
            </span>
            <h1 style={{
              fontFamily: 'var(--font-hemi), sans-serif',
              fontWeight: 700, fontSize: 'clamp(44px, 5.5vw, 76px)',
              lineHeight: 0.96, textTransform: 'uppercase',
              letterSpacing: '0.01em', color: '#0B1220', marginBottom: 24,
            }}>
              Run support<br />for every client.<br />
              <span style={{ color: '#1F4ED8' }}>From one inbox.</span>
            </h1>
            <p style={{ fontSize: 18, lineHeight: 1.55, color: '#3A4252', maxWidth: 520, marginBottom: 36 }}>
              {isPrivateBeta
                ? 'MateDesk is currently available through a limited private beta for MSPs. Apply for access and our team will review your workspace request.'
                : 'MateDesk is the ticketing platform built for managed service providers. One workspace, every client tenant, every SLA.'}
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
              {isAuth ? (
                <a
                  href={dashboardUrl}
                  style={{
                    height: 48, padding: '0 22px', display: 'inline-flex', alignItems: 'center', gap: 8,
                    background: '#1F4ED8', color: '#fff', fontSize: 15, fontWeight: 600,
                    textDecoration: 'none', transition: 'background 120ms',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#1B43BC'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#1F4ED8'; }}
                >
                  Go to Dashboard <ArrowRight size={16} />
                </a>
              ) : (
                <Link
                  href={signupHref}
                  style={{
                    height: 48, padding: '0 22px', display: 'inline-flex', alignItems: 'center', gap: 8,
                    background: '#1F4ED8', color: '#fff', fontSize: 15, fontWeight: 600,
                    textDecoration: 'none', transition: 'background 120ms',
                  }}
                  onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.background = '#1B43BC'; }}
                  onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.background = '#1F4ED8'; }}
                >
                  {isPrivateBeta ? 'Apply for Private Beta' : 'Start free 14-day trial'} <ArrowRight size={16} />
                </Link>
              )}
              <a
                href="#product"
                style={{
                  height: 48, padding: '0 22px', display: 'inline-flex', alignItems: 'center',
                  border: '1px solid #C8CDD6', color: '#0B1220', fontSize: 15, fontWeight: 500,
                  textDecoration: 'none', background: 'transparent', transition: 'background 120ms',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#F7F8FA'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                See it in action
              </a>
            </div>
            <div style={{ display: 'flex', gap: 24, fontSize: 13, color: '#6B7385', flexWrap: 'wrap' }}>
              {(isPrivateBeta
                ? ['Application-based access', 'Applications reviewed by our team', 'No payment required to apply']
                : ['No credit card required', 'Set up in 4 minutes', 'Unlimited tenants in trial']
              ).map(t => (
                <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#1F4ED8', fontWeight: 700 }}>✓</span> {t}
                </span>
              ))}
            </div>
          </div>

          {/* Right — Pulse panel */}
          <div style={{ background: '#0B1220', border: '1px solid #232934', boxShadow: '0 12px 40px rgba(11,18,32,0.18)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #232934', fontSize: 11, color: '#9AA2B1', fontFamily: 'var(--font-mono), monospace' }}>
              <span>Pulse · netamate.matedesk.com</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#34d399' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#34d399', display: 'inline-block', animation: 'pulse-dot 1.8s ease-in-out infinite' }} />
                Live
              </span>
            </div>
            <div style={{ padding: '16px', borderBottom: '1px solid #232934' }}>
              <div style={{ fontSize: 10, color: '#f87171', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>SLA at risk</div>
              <div style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 12, color: '#1F4ED8', marginBottom: 4 }}>T15052026-0014</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#ECEEF2', marginBottom: 10, lineHeight: 1.4 }}>Production fileserver unreachable from branch office</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#9AA2B1', marginBottom: 12 }}>
                <span style={{ background: 'rgba(200,30,30,0.15)', color: '#f87171', padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>Critical</span>
                <span>·</span><span>Uconnex</span><span>·</span><span>Farhan R.</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9AA2B1', marginBottom: 6 }}>
                <span>Resolves in</span>
                <span style={{ fontFamily: 'var(--font-mono), monospace', color: '#f87171', fontWeight: 700, fontSize: 14 }}>00:14:38</span>
              </div>
              <div style={{ height: 4, background: '#232934' }}>
                <div style={{ width: '18%', height: '100%', background: '#f87171' }} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid #232934' }}>
              {[
                { v: '47',    l: 'Open across 12 tenants', accent: false },
                { v: '9',     l: 'Unassigned',             accent: true  },
                { v: '98.4%', l: 'SLA · last 30 days',     accent: false },
                { v: '2.1h',  l: 'Median first reply',     accent: false },
              ].map((s, i) => (
                <div key={i} style={{ padding: '12px 16px', borderRight: i % 2 === 0 ? '1px solid #232934' : 'none', borderBottom: i < 2 ? '1px solid #232934' : 'none' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: s.accent ? '#1F4ED8' : '#ECEEF2', lineHeight: 1 }}>{s.v}</div>
                  <div style={{ fontSize: 11, color: '#6B7385', marginTop: 3 }}>{s.l}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: '8px 0' }}>
              {FEED.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 16px', fontSize: 12, color: '#9AA2B1' }}>
                  <span style={{ width: 24, height: 24, borderRadius: '50%', background: f.bg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>{f.av}</span>
                  <span style={{ flex: 1 }}>
                    {f.isNew
                      ? <>{f.action} <span style={{ color: '#ECEEF2', fontWeight: 600 }}>{f.name}</span></>
                      : <><span style={{ color: '#ECEEF2', fontWeight: 600 }}>{f.name}</span> {f.action}</>
                    }
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 10, color: '#485168' }}>{f.tag}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Product preview */}
      <div id="product" style={{ background: '#F7F8FA', borderTop: '1px solid #E2E5EB', borderBottom: '1px solid #E2E5EB' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '48px 32px' }}>
          <div style={{ border: '1px solid #E2E5EB', boxShadow: '0 8px 32px rgba(11,18,32,0.08)', overflow: 'hidden' }}>
            {/* Browser bar */}
            <div style={{ background: '#F7F8FA', borderBottom: '1px solid #E2E5EB', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', gap: 5 }}>
                {['#f87171', '#fbbf24', '#34d399'].map(c => (
                  <span key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, display: 'inline-block' }} />
                ))}
              </div>
              <span style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 11, color: '#6B7385' }}>netamate.matedesk.com/requests</span>
            </div>
            {/* App chrome */}
            <div style={{ display: 'flex', background: '#fff', minHeight: 240 }}>
              <div style={{ width: 130, background: 'var(--bg-surface)', padding: '12px 8px', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 6px', marginBottom: 16 }}>
                  <div style={{ width: 16, height: 16, background: '#1F4ED8', flexShrink: 0 }} />
                  <span style={{ fontFamily: 'var(--font-hemi), sans-serif', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#e2e8f0' }}>
                    MateDesk
                  </span>
                </div>
                {['Home', 'Dashboard', 'Requests', 'Calendar'].map((item, i) => (
                  <div key={item} style={{ padding: '5px 8px', fontSize: 11, color: i === 2 ? '#60a5fa' : '#6B7385', background: i === 2 ? 'rgba(37,99,235,0.12)' : 'transparent', marginBottom: 2 }}>
                    {item}
                  </div>
                ))}
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #E2E5EB' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0B1220' }}>Requests</div>
                  <div style={{ fontSize: 11, color: '#6B7385' }}>Manage client support tickets across all organizations.</div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: '#F7F8FA', borderBottom: '1px solid #E2E5EB' }}>
                      {['ID', 'Subject', 'Status', 'Priority', 'Org'].map(h => (
                        <th key={h} style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, color: '#6B7385', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PP_ROWS.map(r => (
                      <tr key={r.id} style={{ borderBottom: '1px solid #E2E5EB' }}>
                        <td style={{ padding: '7px 12px', fontFamily: 'var(--font-mono), monospace', color: '#1F4ED8', fontSize: 10, whiteSpace: 'nowrap' }}>{r.id}</td>
                        <td style={{ padding: '7px 12px', color: '#0B1220' }}>{r.subj}</td>
                        <td style={{ padding: '7px 12px' }}><span style={{ background: r.sBg, color: r.sC, padding: '2px 7px', fontSize: 10, fontWeight: 600 }}>{r.status}</span></td>
                        <td style={{ padding: '7px 12px', color: r.pC, fontWeight: 600 }}>{r.prio}</td>
                        <td style={{ padding: '7px 12px', color: '#6B7385' }}>{r.org}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.85)} }`}</style>
    </section>
  );
}
