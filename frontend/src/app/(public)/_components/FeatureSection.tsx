'use client';

import { Building2, Mail, Shield, Users, Lock, BarChart3 } from 'lucide-react';

const FEATURES = [
  { Icon: Building2, title: 'Multi-tenant by design',   desc: 'One workspace, every client. Filter, route, and report by organization without juggling logins or paying per-tenant.' },
  { Icon: Mail,      title: 'Email + portal ingestion', desc: 'IMAP-pull every client mailbox into a unified queue. Replies go out via SMTP under each tenant\'s domain.' },
  { Icon: Shield,    title: 'SLA tracking',             desc: 'Per-tenant SLA policies with response and resolution timers, breach alerts, and weekly compliance reports.' },
  { Icon: Users,     title: 'L1 / L2 / L3 routing',    desc: 'Define tiers, skills, and on-call rotations. Escalation paths are rules-based — tickets surface to the right agent.' },
  { Icon: Lock,      title: 'Agent collaboration',      desc: 'Internal notes, @mentions, and inline file sharing stay invisible to the requester. Every action timestamped.' },
  { Icon: BarChart3, title: 'Reports built for QBRs',   desc: 'Generate a quarterly business review for any tenant in two clicks. Ticket volume, SLA compliance, leaderboard.' },
];

const STATS = [
  { v: '14M+',  l: 'Tickets resolved on MateDesk'     },
  { v: '98.4%', l: 'Avg. SLA compliance across customers'  },
  { v: '2.1h',  l: 'Median first-response time'            },
  { v: '340',   l: 'MSPs running production workloads'     },
];

const STEPS = [
  { n: '01', t: 'Connect every client mailbox',  d: 'Add an IMAP server per tenant. MateDesk pulls new mail every 60 seconds and threads replies back into the original ticket — no forwarding rules, no broken Reply-Tos.' },
  { n: '02', t: 'Set SLAs and routing rules',    d: 'Define response and resolution windows per priority, per tenant. Auto-assign by level, skill, or round-robin within the on-call team. Override anytime.' },
  { n: '03', t: 'Resolve, report, repeat',       d: 'Agents work the queue. Managers watch SLA health in real time. Quarterly reports are one click away — your QBRs basically write themselves.' },
];

const wrap: React.CSSProperties = { maxWidth: 1280, margin: '0 auto', padding: '0 32px' };
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#1F4ED8', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 12 };
const h2style: React.CSSProperties = { fontFamily: 'var(--font-hemi), sans-serif', fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 700, textTransform: 'uppercase', color: '#0B1220', marginBottom: 16 };

export default function FeatureSection() {
  return (
    <>
      {/* Logo strip */}
      <div style={{ borderTop: '1px solid #E2E5EB', borderBottom: '1px solid #E2E5EB', background: '#F7F8FA' }}>
        <div style={{ ...wrap, padding: '20px 32px', display: 'flex', alignItems: 'center', gap: 40, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#9AA2B1', fontWeight: 500, flexShrink: 0 }}>Trusted by MSPs supporting 12,000+ end users</span>
          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
            {['NetaMate', 'ABC Textile', 'Northstar', 'Uconnex', 'Walk-In IT', 'PixelDesk'].map(n => (
              <span key={n} style={{ fontSize: 14, fontWeight: 700, color: '#C8CDD6', letterSpacing: '0.02em' }}>{n}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Features */}
      <section style={{ padding: '96px 0' }}>
        <div style={wrap}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <span style={eyebrow}>Built for MSPs</span>
            <h2 style={h2style}>Everything you need to support every client</h2>
            <p style={{ fontSize: 16, color: '#6B7385', maxWidth: 600, margin: '0 auto', lineHeight: 1.6 }}>
              MateDesk is not a generic helpdesk re-skinned for MSPs. Every primitive was designed around the way MSP teams actually work.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {FEATURES.map(({ Icon, title, desc }, i) => (
              <div key={title} style={{
                padding: '32px',
                borderTop: '1px solid #E2E5EB',
                borderLeft: '1px solid #E2E5EB',
                borderRight: i % 3 === 2 ? '1px solid #E2E5EB' : 'none',
                borderBottom: i >= 3 ? '1px solid #E2E5EB' : 'none',
              }}>
                <div style={{ width: 36, height: 36, background: '#E6ECFB', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  <Icon size={17} style={{ color: '#1F4ED8' }} />
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0B1220', marginBottom: 8 }}>{title}</h3>
                <p style={{ fontSize: 14, color: '#6B7385', lineHeight: 1.6 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats — dark */}
      <section style={{ background: '#0B1220', padding: '72px 0' }}>
        <div style={wrap}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <span style={{ ...eyebrow, color: '#1F4ED8' }}>By the numbers</span>
            <h2 style={{ ...h2style, color: '#ECEEF2' }}>Tickets handled. Hours saved. SLAs kept.</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderTop: '1px solid #232934', borderLeft: '1px solid #232934' }}>
            {STATS.map(s => (
              <div key={s.l} style={{ padding: '32px 24px', borderRight: '1px solid #232934', borderBottom: '1px solid #232934' }}>
                <div style={{ fontFamily: 'var(--font-hemi), sans-serif', fontSize: 'clamp(28px, 3.5vw, 48px)', fontWeight: 700, color: '#1F4ED8', lineHeight: 1, marginBottom: 8 }}>{s.v}</div>
                <div style={{ fontSize: 13, color: '#6B7385', lineHeight: 1.5 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="howitworks" style={{ padding: '96px 0' }}>
        <div style={wrap}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <span style={eyebrow}>How it works</span>
            <h2 style={h2style}>From mailbox to resolution, in one place</h2>
            <p style={{ fontSize: 16, color: '#6B7385', maxWidth: 560, margin: '0 auto', lineHeight: 1.6 }}>
              Plug in your clients&apos; mail servers, set your SLAs, and let MateDesk handle the routing. Most teams are live within an afternoon.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', border: '1px solid #E2E5EB' }}>
            {STEPS.map((s, i) => (
              <div key={s.n} style={{ padding: '40px 32px', borderRight: i < 2 ? '1px solid #E2E5EB' : 'none' }}>
                <div style={{ fontFamily: 'var(--font-hemi), sans-serif', fontSize: 40, fontWeight: 700, color: '#E2E5EB', lineHeight: 1, marginBottom: 16 }}>{s.n}</div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0B1220', marginBottom: 10 }}>{s.t}</h3>
                <p style={{ fontSize: 14, color: '#6B7385', lineHeight: 1.65 }}>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
