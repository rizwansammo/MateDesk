'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Check, Mail, ArrowLeft } from 'lucide-react';

const PRODUCT_NAME = process.env.NEXT_PUBLIC_PRODUCT_NAME || 'MateDesk';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Step {
  title: string;
  body: React.ReactNode;
}

interface ProviderConfig {
  name: string;
  color: string;
  badge: string;
  imap: { host: string; port: number; security: string };
  smtp: { host: string; port: number; security: string };
  steps: Step[];
}

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      onClick={copy}
      title="Copy"
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px',
        color: copied ? '#34d399' : '#6b7280', display: 'inline-flex', alignItems: 'center',
        transition: 'color 0.15s',
      }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

function Code({ children }: { children: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 2,
      background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
      borderRadius: 3, padding: '1px 6px',
      fontFamily: 'monospace', fontSize: 12, color: '#a5b4fc',
    }}>
      {children}
      <CopyBtn text={children} />
    </span>
  );
}

// ── Server settings row ───────────────────────────────────────────────────────

function ServerRow({ label, host, port, security }: { label: string; host: string; port: number; security: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 16px', background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)', marginBottom: 6, borderRadius: 4,
    }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', minWidth: 50 }}>{label}</span>
      <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: '#e5e7eb', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Code>{host}</Code>
        </span>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>Port <strong style={{ color: '#e5e7eb' }}>{port}</strong></span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 8px',
          background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
          color: '#a5b4fc', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>{security}</span>
      </div>
    </div>
  );
}

// ── Expandable provider card ──────────────────────────────────────────────────

function ProviderCard({ provider }: { provider: ProviderConfig }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<number | null>(null);

  return (
    <div style={{
      border: `1px solid rgba(255,255,255,0.1)`,
      borderRadius: 6, overflow: 'hidden', marginBottom: 12,
    }}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', background: 'rgba(255,255,255,0.03)',
          border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{
            width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `${provider.color}18`, border: `1px solid ${provider.color}44`,
            fontSize: 16, flexShrink: 0,
          }}>
            {provider.badge}
          </span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#f9fafb' }}>{provider.name}</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>
              IMAP {provider.imap.host} · SMTP {provider.smtp.host}
            </div>
          </div>
        </div>
        <div style={{ color: '#6b7280', flexShrink: 0 }}>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </button>

      {open && (
        <div style={{ padding: '0 20px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>

          {/* Server settings */}
          <div style={{ marginTop: 16, marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              Server Settings
            </p>
            <ServerRow label="IMAP" host={provider.imap.host} port={provider.imap.port} security={provider.imap.security} />
            <ServerRow label="SMTP" host={provider.smtp.host} port={provider.smtp.port} security={provider.smtp.security} />
          </div>

          {/* Steps */}
          <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            How to get an App Password
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {provider.steps.map((s, i) => (
              <div key={i} style={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: 5, overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => setStep(step === i ? null : i)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', background: step === i ? 'rgba(255,255,255,0.04)' : 'none',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{
                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: step === i ? provider.color : 'rgba(255,255,255,0.08)',
                    fontSize: 11, fontWeight: 700,
                    color: step === i ? '#fff' : '#9ca3af',
                    transition: 'background 0.15s',
                  }}>
                    {i + 1}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#e5e7eb' }}>{s.title}</span>
                  <span style={{ marginLeft: 'auto', color: '#4b5563' }}>
                    {step === i ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </span>
                </button>
                {step === i && (
                  <div style={{
                    padding: '8px 14px 14px 48px',
                    fontSize: 13, color: '#9ca3af', lineHeight: 1.75,
                    borderTop: '1px solid rgba(255,255,255,0.05)',
                  }}>
                    {s.body}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Provider data ─────────────────────────────────────────────────────────────

const providers: ProviderConfig[] = [
  {
    name: 'Gmail / Google Workspace',
    color: '#ea4335',
    badge: 'G',
    imap: { host: 'imap.gmail.com', port: 993, security: 'SSL/TLS' },
    smtp: { host: 'smtp.gmail.com', port: 587, security: 'STARTTLS' },
    steps: [
      {
        title: 'Enable 2-Step Verification',
        body: (
          <>
            App Passwords require 2FA to be active. Go to{' '}
            <strong style={{ color: '#e5e7eb' }}>myaccount.google.com → Security</strong> and enable
            <strong style={{ color: '#e5e7eb' }}> 2-Step Verification</strong> if not already on.
          </>
        ),
      },
      {
        title: 'Generate an App Password',
        body: (
          <>
            Go to <strong style={{ color: '#e5e7eb' }}>myaccount.google.com → Security → App Passwords</strong>.
            Select app: <strong style={{ color: '#e5e7eb' }}>Mail</strong>, Select device: <strong style={{ color: '#e5e7eb' }}>Other (custom name)</strong>,
            name it <em>{PRODUCT_NAME}</em>. Click <strong style={{ color: '#e5e7eb' }}>Generate</strong>.
            Copy the 16-character password shown.
          </>
        ),
      },
      {
        title: 'Enable IMAP in Gmail',
        body: (
          <>
            In Gmail, go to <strong style={{ color: '#e5e7eb' }}>Settings (⚙) → See all settings → Forwarding and POP/IMAP</strong>.
            Under <em>IMAP Access</em>, select <strong style={{ color: '#e5e7eb' }}>Enable IMAP</strong>. Save.
          </>
        ),
      },
      {
        title: `Enter in ${PRODUCT_NAME}`,
        body: (
          <>
            Username: your full Gmail address (e.g. <Code>support@yourdomain.com</Code>)<br />
            Password: the 16-character App Password<br />
            IMAP Host: <Code>imap.gmail.com</Code> Port: <Code>993</Code> Security: SSL/TLS<br />
            SMTP Host: <Code>smtp.gmail.com</Code> Port: <Code>587</Code> Security: STARTTLS
          </>
        ),
      },
    ],
  },
  {
    name: 'Microsoft 365 / Outlook',
    color: '#0078d4',
    badge: 'M',
    imap: { host: 'outlook.office365.com', port: 993, security: 'SSL/TLS' },
    smtp: { host: 'smtp.office365.com', port: 587, security: 'STARTTLS' },
    steps: [
      {
        title: 'Enable SMTP AUTH for the mailbox',
        body: (
          <>
            In the <strong style={{ color: '#e5e7eb' }}>Microsoft 365 admin center</strong>, go to{' '}
            <strong style={{ color: '#e5e7eb' }}>Users → Active users → select mailbox → Mail → Manage email apps</strong>.
            Ensure <strong style={{ color: '#e5e7eb' }}>Authenticated SMTP</strong> is checked.
          </>
        ),
      },
      {
        title: 'Enable IMAP in mailbox settings',
        body: (
          <>
            In the admin center, verify <strong style={{ color: '#e5e7eb' }}>IMAP</strong> is enabled for the mailbox under
            <strong style={{ color: '#e5e7eb' }}> Mail apps</strong>. It&apos;s on by default for most tenants.
          </>
        ),
      },
      {
        title: 'Generate an App Password (if MFA is on)',
        body: (
          <>
            If the account uses MFA, go to <strong style={{ color: '#e5e7eb' }}>mysignins.microsoft.com → Security info → Add sign-in method → App password</strong>.
            Name it <em>{PRODUCT_NAME}</em> and copy the generated password.
            If Basic Auth is blocked by a Conditional Access policy, use <strong style={{ color: '#e5e7eb' }}>OAuth2</strong> instead.
          </>
        ),
      },
      {
        title: `Enter in ${PRODUCT_NAME}`,
        body: (
          <>
            Username: full email address (e.g. <Code>support@yourcompany.com</Code>)<br />
            Password: account password or App Password<br />
            IMAP Host: <Code>outlook.office365.com</Code> Port: <Code>993</Code> Security: SSL/TLS<br />
            SMTP Host: <Code>smtp.office365.com</Code> Port: <Code>587</Code> Security: STARTTLS
          </>
        ),
      },
    ],
  },
  {
    name: 'Zoho Mail',
    color: '#e0532a',
    badge: 'Z',
    imap: { host: 'imap.zoho.com', port: 993, security: 'SSL/TLS' },
    smtp: { host: 'smtp.zoho.com', port: 587, security: 'STARTTLS' },
    steps: [
      {
        title: 'Enable IMAP & SMTP in Zoho Mail',
        body: (
          <>
            In Zoho Mail, go to <strong style={{ color: '#e5e7eb' }}>Settings → Mail Accounts → IMAP Access</strong>.
            Enable <strong style={{ color: '#e5e7eb' }}>IMAP</strong>. Do the same for <strong style={{ color: '#e5e7eb' }}>SMTP</strong> if not already active.
          </>
        ),
      },
      {
        title: 'Generate an App-specific Password',
        body: (
          <>
            Go to <strong style={{ color: '#e5e7eb' }}>accounts.zoho.com → Security → App Passwords</strong>.
            Click <strong style={{ color: '#e5e7eb' }}>Generate New Password</strong>, name it <em>{PRODUCT_NAME}</em>, and copy the password.
            Use this instead of your account password.
          </>
        ),
      },
      {
        title: `Enter in ${PRODUCT_NAME}`,
        body: (
          <>
            Username: full Zoho email (e.g. <Code>support@yourcompany.com</Code>)<br />
            Password: App-specific password<br />
            IMAP Host: <Code>imap.zoho.com</Code> Port: <Code>993</Code> Security: SSL/TLS<br />
            SMTP Host: <Code>smtp.zoho.com</Code> Port: <Code>587</Code> Security: STARTTLS
          </>
        ),
      },
    ],
  },
  {
    name: 'Yahoo Mail',
    color: '#6001d2',
    badge: 'Y',
    imap: { host: 'imap.mail.yahoo.com', port: 993, security: 'SSL/TLS' },
    smtp: { host: 'smtp.mail.yahoo.com', port: 587, security: 'STARTTLS' },
    steps: [
      {
        title: 'Enable access for less secure apps',
        body: (
          <>
            Yahoo requires an App Password for third-party IMAP clients. Log in to your Yahoo account and go to{' '}
            <strong style={{ color: '#e5e7eb' }}>Account Security → Generate app password</strong>.
            If you don&apos;t see this option, enable <strong style={{ color: '#e5e7eb' }}>2-step verification</strong> first.
          </>
        ),
      },
      {
        title: 'Generate App Password',
        body: (
          <>
            At <strong style={{ color: '#e5e7eb' }}>Yahoo Account Security</strong>, select <em>Other app</em>, name it <em>{PRODUCT_NAME}</em>,
            and click <strong style={{ color: '#e5e7eb' }}>Generate</strong>. Copy the 16-character code.
          </>
        ),
      },
      {
        title: `Enter in ${PRODUCT_NAME}`,
        body: (
          <>
            Username: full Yahoo address<br />
            Password: App Password<br />
            IMAP Host: <Code>imap.mail.yahoo.com</Code> Port: <Code>993</Code> Security: SSL/TLS<br />
            SMTP Host: <Code>smtp.mail.yahoo.com</Code> Port: <Code>587</Code> Security: STARTTLS
          </>
        ),
      },
    ],
  },
  {
    name: 'iCloud Mail (Apple)',
    color: '#007aff',
    badge: '🍎',
    imap: { host: 'imap.mail.me.com', port: 993, security: 'SSL/TLS' },
    smtp: { host: 'smtp.mail.me.com', port: 587, security: 'STARTTLS' },
    steps: [
      {
        title: 'Enable 2-Factor Authentication on Apple ID',
        body: (
          <>
            App-specific passwords require 2FA. Enable it in{' '}
            <strong style={{ color: '#e5e7eb' }}>appleid.apple.com → Sign-In and Security → Two-Factor Authentication</strong>.
          </>
        ),
      },
      {
        title: 'Generate an App-Specific Password',
        body: (
          <>
            Go to <strong style={{ color: '#e5e7eb' }}>appleid.apple.com → Sign-In and Security → App-Specific Passwords → Generate</strong>.
            Label it <em>{PRODUCT_NAME}</em>. Copy the generated password (format: xxxx-xxxx-xxxx-xxxx).
          </>
        ),
      },
      {
        title: `Enter in ${PRODUCT_NAME}`,
        body: (
          <>
            Username: your iCloud email (e.g. <Code>you@icloud.com</Code>)<br />
            Password: App-Specific Password<br />
            IMAP Host: <Code>imap.mail.me.com</Code> Port: <Code>993</Code><br />
            SMTP Host: <Code>smtp.mail.me.com</Code> Port: <Code>587</Code>
          </>
        ),
      },
    ],
  },
  {
    name: 'Amazon WorkMail',
    color: '#ff9900',
    badge: 'A',
    imap: { host: '(your-region).workmail.aws', port: 993, security: 'SSL/TLS' },
    smtp: { host: '(your-region).workmail.aws', port: 587, security: 'STARTTLS' },
    steps: [
      {
        title: 'Find your WorkMail endpoint',
        body: (
          <>
            Log in to the <strong style={{ color: '#e5e7eb' }}>Amazon WorkMail console</strong>, open your organization,
            go to <strong style={{ color: '#e5e7eb' }}>Organization Settings → General</strong>.
            Your IMAP/SMTP endpoint is listed as the <em>Web Application URL</em> hostname, e.g.{' '}
            <Code>mail.us-east-1.awsapps.com</Code>.
          </>
        ),
      },
      {
        title: 'Use account credentials',
        body: (
          <>
            WorkMail uses your organization user email and password directly — no App Password step is required
            unless you have additional MFA policies configured.
          </>
        ),
      },
      {
        title: `Enter in ${PRODUCT_NAME}`,
        body: (
          <>
            Username: full email address<br />
            Password: WorkMail account password<br />
            IMAP Host: your WorkMail endpoint, Port: <Code>993</Code><br />
            SMTP Host: same endpoint, Port: <Code>587</Code>
          </>
        ),
      },
    ],
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BasicAuthGuidePage() {
  return (
    <div style={{ height: '100vh', overflowY: 'auto', background: '#0E1117', color: '#f9fafb' }}>

      {/* Top bar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'rgba(14,17,23,0.92)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        padding: '14px 40px', display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <button
          type="button"
          onClick={() => window.close()}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 12, color: '#6b7280',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#e5e7eb'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#6b7280'; }}
        >
          <ArrowLeft size={13} /> Close
        </button>
        <span style={{ color: 'rgba(255,255,255,0.15)' }}>|</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Mail size={15} style={{ color: '#60a5fa' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#f9fafb' }}>Basic Auth — Mail Provider Setup Guide</span>
        </div>
        <span style={{
          marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '3px 10px',
          background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.25)',
          color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>
          IMAP · SMTP · App Passwords
        </span>
      </div>

      {/* Hero */}
      <div style={{ padding: '60px 40px 40px', maxWidth: 860, margin: '0 auto' }}>
        <div style={{ marginBottom: 8 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color: '#60a5fa',
            textTransform: 'uppercase', letterSpacing: '0.1em',
          }}>
            {PRODUCT_NAME} · Mail Server
          </span>
        </div>
        <h1 style={{
          fontFamily: 'var(--font-hemi, sans-serif)',
          fontSize: 'clamp(28px, 4vw, 48px)',
          fontWeight: 700, lineHeight: 1.1,
          textTransform: 'uppercase', letterSpacing: '0.01em',
          color: '#f9fafb', marginBottom: 16,
        }}>
          Basic Auth<br />
          <span style={{ color: '#60a5fa' }}>Setup Guide</span>
        </h1>
        <p style={{ fontSize: 15, color: '#9ca3af', lineHeight: 1.7, maxWidth: 580 }}>
          Connect any mailbox to {PRODUCT_NAME} using IMAP and SMTP with a username and password.
          Most providers require an <strong style={{ color: '#e5e7eb' }}>App-Specific Password</strong> when
          two-factor authentication is enabled — your normal login password will not work.
        </p>

        {/* Info callout */}
        <div style={{
          marginTop: 28, padding: '14px 18px',
          background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)',
          borderRadius: 6, fontSize: 13, color: '#fcd34d', lineHeight: 1.6,
          display: 'flex', gap: 10,
        }}>
          <span style={{ flexShrink: 0, marginTop: 1 }}>⚠</span>
          <span>
            If your M365 or Google Workspace tenant has a <strong>Conditional Access policy that blocks Basic Auth</strong>,
            use <strong>OAuth2 / Modern Auth</strong> instead. Basic Auth is sufficient for most Zoho, Yahoo, and iCloud setups.
          </span>
        </div>
      </div>

      {/* Providers */}
      <div style={{ padding: '0 40px 80px', maxWidth: 860, margin: '0 auto' }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: '#4b5563',
          textTransform: 'uppercase', letterSpacing: '0.1em',
          marginBottom: 16, paddingBottom: 10,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          Select your mail provider
        </div>
        {providers.map(p => (
          <ProviderCard key={p.name} provider={p} />
        ))}
      </div>

      {/* Footer */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        padding: '20px 40px',
        textAlign: 'center',
        fontSize: 12, color: '#374151',
      }}>
        {PRODUCT_NAME} · By NetaMate Solutions · <a href="/settings/email" style={{ color: '#4b5563', textDecoration: 'none' }}>Back to Mail Settings</a>
      </div>
    </div>
  );
}
