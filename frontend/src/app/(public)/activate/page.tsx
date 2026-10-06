'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Eye, EyeOff, Loader2, LockKeyhole } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { TransitionLink } from '@/components/TransitionLink';
import { ApiError, apiFetch } from '@/lib/api';

interface ActivationPreview {
  company_name: string;
  owner_name: string;
  workspace: string;
}

interface ActivationResult {
  status: 'activated';
  workspace_url: string;
  workspace: string;
}

export default function PrivateBetaActivatePage() {
  const [uid, setUid] = useState('');
  const [token, setToken] = useState('');
  const [preview, setPreview] = useState<ActivationPreview | null>(null);
  const [loadingLink, setLoadingLink] = useState(true);
  const [linkError, setLinkError] = useState('');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [result, setResult] = useState<ActivationResult | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextUid = params.get('uid') ?? '';
    const nextToken = params.get('token') ?? '';
    setUid(nextUid);
    setToken(nextToken);

    if (!nextUid || !nextToken) {
      setLinkError('This activation link is incomplete.');
      setLoadingLink(false);
      return;
    }

    const verifyPath =
      '/api/beta/activate/?uid=' +
      encodeURIComponent(nextUid) +
      '&token=' +
      encodeURIComponent(nextToken);

    apiFetch<ActivationPreview>(verifyPath)
      .then(setPreview)
      .catch((err: unknown) => {
        setLinkError(
          err instanceof ApiError
            ? err.message
            : 'This activation link is invalid or has expired.',
        );
      })
      .finally(() => setLoadingLink(false));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');

    if (password.length < 8) {
      setFormError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setFormError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const data = await apiFetch<ActivationResult>('/api/beta/activate/', {
        method: 'POST',
        body: JSON.stringify({
          uid,
          token,
          password,
          password_confirm: confirm,
        }),
      });
      setResult(data);
    } catch (err: unknown) {
      setFormError(
        err instanceof ApiError
          ? err.message
          : 'Account activation failed. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  const input: React.CSSProperties = {
    width: '100%',
    height: 46,
    border: '1px solid #30363d',
    background: '#0d1117',
    color: '#f0f6fc',
    padding: '0 42px 0 13px',
    fontSize: 14,
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0d1117',
        color: '#e6edf3',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        style={{
          height: 68,
          display: 'flex',
          alignItems: 'center',
          padding: '0 28px',
          borderBottom: '1px solid #21262d',
          flexShrink: 0,
        }}
      >
        <TransitionLink href="/" style={{ color: '#e6edf3', textDecoration: 'none' }}>
          <BrandLogo size="md" />
        </TransitionLink>
      </header>

      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '36px 20px',
        }}
      >
        <div style={{ width: '100%', maxWidth: 520 }}>
          {loadingLink ? (
            <div style={{ textAlign: 'center', padding: 48 }}>
              <Loader2 size={26} className="animate-spin" style={{ color: '#58a6ff' }} />
              <div style={{ marginTop: 14, fontSize: 13, color: '#8b949e' }}>
                Verifying activation link…
              </div>
            </div>
          ) : linkError ? (
            <div
              style={{
                background: '#161b22',
                border: '1px solid #30363d',
                padding: 30,
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: 54,
                  height: 54,
                  margin: '0 auto 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(248,81,73,.08)',
                  border: '1px solid rgba(248,81,73,.28)',
                  color: '#f85149',
                }}
              >
                <LockKeyhole size={25} />
              </div>
              <h1
                style={{
                  fontFamily: 'var(--font-hemi), sans-serif',
                  textTransform: 'uppercase',
                  fontSize: 25,
                  margin: '0 0 10px',
                }}
              >
                Activation link unavailable
              </h1>
              <p style={{ color: '#8b949e', fontSize: 14, lineHeight: 1.65, margin: '0 0 22px' }}>
                {linkError}
              </p>
              <p style={{ color: '#6e7681', fontSize: 12, lineHeight: 1.6, margin: 0 }}>
                Ask the MateDesk team to resend your activation email from your Private Beta application.
              </p>
            </div>
          ) : result ? (
            <div
              style={{
                background: '#161b22',
                border: '1px solid #30363d',
                padding: 32,
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: 58,
                  height: 58,
                  margin: '0 auto 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(63,185,80,.08)',
                  border: '1px solid rgba(63,185,80,.3)',
                  color: '#3fb950',
                }}
              >
                <CheckCircle2 size={28} />
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#58a6ff',
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                  marginBottom: 9,
                }}
              >
                Private Beta Activated
              </div>
              <h1
                style={{
                  fontFamily: 'var(--font-hemi), sans-serif',
                  textTransform: 'uppercase',
                  fontSize: 28,
                  margin: '0 0 12px',
                }}
              >
                Your workspace is ready
              </h1>
              <p style={{ color: '#8b949e', fontSize: 14, lineHeight: 1.65, margin: '0 0 20px' }}>
                Your password has been set and your MateDesk owner account is now active.
              </p>
              <div
                style={{
                  padding: '12px 14px',
                  border: '1px solid #30363d',
                  background: '#0d1117',
                  color: '#f0f6fc',
                  fontFamily: 'var(--font-mono), monospace',
                  fontSize: 13,
                  marginBottom: 22,
                }}
              >
                {result.workspace}
              </div>
              <a
                href={result.workspace_url}
                style={{
                  height: 46,
                  padding: '0 20px',
                  background: '#1f4ed8',
                  color: '#fff',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  fontSize: 14,
                  fontWeight: 650,
                  textDecoration: 'none',
                }}
              >
                Sign in to your workspace <ArrowRight size={16} />
              </a>
            </div>
          ) : preview ? (
            <div style={{ background: '#161b22', border: '1px solid #30363d' }}>
              <div style={{ padding: '24px 28px', borderBottom: '1px solid #21262d' }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#58a6ff',
                    letterSpacing: '.08em',
                    textTransform: 'uppercase',
                    marginBottom: 9,
                  }}
                >
                  MateDesk Private Beta
                </div>
                <h1
                  style={{
                    fontFamily: 'var(--font-hemi), sans-serif',
                    textTransform: 'uppercase',
                    fontSize: 27,
                    margin: '0 0 9px',
                  }}
                >
                  Activate your workspace
                </h1>
                <p style={{ color: '#8b949e', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                  Hi {preview.owner_name}. Set your password to activate the owner account for{' '}
                  <strong style={{ color: '#e6edf3' }}>{preview.company_name}</strong>.
                </p>
              </div>

              <div style={{ padding: 28 }}>
                <div
                  style={{
                    background: '#0d1117',
                    border: '1px solid #30363d',
                    padding: '12px 14px',
                    marginBottom: 20,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      color: '#6e7681',
                      textTransform: 'uppercase',
                      letterSpacing: '.07em',
                      marginBottom: 4,
                    }}
                  >
                    Workspace
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 13 }}>
                    {preview.workspace}
                  </div>
                </div>

                {formError && (
                  <div
                    style={{
                      padding: '10px 12px',
                      marginBottom: 16,
                      background: 'rgba(248,81,73,.08)',
                      border: '1px solid rgba(248,81,73,.3)',
                      color: '#ff7b72',
                      fontSize: 12,
                      lineHeight: 1.55,
                    }}
                  >
                    {formError}
                  </div>
                )}

                <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#c9d1d9',
                      }}
                    >
                      Create password
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        minLength={8}
                        required
                        autoComplete="new-password"
                        style={input}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        style={{
                          position: 'absolute',
                          right: 0,
                          top: 0,
                          width: 42,
                          height: 46,
                          border: 0,
                          background: 'transparent',
                          color: '#8b949e',
                          cursor: 'pointer',
                        }}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <div style={{ marginTop: 5, fontSize: 11, color: '#6e7681' }}>
                      Minimum 8 characters.
                    </div>
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#c9d1d9',
                      }}
                    >
                      Confirm password
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      minLength={8}
                      required
                      autoComplete="new-password"
                      style={{ ...input, paddingRight: 13 }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    style={{
                      height: 48,
                      marginTop: 2,
                      border: 0,
                      background: '#1f4ed8',
                      color: '#fff',
                      fontSize: 14,
                      fontWeight: 650,
                      fontFamily: 'inherit',
                      cursor: submitting ? 'not-allowed' : 'pointer',
                      opacity: submitting ? 0.7 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                    }}
                  >
                    {submitting ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Activating…
                      </>
                    ) : (
                      <>
                        Activate Workspace <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </form>

                <p style={{ color: '#6e7681', fontSize: 11, lineHeight: 1.6, margin: '18px 0 0' }}>
                  This is a one-time activation link. After your password is set, the link can no longer be used.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
