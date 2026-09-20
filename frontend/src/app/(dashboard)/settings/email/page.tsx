'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Mail, Send, CheckCircle, XCircle,
  Loader2, RefreshCw, Eye, EyeOff, ExternalLink, Shield, Key,
} from 'lucide-react';
import {
  useEmailSettings, useSaveEmailSettings, useTestImap, useTestSmtp,
  useStartMateMailConnection, useCompleteMateMailConnection, useDisconnectMateMail,
  type EmailSettings,
} from '@/hooks/useEmailSettings';

// ── Shared styles ─────────────────────────────────────────────────────────────

const inp =
  'w-full h-9 px-3 text-[13px] bg-[var(--bg-base)] border border-[var(--border-md)] text-[var(--text-1)] ' +
  'placeholder-[#3d4a6b] outline-none focus:border-[#2563eb] transition-colors';

const lbl = 'block mb-1 text-[11px] font-medium text-[var(--text-3)] uppercase tracking-wide';

// ── Small helpers ─────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={lbl}>{label}</label>
      {children}
    </div>
  );
}

function TestConnection({ onTest, pending, disabled, result }: {
  onTest:   () => void;
  pending:  boolean;
  disabled: boolean;
  result:   { success: boolean; message: string } | null;
}) {
  return (
    <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16 }}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onTest}
          disabled={pending || disabled}
          className="flex items-center gap-1.5 px-4 py-1.5 font-medium transition-all disabled:opacity-40 shrink-0"
          style={{ fontSize: 12, color: 'var(--accent-info-fg)', border: '1px solid #1e3a6e', background: 'rgba(37,99,235,0.08)' }}
          onMouseEnter={e => { if (!pending && !disabled) e.currentTarget.style.background = 'rgba(37,99,235,0.15)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.08)'; }}
        >
          {pending ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          {pending ? 'Testing…' : 'Test Connection'}
        </button>
        {result && (
          <span
            role="status"
            className="flex items-start gap-1.5 pt-1"
            style={{ fontSize: 12, lineHeight: 1.5, color: result.success ? 'var(--accent-ok-fg)' : 'var(--accent-danger-fg)' }}
          >
            {result.success
              ? <CheckCircle size={13} className="shrink-0 mt-0.5" />
              : <XCircle     size={13} className="shrink-0 mt-0.5" />}
            {result.message}
          </span>
        )}
      </div>
    </div>
  );
}

function Toggle({ label, desc, checked, onChange }: {
  label: string; desc: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>{desc}</div>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        style={{
          width: 40, height: 22, flexShrink: 0,
          background: checked ? '#2563eb' : 'var(--border-md)',
          position: 'relative', transition: 'background 0.15s',
        }}
      >
        <span style={{
          position: 'absolute', top: 3,
          left: checked ? 21 : 3,
          width: 16, height: 16,
          background: '#fff',
          transition: 'left 0.15s',
        }} />
      </button>
    </div>
  );
}

function PasswordField({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? '••••••••'}
        className={inp}
        style={{ paddingRight: 36 }}
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-4)',
          display: 'flex', alignItems: 'center',
        }}
      >
        {show ? <EyeOff size={13} /> : <Eye size={13} />}
      </button>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, color }: { icon: React.ElementType; title: string; color: string }) {
  return (
    <div
      className="flex items-center gap-2.5 px-5 py-3"
      style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}
    >
      <Icon size={14} style={{ color }} />
      <span style={{ fontSize: 12, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        {title}
      </span>
    </div>
  );
}

// ── Auth method tab ───────────────────────────────────────────────────────────

type AuthMethod = 'basic' | 'oauth2' | 'matemail';

function AuthTabs({ active, onChange }: { active: AuthMethod; onChange: (v: AuthMethod) => void }) {
  return (
    <div className="flex gap-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      {(['basic', 'oauth2', 'matemail'] as AuthMethod[]).map(m => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          style={{
            padding: '10px 20px',
            fontSize: 12, fontWeight: 600,
            color: active === m ? '#2563eb' : 'var(--text-3)',
            background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: active === m ? '2px solid #2563eb' : '2px solid transparent',
            marginBottom: -1,
            transition: 'color 0.15s',
          }}
        >
          {m === 'basic' ? 'Basic Auth' : m === 'oauth2' ? 'OAuth2 / Modern Auth' : 'MateMail Connected App'}
        </button>
      ))}
    </div>
  );
}

// ── Guide button ──────────────────────────────────────────────────────────────

function GuideButton({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1.5 px-3 py-1.5 font-medium transition-all"
      style={{
        fontSize: 11, color: 'var(--accent-ok-fg)',
        border: '1px solid rgba(52,211,153,0.25)',
        background: 'rgba(52,211,153,0.06)',
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(52,211,153,0.12)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(52,211,153,0.06)'; }}
    >
      <ExternalLink size={11} />
      Setup Guide
    </a>
  );
}

// ── OAuth2 provider options ───────────────────────────────────────────────────

const OAUTH2_PROVIDERS = [
  { value: 'm365',   label: 'Microsoft 365 (Azure AD)' },
  { value: 'google', label: 'Google Workspace' },
  { value: 'zoho',   label: 'Zoho Mail' },
  { value: 'other',  label: 'Other (generic OAuth2)' },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EmailSettingsPage() {
  const router    = useRouter();
  const { data: saved, isLoading, refetch } = useEmailSettings();
  const save      = useSaveEmailSettings();
  const testImap  = useTestImap();
  const testSmtp  = useTestSmtp();
  const startMateMail = useStartMateMailConnection();
  const completeMateMail = useCompleteMateMailConnection();
  const disconnectMateMail = useDisconnectMateMail();

  const [authMethod, setAuthMethod] = useState<AuthMethod>('basic');

  const [imap, setImap] = useState({
    imap_host: '', imap_port: 993, imap_username: '', imap_password: '',
    imap_use_ssl: true, imap_folder: 'INBOX', imap_enabled: false,
  });
  const [smtp, setSmtp] = useState({
    smtp_host: '', smtp_port: 587, smtp_username: '', smtp_password: '',
    smtp_use_tls: true, smtp_from_name: '', smtp_from_email: '', smtp_enabled: false,
  });
  const [oauth, setOauth] = useState({
    oauth_provider: 'm365', oauth_client_id: '', oauth_client_secret: '', oauth_tenant_id: '',
  });

  type TestResult = { success: boolean; message: string } | null;
  const [imapResult, setImapResult] = useState<TestResult>(null);
  const [smtpResult, setSmtpResult] = useState<TestResult>(null);
  const [saved_ok,   setSavedOk]    = useState(false);
  const [matemailTenantId, setMateMailTenantId] = useState('');
  const [matemailSecret, setMateMailSecret] = useState('');
  const [matemailError, setMateMailError] = useState('');
  const [matemailPending, setMateMailPending] = useState(false);
  const matemailTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (matemailTimer.current) window.clearInterval(matemailTimer.current);
  }, []);

  useEffect(() => {
    if (!saved) return;
    setAuthMethod(saved.auth_method ?? 'basic');
    setImap({
      imap_host:     saved.imap_host     ?? '',
      imap_port:     saved.imap_port     ?? 993,
      imap_username: saved.imap_username ?? '',
      imap_password: '',
      imap_use_ssl:  saved.imap_use_ssl  ?? true,
      imap_folder:   saved.imap_folder   ?? 'INBOX',
      imap_enabled:  saved.imap_enabled  ?? false,
    });
    setSmtp({
      smtp_host:       saved.smtp_host       ?? '',
      smtp_port:       saved.smtp_port       ?? 587,
      smtp_username:   saved.smtp_username   ?? '',
      smtp_password:   '',
      smtp_use_tls:    saved.smtp_use_tls    ?? true,
      smtp_from_name:  saved.smtp_from_name  ?? '',
      smtp_from_email: saved.smtp_from_email ?? '',
      smtp_enabled:    saved.smtp_enabled    ?? false,
    });
    setOauth({
      oauth_provider:      saved.oauth_provider      ?? 'm365',
      oauth_client_id:     saved.oauth_client_id     ?? '',
      oauth_client_secret: '',
      oauth_tenant_id:     saved.oauth_tenant_id     ?? '',
    });
  }, [saved]);

  function handleSave() {
    const payload: Partial<EmailSettings> = {
      auth_method: authMethod,
      ...imap,
      ...smtp,
      ...oauth,
    };
    if (!imap.imap_password)         delete payload.imap_password;
    if (!smtp.smtp_password)         delete payload.smtp_password;
    if (!oauth.oauth_client_secret)  delete payload.oauth_client_secret;

    save.mutate(payload, {
      onSuccess: () => {
        setSavedOk(true);
        setTimeout(() => setSavedOk(false), 3000);
      },
    });
  }

  async function handleMateMailConnect(event: React.FormEvent) {
    event.preventDefault();
    setMateMailError('');
    try {
      const started = await startMateMail.mutateAsync({
        tenant_id: matemailTenantId.trim(),
        integration_secret: matemailSecret,
      });
      setMateMailSecret('');
      setMateMailPending(true);
      const popup = window.open(
        started.authorization_url,
        'matedesk-matemail-connect',
        'popup=yes,width=620,height=760',
      );
      if (!popup) {
        setMateMailPending(false);
        setMateMailError('Allow pop-ups for MateDesk, then try again.');
        return;
      }

      matemailTimer.current = window.setInterval(async () => {
        try {
          const result = await completeMateMail.mutateAsync({
            tenant_id: started.tenant_id,
            poll_token: started.poll_token,
          });
          if ('auth_method' in result && result.auth_method === 'matemail') {
            if (matemailTimer.current) window.clearInterval(matemailTimer.current);
            matemailTimer.current = null;
            setMateMailPending(false);
            popup.close();
            await refetch();
            return;
          }
          if ('status' in result && (result.status === 'rejected' || result.status === 'expired')) {
            if (matemailTimer.current) window.clearInterval(matemailTimer.current);
            matemailTimer.current = null;
            setMateMailPending(false);
            popup.close();
            setMateMailError(
              result.status === 'expired'
                ? 'The MateMail approval expired. Start again.'
                : 'MateMail access was not approved.',
            );
          }
        } catch {
          // Authorization may still be waiting in MateMail.
        }
      }, 1500);
    } catch (error) {
      setMateMailPending(false);
      setMateMailError(error instanceof Error ? error.message : 'Could not start MateMail connection.');
    }
  }

  async function handleMateMailDisconnect() {
    if (!window.confirm('Disconnect this MateMail mailbox from MateDesk?')) return;
    setMateMailError('');
    try {
      await disconnectMateMail.mutateAsync();
      setAuthMethod('basic');
      await refetch();
    } catch (error) {
      setMateMailError(error instanceof Error ? error.message : 'Could not disconnect MateMail.');
    }
  }

  function handleTestImap() {
    setImapResult(null);
    testImap.mutate(
      {
        imap_host:     imap.imap_host,
        imap_port:     imap.imap_port,
        imap_username: imap.imap_username,
        imap_password: imap.imap_password,
        imap_use_ssl:  imap.imap_use_ssl,
      },
      {
        onSuccess: result => setImapResult(result),
        onError:   () => setImapResult({ success: false, message: 'Could not reach the server. Try again.' }),
      },
    );
  }

  function handleTestSmtp() {
    setSmtpResult(null);
    testSmtp.mutate(
      {
        smtp_host:     smtp.smtp_host,
        smtp_port:     smtp.smtp_port,
        smtp_username: smtp.smtp_username,
        smtp_password: smtp.smtp_password,
        smtp_use_tls:  smtp.smtp_use_tls,
      },
      {
        onSuccess: result => setSmtpResult(result),
        onError:   () => setSmtpResult({ success: false, message: 'Could not reach the server. Try again.' }),
      },
    );
  }

  const setI = (k: keyof typeof imap, v: unknown) => setImap(p => ({ ...p, [k]: v }));
  const setS = (k: keyof typeof smtp, v: unknown) => setSmtp(p => ({ ...p, [k]: v }));
  const setO = (k: keyof typeof oauth, v: unknown) => setOauth(p => ({ ...p, [k]: v }));

  const lastPolled = saved?.last_polled_at
    ? new Date(saved.last_polled_at).toLocaleString()
    : 'Never';

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Secondary bar */}
      <div className="secondary-bar">
        <button
          onClick={() => router.push('/settings')}
          className="flex items-center gap-1.5 transition-colors"
          style={{ fontSize: 12, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-1)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; }}
        >
          <ArrowLeft size={13} /> Back to Settings
        </button>
        <span style={{ color: 'var(--border-md)' }}>|</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>Mail Server</span>
        <div className="ml-auto flex items-center gap-2">
          {saved_ok && (
            <span className="flex items-center gap-1" style={{ fontSize: 12, color: 'var(--accent-ok-fg)' }}>
              <CheckCircle size={12} /> Saved
            </span>
          )}
          {authMethod !== 'matemail' && (
            <button
              onClick={handleSave}
              disabled={save.isPending}
              className="flex items-center gap-1.5 px-4 py-1.5 font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: '#2563eb', fontSize: 12 }}
            >
              {save.isPending && <Loader2 size={11} className="animate-spin" />}
              {save.isPending ? 'Saving…' : 'Save Settings'}
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent-info-fg)' }} />
          <p style={{ fontSize: 13, color: 'var(--text-4)' }}>Loading settings…</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-5" style={{ background: 'var(--bg-base)' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* ── Auth method selector card ─────────────────────────────────── */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
              <div
                className="flex items-center justify-between px-5 py-3"
                style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}
              >
                <div className="flex items-center gap-2.5">
                  <Shield size={14} style={{ color: 'var(--accent-violet-fg)' }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-violet-fg)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    Authentication Method
                  </span>
                </div>
                {authMethod !== 'matemail' && (
                  <GuideButton href={authMethod === 'basic' ? '/email-guides/basic-auth' : '/email-guides/oauth2'} />
                )}
              </div>
              <div className="px-5 pt-0 pb-4">
                <AuthTabs active={authMethod} onChange={setAuthMethod} />
                <div className="pt-4 pb-1" style={{ fontSize: 13, color: 'var(--text-4)', lineHeight: 1.6 }}>
                  {authMethod === 'matemail' ? (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
                <SectionHeader icon={Shield} title="MateMail Connected App" color="#60a5fa" />
                <div className="p-5 flex flex-col gap-4" style={{ maxWidth: 720 }}>
                  {saved?.matemail_connected ? (
                    <>
                      <div className="px-4 py-4" style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)' }}>
                        <div className="flex items-center gap-2" style={{ color: 'var(--accent-ok-fg)', fontWeight: 600 }}>
                          <CheckCircle size={14} /> Connected
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', marginTop: 10 }}>
                          {saved.matemail_mailbox_name ? saved.matemail_mailbox_name + ' · ' : ''}{saved.matemail_mailbox_email}
                        </div>
                        <div className="mt-3 flex flex-col gap-1" style={{ fontSize: 11, color: 'var(--text-4)' }}>
                          {(saved.matemail_permissions ?? []).map(scope => (
                            <span key={scope.key}>✓ {scope.label}</span>
                          ))}
                        </div>
                      </div>
                      <div className="px-3 py-3" style={{ background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.15)', fontSize: 11, color: 'var(--text-4)', lineHeight: 1.7 }}>
                        Incoming messages are read through the MateMail Connected Apps API and converted into tickets. Public ticket replies are sent through the same approved mailbox. MateDesk never stores the mailbox password or PostBox master credential.
                      </div>
                      {matemailError && <div style={{ color: 'var(--accent-danger-fg)', fontSize: 12 }}>{matemailError}</div>}
                      <button
                        type="button"
                        onClick={() => void handleMateMailDisconnect()}
                        disabled={disconnectMateMail.isPending}
                        className="self-start px-4 py-2 font-semibold"
                        style={{ border: '1px solid var(--accent-danger-fg)', color: 'var(--accent-danger-fg)', fontSize: 12 }}
                      >
                        {disconnectMateMail.isPending ? 'Disconnecting…' : 'Disconnect MateMail'}
                      </button>
                    </>
                  ) : (
                    <form onSubmit={handleMateMailConnect} className="flex flex-col gap-4">
                      <div style={{ fontSize: 12, color: 'var(--text-4)', lineHeight: 1.7 }}>
                        In MateMail Portal create a <strong style={{ color: 'var(--text-2)' }}>Helpdesk / Ticketing</strong> connected app for the support mailbox. MateMail will preselect read mail, update read status and send mail. Paste the generated Tenant ID and one-time Integration Secret below.
                      </div>
                      <Field label="MateMail Tenant ID">
                        <input className={inp} value={matemailTenantId} onChange={e => setMateMailTenantId(e.target.value)} required />
                      </Field>
                      <Field label="Integration Secret">
                        <PasswordField value={matemailSecret} onChange={setMateMailSecret} placeholder="mmi_..." />
                      </Field>
                      {matemailPending && (
                        <div className="px-3 py-3" style={{ background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.15)', fontSize: 11, color: 'var(--accent-info-fg)' }}>
                          MateMail approval is open in a separate window. Complete login, 2FA when enabled, and approve the exact mailbox.
                        </div>
                      )}
                      {matemailError && <div style={{ color: 'var(--accent-danger-fg)', fontSize: 12 }}>{matemailError}</div>}
                      <button
                        type="submit"
                        disabled={startMateMail.isPending || matemailPending || !matemailTenantId.trim() || !matemailSecret}
                        className="self-start flex items-center gap-1.5 px-4 py-2 font-semibold text-white disabled:opacity-50"
                        style={{ background: '#2563eb', fontSize: 12 }}
                      >
                        <ExternalLink size={12} /> {startMateMail.isPending ? 'Verifying…' : 'Verify and connect'}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ) : authMethod === 'basic' ? (
                    <>
                      <span style={{ fontWeight: 600, color: 'var(--text-2)' }}>Basic Auth</span> uses a username and password (or app-specific password) to authenticate with IMAP and SMTP.
                    </>
                  ) : authMethod === 'oauth2' ? (
                    <>
                      <span style={{ fontWeight: 600, color: 'var(--text-2)' }}>OAuth2 / Modern Auth</span> configuration is available here, but XOAUTH2 token exchange and IMAP/SMTP token authentication are not enabled in the current mail transport yet.
                    </>
                  ) : (
                    <>
                      <span style={{ fontWeight: 600, color: 'var(--text-2)' }}>MateMail Connected App</span> authorizes one exact MateMail mailbox without giving MateDesk its mailbox password. MateMail controls the approved scopes, login and 2FA.
                    </>
                  )}
                </div>
              </div>
            </div>

            {authMethod === 'basic' ? (
              /* ── BASIC AUTH — IMAP + SMTP grid ──────────────────────────── */
              <div className="grid grid-cols-2 gap-5">

                {/* IMAP */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
                  <SectionHeader icon={Mail} title="Incoming Mail (IMAP)" color="#60a5fa" />
                  <div className="p-5 flex flex-col gap-4">

                    <Toggle
                      label="Enable IMAP ingestion"
                      desc="Poll this mailbox every 60 seconds and convert emails to tickets"
                      checked={imap.imap_enabled}
                      onChange={v => setI('imap_enabled', v)}
                    />

                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2">
                        <Field label="IMAP Host">
                          <input type="text" value={imap.imap_host} onChange={e => setI('imap_host', e.target.value)}
                            placeholder="imap.gmail.com" className={inp} />
                        </Field>
                      </div>
                      <Field label="Port">
                        <input type="number" value={imap.imap_port} onChange={e => setI('imap_port', Number(e.target.value))} className={inp} />
                      </Field>
                    </div>

                    <Field label="Username / Email">
                      <input type="text" value={imap.imap_username} onChange={e => setI('imap_username', e.target.value)}
                        placeholder="support@yourcompany.com" className={inp} />
                    </Field>

                    <Field label={`Password${saved?.imap_password_set ? ' (set — leave blank to keep)' : ''}`}>
                      <PasswordField
                        value={imap.imap_password}
                        onChange={v => setI('imap_password', v)}
                        placeholder={saved?.imap_password_set ? '••••••••  (unchanged)' : 'Enter app password'}
                      />
                    </Field>

                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Mailbox Folder">
                        <input type="text" value={imap.imap_folder} onChange={e => setI('imap_folder', e.target.value)}
                          placeholder="INBOX" className={inp} />
                      </Field>
                      <Field label="Security">
                        <select value={imap.imap_use_ssl ? 'ssl' : 'none'}
                          onChange={e => setI('imap_use_ssl', e.target.value === 'ssl')}
                          className={inp + ' cursor-pointer'}>
                          <option value="ssl">SSL / TLS (port 993)</option>
                          <option value="none">Plain (port 143)</option>
                        </select>
                      </Field>
                    </div>

                    <TestConnection
                      onTest={handleTestImap}
                      pending={testImap.isPending}
                      disabled={!imap.imap_host}
                      result={imapResult}
                    />

                    {/* Status footer */}
                    <div className="flex items-center justify-between"
                      style={{ fontSize: 11, color: 'var(--text-3)', borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
                      <span>Last polled: <span style={{ color: 'var(--text-4)' }}>{lastPolled}</span></span>
                      <span>Emails processed: <span style={{ color: 'var(--text-4)' }}>{saved?.emails_processed ?? 0}</span></span>
                    </div>

                    {saved?.last_error && (
                      <div className="px-3 py-2"
                        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 11, color: 'var(--accent-danger-fg)' }}>
                        Last error: {saved.last_error}
                      </div>
                    )}
                  </div>
                </div>

                {/* SMTP */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
                  <SectionHeader icon={Send} title="Outgoing Mail (SMTP)" color="#818cf8" />
                  <div className="p-5 flex flex-col gap-4">

                    <Toggle
                      label="Enable SMTP replies"
                      desc="Send outbound emails when an agent posts a public reply to an email-sourced ticket"
                      checked={smtp.smtp_enabled}
                      onChange={v => setS('smtp_enabled', v)}
                    />

                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2">
                        <Field label="SMTP Host">
                          <input type="text" value={smtp.smtp_host} onChange={e => setS('smtp_host', e.target.value)}
                            placeholder="smtp.gmail.com" className={inp} />
                        </Field>
                      </div>
                      <Field label="Port">
                        <input type="number" value={smtp.smtp_port} onChange={e => setS('smtp_port', Number(e.target.value))} className={inp} />
                      </Field>
                    </div>

                    <Field label="Username">
                      <input type="text" value={smtp.smtp_username} onChange={e => setS('smtp_username', e.target.value)}
                        placeholder="support@yourcompany.com" className={inp} />
                    </Field>

                    <Field label={`Password${saved?.smtp_password_set ? ' (set — leave blank to keep)' : ''}`}>
                      <PasswordField
                        value={smtp.smtp_password}
                        onChange={v => setS('smtp_password', v)}
                        placeholder={saved?.smtp_password_set ? '••••••••  (unchanged)' : 'Enter app password'}
                      />
                    </Field>

                    <Field label="Security">
                      <select value={smtp.smtp_use_tls ? 'tls' : 'ssl'}
                        onChange={e => setS('smtp_use_tls', e.target.value === 'tls')}
                        className={inp + ' cursor-pointer'}>
                        <option value="tls">STARTTLS (port 587)</option>
                        <option value="ssl">SSL (port 465)</option>
                      </select>
                    </Field>

                    <TestConnection
                      onTest={handleTestSmtp}
                      pending={testSmtp.isPending}
                      disabled={!smtp.smtp_host}
                      result={smtpResult}
                    />

                    <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16 }}>
                      <p className="mb-3" style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                        From Address
                      </p>
                      <div className="flex flex-col gap-3">
                        <Field label="Display Name">
                          <input type="text" value={smtp.smtp_from_name} onChange={e => setS('smtp_from_name', e.target.value)}
                            placeholder="MateDesk Support" className={inp} />
                        </Field>
                        <Field label="From Email">
                          <input type="email" value={smtp.smtp_from_email} onChange={e => setS('smtp_from_email', e.target.value)}
                            placeholder="support@yourcompany.com" className={inp} />
                          <p style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 5, lineHeight: 1.5 }}>
                            The address your clients see. Usually the same as the username above — they
                            differ only when you send via a relay (SendGrid, SES) or a verified alias.
                          </p>
                        </Field>
                      </div>
                    </div>

                    <div className="px-3 py-3 flex flex-col gap-1"
                      style={{ background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.15)', fontSize: 11, color: 'var(--text-4)', lineHeight: 1.6 }}>
                      <span style={{ fontWeight: 600, color: 'var(--accent-info-fg)' }}>How outbound replies work</span>
                      <span>When an agent adds a Public Reply to a ticket that was created from an inbound email, MateDesk automatically sends the reply back to the original sender via this SMTP connection.</span>
                      <span style={{ marginTop: 4 }}>The subject line includes the ticket reference (e.g. <span style={{ fontFamily: 'monospace', color: 'var(--accent-indigo-fg)' }}>Re: [T15052026-0001] Your issue</span>) so that client replies are threaded back into the same ticket.</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* ── OAUTH2 ───────────────────────────────────────────────────── */
              <div className="grid grid-cols-2 gap-5">

                {/* OAuth2 credentials card */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
                  <SectionHeader icon={Key} title="OAuth2 Credentials" color="#a78bfa" />
                  <div className="p-5 flex flex-col gap-4">

                    <Field label="Mail Provider">
                      <select
                        value={oauth.oauth_provider}
                        onChange={e => setO('oauth_provider', e.target.value)}
                        className={inp + ' cursor-pointer'}
                      >
                        {OAUTH2_PROVIDERS.map(p => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Client ID (Application ID)">
                      <input
                        type="text"
                        value={oauth.oauth_client_id}
                        onChange={e => setO('oauth_client_id', e.target.value)}
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                        className={inp}
                        style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}
                      />
                    </Field>

                    <Field label={`Client Secret${saved?.oauth_client_secret_set ? ' (set — leave blank to keep)' : ''}`}>
                      <PasswordField
                        value={oauth.oauth_client_secret}
                        onChange={v => setO('oauth_client_secret', v)}
                        placeholder={saved?.oauth_client_secret_set ? '••••••••  (unchanged)' : 'Enter client secret'}
                      />
                    </Field>

                    {oauth.oauth_provider === 'm365' && (
                      <Field label="Tenant ID (Directory ID)">
                        <input
                          type="text"
                          value={oauth.oauth_tenant_id}
                          onChange={e => setO('oauth_tenant_id', e.target.value)}
                          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                          className={inp}
                          style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}
                        />
                        <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                          Found in Azure Portal → Microsoft Entra ID → Overview → Tenant ID
                        </p>
                      </Field>
                    )}

                    <div className="px-3 py-3 flex flex-col gap-1"
                      style={{ background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.2)', fontSize: 11, color: 'var(--text-4)', lineHeight: 1.7 }}>
                      <span style={{ fontWeight: 600, color: 'var(--accent-violet-fg)' }}>Redirect URI to register in your app</span>
                      <code style={{ fontFamily: 'monospace', color: 'var(--accent-violet-fg)', background: 'rgba(167,139,250,0.1)', padding: '2px 6px' }}>
                        {typeof window !== 'undefined' ? `${window.location.origin}/api/email-settings/oauth2/callback/` : 'https://your-tenant.matedesk.pro/api/email-settings/oauth2/callback/'}
                      </code>
                      <span style={{ marginTop: 4 }}>Add this URI to the allowed redirect URIs in your OAuth2 app registration.</span>
                    </div>
                  </div>
                </div>

                {/* OAuth2 mailbox config */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
                  <SectionHeader icon={Mail} title="Mailbox Configuration" color="#60a5fa" />
                  <div className="p-5 flex flex-col gap-4">

                    <Toggle
                      label="Enable IMAP ingestion"
                      desc="Poll this mailbox every 60 seconds and convert emails to tickets"
                      checked={imap.imap_enabled}
                      onChange={v => setI('imap_enabled', v)}
                    />

                    <Toggle
                      label="Enable SMTP replies"
                      desc="Send outbound emails via OAuth2-authenticated SMTP"
                      checked={smtp.smtp_enabled}
                      onChange={v => setS('smtp_enabled', v)}
                    />

                    <Field label="Mailbox Email Address">
                      <input
                        type="email"
                        value={imap.imap_username}
                        onChange={e => { setI('imap_username', e.target.value); setS('smtp_username', e.target.value); }}
                        placeholder="support@yourcompany.com"
                        className={inp}
                      />
                    </Field>

                    <Field label="Mailbox Folder">
                      <input type="text" value={imap.imap_folder} onChange={e => setI('imap_folder', e.target.value)}
                        placeholder="INBOX" className={inp} />
                    </Field>

                    <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16 }}>
                      <p className="mb-3" style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                        Reply From Address
                      </p>
                      <div className="flex flex-col gap-3">
                        <Field label="Display Name">
                          <input type="text" value={smtp.smtp_from_name} onChange={e => setS('smtp_from_name', e.target.value)}
                            placeholder="MateDesk Support" className={inp} />
                        </Field>
                        <Field label="From Email">
                          <input type="email" value={smtp.smtp_from_email} onChange={e => setS('smtp_from_email', e.target.value)}
                            placeholder="support@yourcompany.com" className={inp} />
                        </Field>
                      </div>
                    </div>

                    {/* Status footer */}
                    <div className="flex items-center justify-between"
                      style={{ fontSize: 11, color: 'var(--text-3)', borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
                      <span>Last polled: <span style={{ color: 'var(--text-4)' }}>{lastPolled}</span></span>
                      <span>Emails processed: <span style={{ color: 'var(--text-4)' }}>{saved?.emails_processed ?? 0}</span></span>
                    </div>

                    {saved?.last_error && (
                      <div className="px-3 py-2"
                        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 11, color: 'var(--accent-danger-fg)' }}>
                        Last error: {saved.last_error}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── Email routing info ────────────────────────────────────────── */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
              <SectionHeader icon={Mail} title="Email → Ticket Routing" color="#34d399" />
              <div className="p-5 grid grid-cols-3 gap-6" style={{ fontSize: 13 }}>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-1)', marginBottom: 6 }}>New email → New ticket</div>
                  <div style={{ color: 'var(--text-4)', lineHeight: 1.6 }}>
                    Every unseen email in the configured IMAP folder becomes a new Open ticket. The sender name becomes the requester. If the sender&apos;s email domain matches a Client Organization, the ticket is assigned to that org.
                  </div>
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-1)', marginBottom: 6 }}>Reply email → Reply on ticket</div>
                  <div style={{ color: 'var(--text-4)', lineHeight: 1.6 }}>
                    If an incoming email references a previous message (via <span style={{ fontFamily: 'monospace', color: 'var(--accent-indigo-fg)' }}>In-Reply-To</span> header) or contains <span style={{ fontFamily: 'monospace', color: 'var(--accent-indigo-fg)' }}>[T…]</span> in the subject, it is appended as a Public Reply to the existing ticket instead of creating a new one.
                  </div>
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-1)', marginBottom: 6 }}>Unknown sender → Walk-In org</div>
                  <div style={{ color: 'var(--text-4)', lineHeight: 1.6 }}>
                    When a sender&apos;s domain doesn&apos;t match any Client Organization, the ticket is filed under the <span style={{ fontFamily: 'monospace', color: 'var(--accent-indigo-fg)' }}>Walk-In</span> organization. You can re-assign it at any time from the ticket detail view.
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
