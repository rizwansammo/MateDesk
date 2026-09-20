'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Check, Key, ArrowLeft } from 'lucide-react';

const PRODUCT_NAME = process.env.NEXT_PUBLIC_PRODUCT_NAME || 'MateDesk';
const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || 'matedesk.pro';
const IS_SINGLE_TENANT = (process.env.NEXT_PUBLIC_DEPLOYMENT_MODE ?? 'multi_tenant') === 'single_tenant';
const REDIRECT_URI = IS_SINGLE_TENANT
  ? `https://${APP_DOMAIN}/api/email-settings/oauth2/callback/`
  : `https://your-tenant.${APP_DOMAIN}/api/email-settings/oauth2/callback/`;

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
        background: 'none', border: 'none', cursor: 'pointer', padding: '2px 5px',
        color: copied ? '#34d399' : '#6b7280', display: 'inline-flex', alignItems: 'center',
        transition: 'color 0.15s',
      }}
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
    </button>
  );
}

function Code({ children }: { children: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 2,
      background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)',
      borderRadius: 3, padding: '1px 6px',
      fontFamily: 'monospace', fontSize: 12, color: '#c4b5fd',
    }}>
      {children}
      <CopyBtn text={children} />
    </span>
  );
}

function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(children).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <div style={{ position: 'relative', marginTop: 8 }}>
      <pre style={{
        background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 5, padding: '12px 14px', margin: 0,
        fontSize: 12, color: '#a5b4fc', fontFamily: 'monospace',
        overflowX: 'auto', lineHeight: 1.6,
        whiteSpace: 'pre-wrap', wordBreak: 'break-all',
      }}>
        {children}
      </pre>
      <button
        onClick={copy}
        style={{
          position: 'absolute', top: 8, right: 8,
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 4, padding: '3px 8px', cursor: 'pointer',
          fontSize: 11, color: copied ? '#34d399' : '#9ca3af',
          display: 'flex', alignItems: 'center', gap: 4, transition: 'color 0.15s',
        }}
      >
        {copied ? <Check size={10} /> : <Copy size={10} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

// ── Step accordion ────────────────────────────────────────────────────────────

interface Step { title: string; body: React.ReactNode }

function StepList({ steps, color }: { steps: Step[]; color: string }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {steps.map((s, i) => (
        <div key={i} style={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: 5, overflow: 'hidden' }}>
          <button
            type="button"
            onClick={() => setOpen(open === i ? null : i)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 12,
              padding: '11px 14px',
              background: open === i ? 'rgba(255,255,255,0.04)' : 'none',
              border: 'none', cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span style={{
              width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: open === i ? color : 'rgba(255,255,255,0.08)',
              fontSize: 11, fontWeight: 700,
              color: open === i ? '#fff' : '#9ca3af',
              transition: 'background 0.15s',
            }}>
              {i + 1}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#e5e7eb' }}>{s.title}</span>
            <span style={{ marginLeft: 'auto', color: '#4b5563' }}>
              {open === i ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </span>
          </button>
          {open === i && (
            <div style={{
              padding: '8px 14px 16px 50px',
              fontSize: 13, color: '#9ca3af', lineHeight: 1.8,
              borderTop: '1px solid rgba(255,255,255,0.05)',
            }}>
              {s.body}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Provider card ─────────────────────────────────────────────────────────────

interface Provider {
  name: string; color: string; badge: string; tagline: string;
  permissionsNeeded: string[];
  steps: Step[];
  fieldsNeeded: { label: string; description: string }[];
}

function ProviderCard({ provider }: { provider: Provider }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, overflow: 'hidden', marginBottom: 14 }}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px', background: 'rgba(255,255,255,0.02)',
          border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{
            width: 40, height: 40, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `${provider.color}18`, border: `1px solid ${provider.color}44`,
            fontSize: 18, flexShrink: 0,
          }}>
            {provider.badge}
          </span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#f9fafb' }}>{provider.name}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{provider.tagline}</div>
          </div>
        </div>
        <div style={{ color: '#4b5563', flexShrink: 0 }}>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '22px' }}>

          {/* Fields needed summary */}
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              Fields you&apos;ll need to enter in {PRODUCT_NAME}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
              {provider.fieldsNeeded.map(f => (
                <div key={f.label} style={{
                  padding: '10px 14px', borderRadius: 5,
                  background: `${provider.color}0d`, border: `1px solid ${provider.color}22`,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#e5e7eb' }}>{f.label}</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{f.description}</div>
                </div>
              ))}
            </div>
          </div>

          {/* API permissions needed */}
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              Required API permissions
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {provider.permissionsNeeded.map(p => (
                <span key={p} style={{
                  fontSize: 11, padding: '3px 10px', borderRadius: 20,
                  background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.25)',
                  color: '#c4b5fd', fontFamily: 'monospace',
                }}>
                  {p}
                </span>
              ))}
            </div>
          </div>

          {/* Steps */}
          <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            Step-by-step setup
          </p>
          <StepList steps={provider.steps} color={provider.color} />
        </div>
      )}
    </div>
  );
}

// ── Provider data ─────────────────────────────────────────────────────────────

const providers: Provider[] = [
  {
    name: 'Microsoft 365 (Azure AD / Entra ID)',
    color: '#0078d4',
    badge: 'M',
    tagline: 'Register an Azure AD app · XOAUTH2 via IMAP/SMTP AUTH',
    permissionsNeeded: ['IMAP.AccessAsUser.All', 'SMTP.Send', 'offline_access'],
    fieldsNeeded: [
      { label: 'Client ID', description: 'Application (client) ID from Azure portal' },
      { label: 'Client Secret', description: 'Value (not ID) of the client secret' },
      { label: 'Tenant ID', description: 'Directory (tenant) ID from Azure portal' },
    ],
    steps: [
      {
        title: 'Open Microsoft Entra ID (Azure AD)',
        body: (
          <>
            Go to <strong style={{ color: '#e5e7eb' }}>portal.azure.com</strong> and sign in with a Global Admin or
            Application Administrator account. In the left menu, click{' '}
            <strong style={{ color: '#e5e7eb' }}>Microsoft Entra ID</strong> (formerly Azure Active Directory).
          </>
        ),
      },
      {
        title: 'Register a new application',
        body: (
          <>
            Navigate to <strong style={{ color: '#e5e7eb' }}>App registrations → New registration</strong>.<br />
            Name: <em>{PRODUCT_NAME} Mail</em><br />
            Supported account types: <em>Accounts in this organizational directory only (Single tenant)</em><br />
            Redirect URI: <em>Web</em> → <Code>{REDIRECT_URI}</Code><br />
            Click <strong style={{ color: '#e5e7eb' }}>Register</strong>.
          </>
        ),
      },
      {
        title: 'Copy the Application (Client) ID and Tenant ID',
        body: (
          <>
            On the app&apos;s <strong style={{ color: '#e5e7eb' }}>Overview</strong> page you will see:<br />
            • <strong style={{ color: '#e5e7eb' }}>Application (client) ID</strong> — paste this into the <em>Client ID</em> field in {PRODUCT_NAME}.<br />
            • <strong style={{ color: '#e5e7eb' }}>Directory (tenant) ID</strong> — paste this into the <em>Tenant ID</em> field in {PRODUCT_NAME}.
          </>
        ),
      },
      {
        title: 'Create a client secret',
        body: (
          <>
            Go to <strong style={{ color: '#e5e7eb' }}>Certificates & secrets → New client secret</strong>.<br />
            Description: <em>{PRODUCT_NAME}</em>, Expires: <em>24 months</em> (or as per your policy).<br />
            Click <strong style={{ color: '#e5e7eb' }}>Add</strong>. <span style={{ color: '#f87171', fontWeight: 600 }}>Copy the Value immediately</span> — it
            is only shown once. Paste it into the <em>Client Secret</em> field in {PRODUCT_NAME}.
          </>
        ),
      },
      {
        title: 'Add API permissions',
        body: (
          <>
            Go to <strong style={{ color: '#e5e7eb' }}>API permissions → Add a permission → Microsoft Graph</strong>.
            Choose <em>Delegated permissions</em> and add:
            <CodeBlock>{`IMAP.AccessAsUser.All\nSMTP.Send\noffline_access`}</CodeBlock>
            Then click <strong style={{ color: '#e5e7eb' }}>Grant admin consent</strong> for your tenant (the button at the top of the permissions list).
          </>
        ),
      },
      {
        title: 'Enable SMTP AUTH on the mailbox (if needed)',
        body: (
          <>
            In the <strong style={{ color: '#e5e7eb' }}>Microsoft 365 admin center</strong>, go to{' '}
            <strong style={{ color: '#e5e7eb' }}>Users → Active users → [mailbox] → Mail → Manage email apps</strong>.
            Ensure <strong style={{ color: '#e5e7eb' }}>Authenticated SMTP</strong> is checked.
            This is required for SMTP AUTH even with OAuth2.
          </>
        ),
      },
      {
        title: `Enter in ${PRODUCT_NAME} and save`,
        body: (
          <>
            In {PRODUCT_NAME} <strong style={{ color: '#e5e7eb' }}>Settings → Mail Server → OAuth2</strong>:<br />
            Provider: <em>Microsoft 365</em><br />
            Client ID: <em>your Application ID</em><br />
            Client Secret: <em>the secret value you copied</em><br />
            Tenant ID: <em>your Directory ID</em><br />
            Mailbox Email: <em>support@yourcompany.com</em><br />
            Click <strong style={{ color: '#e5e7eb' }}>Save Settings</strong>.
          </>
        ),
      },
    ],
  },
  {
    name: 'Google Workspace (Google Cloud OAuth2)',
    color: '#ea4335',
    badge: 'G',
    tagline: 'Google Cloud Console · OAuth2 consent screen · XOAUTH2',
    permissionsNeeded: [
      'https://mail.google.com/',
    ],
    fieldsNeeded: [
      { label: 'Client ID', description: 'OAuth2 Client ID from Google Cloud Console' },
      { label: 'Client Secret', description: 'OAuth2 Client Secret' },
    ],
    steps: [
      {
        title: 'Open Google Cloud Console',
        body: (
          <>
            Go to <strong style={{ color: '#e5e7eb' }}>console.cloud.google.com</strong>. Create a new project or
            select an existing one. Name it something like <em>{PRODUCT_NAME}</em>.
          </>
        ),
      },
      {
        title: 'Enable the Gmail API',
        body: (
          <>
            In the Cloud Console, go to <strong style={{ color: '#e5e7eb' }}>APIs & Services → Library</strong>.
            Search for <strong style={{ color: '#e5e7eb' }}>Gmail API</strong> and click <strong style={{ color: '#e5e7eb' }}>Enable</strong>.
          </>
        ),
      },
      {
        title: 'Configure the OAuth consent screen',
        body: (
          <>
            Go to <strong style={{ color: '#e5e7eb' }}>APIs & Services → OAuth consent screen</strong>.<br />
            User type: <em>Internal</em> (for Google Workspace orgs — limits to your domain only).<br />
            App name: <em>{PRODUCT_NAME}</em>, User support email: your admin email.<br />
            Add scope: <Code>https://mail.google.com/</Code><br />
            Save and continue through all steps.
          </>
        ),
      },
      {
        title: 'Create OAuth2 credentials',
        body: (
          <>
            Go to <strong style={{ color: '#e5e7eb' }}>APIs & Services → Credentials → Create Credentials → OAuth client ID</strong>.<br />
            Application type: <em>Web application</em><br />
            Name: <em>{PRODUCT_NAME} Mail</em><br />
            Authorized redirect URIs: <Code>{REDIRECT_URI}</Code><br />
            Click <strong style={{ color: '#e5e7eb' }}>Create</strong>. Copy the <strong style={{ color: '#e5e7eb' }}>Client ID</strong> and{' '}
            <strong style={{ color: '#e5e7eb' }}>Client Secret</strong> shown in the dialog.
          </>
        ),
      },
      {
        title: `Enter in ${PRODUCT_NAME} and save`,
        body: (
          <>
            In {PRODUCT_NAME} <strong style={{ color: '#e5e7eb' }}>Settings → Mail Server → OAuth2</strong>:<br />
            Provider: <em>Google Workspace</em><br />
            Client ID: <em>your OAuth2 Client ID (ends in .apps.googleusercontent.com)</em><br />
            Client Secret: <em>your OAuth2 Client Secret</em><br />
            Mailbox Email: <em>support@yourcompany.com</em><br />
            Click <strong style={{ color: '#e5e7eb' }}>Save Settings</strong>.
          </>
        ),
      },
    ],
  },
  {
    name: 'Zoho Mail (Zoho Developer Console)',
    color: '#e0532a',
    badge: 'Z',
    tagline: 'Zoho API Console · Self Client · XOAUTH2',
    permissionsNeeded: ['ZohoMail.messages.ALL', 'ZohoMail.folders.ALL'],
    fieldsNeeded: [
      { label: 'Client ID', description: 'Client ID from Zoho API Console' },
      { label: 'Client Secret', description: 'Client Secret from Zoho API Console' },
    ],
    steps: [
      {
        title: 'Open Zoho API Console',
        body: (
          <>
            Go to <strong style={{ color: '#e5e7eb' }}>api-console.zoho.com</strong> and sign in with your Zoho admin account.
          </>
        ),
      },
      {
        title: 'Create a Self Client',
        body: (
          <>
            Click <strong style={{ color: '#e5e7eb' }}>Add Client → Server-based Applications</strong>.<br />
            Client Name: <em>{PRODUCT_NAME}</em><br />
            Homepage URL: your {PRODUCT_NAME} URL<br />
            Authorized Redirect URIs: <Code>{REDIRECT_URI}</Code><br />
            Click <strong style={{ color: '#e5e7eb' }}>Create</strong>. Copy the <strong style={{ color: '#e5e7eb' }}>Client ID</strong> and{' '}
            <strong style={{ color: '#e5e7eb' }}>Client Secret</strong>.
          </>
        ),
      },
      {
        title: 'Set the required scopes',
        body: (
          <>
            When authorizing the client, include these scopes:
            <CodeBlock>{`ZohoMail.messages.ALL\nZohoMail.folders.ALL`}</CodeBlock>
            These allow reading incoming mail (IMAP equivalent) and sending outbound mail.
          </>
        ),
      },
      {
        title: `Enter in ${PRODUCT_NAME} and save`,
        body: (
          <>
            In {PRODUCT_NAME} <strong style={{ color: '#e5e7eb' }}>Settings → Mail Server → OAuth2</strong>:<br />
            Provider: <em>Zoho Mail</em><br />
            Client ID: <em>your Zoho Client ID</em><br />
            Client Secret: <em>your Zoho Client Secret</em><br />
            Mailbox Email: <em>support@yourcompany.com</em><br />
            Click <strong style={{ color: '#e5e7eb' }}>Save Settings</strong>.
          </>
        ),
      },
    ],
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OAuth2GuidePage() {
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
          <Key size={15} style={{ color: '#a78bfa' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#f9fafb' }}>OAuth2 / Modern Auth — Setup Guide</span>
        </div>
        <span style={{
          marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '3px 10px',
          background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.25)',
          color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>
          Azure AD · Google · Zoho
        </span>
      </div>

      {/* Hero */}
      <div style={{ padding: '60px 40px 40px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
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
          OAuth2 / Modern Auth<br />
          <span style={{ color: '#a78bfa' }}>Setup Guide</span>
        </h1>
        <p style={{ fontSize: 15, color: '#9ca3af', lineHeight: 1.7, maxWidth: 620 }}>
          Connect {PRODUCT_NAME} to your mailbox using <strong style={{ color: '#e5e7eb' }}>OAuth2 token-based authentication</strong>.
          No passwords are stored — access is granted via short-lived tokens that are automatically refreshed.
          Required when Basic Auth is blocked by a Conditional Access policy.
        </p>

        {/* How it works */}
        <div style={{
          marginTop: 28, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14,
        }}>
          {[
            { num: '1', label: 'Register App', desc: 'Create an OAuth2 app in your identity provider (Azure, Google, Zoho).' },
            { num: '2', label: 'Enter Credentials', desc: `Paste Client ID, Client Secret, and Tenant ID (M365) into ${PRODUCT_NAME}.` },
            { num: '3', label: 'Authorize', desc: `${PRODUCT_NAME} completes the OAuth2 flow and stores the refresh token securely.` },
          ].map(s => (
            <div key={s.num} style={{
              padding: '16px', borderRadius: 6,
              background: 'rgba(167,139,250,0.05)', border: '1px solid rgba(167,139,250,0.15)',
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', marginBottom: 10,
                background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700, color: '#a78bfa',
              }}>
                {s.num}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#e5e7eb', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.6 }}>{s.desc}</div>
            </div>
          ))}
        </div>

        {/* Security callout */}
        <div style={{
          marginTop: 20, padding: '14px 18px',
          background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)',
          borderRadius: 6, fontSize: 13, color: '#6ee7b7', lineHeight: 1.6,
          display: 'flex', gap: 10,
        }}>
          <span style={{ flexShrink: 0, marginTop: 1 }}>✓</span>
          <span>
            OAuth2 tokens <strong>never expose your account password</strong>. If a token is compromised, you revoke it in your identity provider without changing your password.
            Access automatically stops working if you delete the app registration — a hard kill switch.
          </span>
        </div>
      </div>

      {/* Providers */}
      <div style={{ padding: '0 40px 80px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: '#4b5563',
          textTransform: 'uppercase', letterSpacing: '0.1em',
          marginBottom: 16, paddingBottom: 10,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          Select your identity provider
        </div>
        {providers.map(p => (
          <ProviderCard key={p.name} provider={p} />
        ))}
      </div>

      {/* Footer */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        padding: '20px 40px', textAlign: 'center',
        fontSize: 12, color: '#374151',
      }}>
        {PRODUCT_NAME} · By NetaMate Solutions · <a href="/settings/email" style={{ color: '#4b5563', textDecoration: 'none' }}>Back to Mail Settings</a>
      </div>
    </div>
  );
}
