'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, ImagePlus, Lock, RotateCcw, Save, Upload } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import { BrandingConfig, useLogoSizeStore } from '@/store/useLogoSizeStore';
import { NetaMateMark } from '@/components/NetaMateMark';
import { MateDeskMark } from '@/components/MateDeskMark';

type BrandingState = BrandingConfig & {
  md_logo_variant?: string;
  md_logo_theme_aware?: boolean;
};

const isSingleTenant = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE === 'single_tenant';

export default function BrandingPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const initFromBranding = useLogoSizeStore((s) => s.initFromBranding);
  const fileRef = useRef<HTMLInputElement>(null);

  const [wordmark, setWordmark] = useState('NetaMate');
  const [iconSize, setIconSize] = useState(24);
  const [fontSize, setFontSize] = useState(19);
  const [lineHeight, setLineHeight] = useState(0);
  const [themeAware, setThemeAware] = useState(true);
  const [logoVariant, setLogoVariant] = useState('matedesk');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [isLoading, setIsLoading] = useState(isSingleTenant);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const isOwner = user?.role === 'msp_owner';
  const previewUrl = useMemo(
    () => logoFile ? URL.createObjectURL(logoFile) : logoUrl,
    [logoFile, logoUrl],
  );

  useEffect(() => {
    return () => {
      if (logoFile && previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    };
  }, [logoFile, previewUrl]);

  useEffect(() => {
    if (!isSingleTenant) return;
    apiFetch<BrandingState>('/api/tenant/branding/')
      .then((data) => {
        setWordmark(data.md_custom_text || 'NetaMate');
        setIconSize(data.md_icon_size || 24);
        setFontSize(data.md_font_size || 19);
        setLineHeight(data.md_line_height || 0);
        setThemeAware(data.md_logo_theme_aware ?? true);
        setLogoVariant(data.md_logo_variant || '');
        setLogoUrl(data.md_logo_url || '');
        initFromBranding(data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load branding.'))
      .finally(() => setIsLoading(false));
  }, [initFromBranding]);

  function chooseOfficialBranding() {
    setWordmark('NetaMate');
    setLogoVariant('matedesk');
    setLogoUrl('');
    setLogoFile(null);
    setRemoveLogo(true);
    setThemeAware(false);
  }

  async function save() {
    if (!isOwner) return;
    setIsSaving(true);
    setSaved(false);
    setError('');

    const body = new FormData();
    body.set('md_custom_text', wordmark.trim() || 'NetaMate');
    body.set('md_icon_size', String(iconSize));
    body.set('md_font_size', String(fontSize));
    body.set('md_line_height', String(lineHeight));
    body.set('md_logo_theme_aware', String(themeAware));

    if (logoVariant === 'matedesk' || logoVariant === 'netamate') body.set('md_logo_variant', logoVariant);
    if (logoFile) body.set('logo', logoFile);
    if (removeLogo && !logoFile && logoVariant !== 'netamate' && logoVariant !== 'matedesk') body.set('remove_logo', 'true');

    try {
      const updated = await apiFetch<BrandingState>('/api/tenant/branding/', {
        method: 'PATCH',
        body,
      });
      setWordmark(updated.md_custom_text || 'NetaMate');
      setIconSize(updated.md_icon_size || 24);
      setFontSize(updated.md_font_size || 19);
      setLineHeight(updated.md_line_height || 0);
      setThemeAware(updated.md_logo_theme_aware ?? false);
      setLogoVariant(updated.md_logo_variant || '');
      setLogoUrl(updated.md_logo_url || '');
      setLogoFile(null);
      setRemoveLogo(false);
      initFromBranding(updated);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save branding.');
    } finally {
      setIsSaving(false);
    }
  }

  if (!isSingleTenant) {
    return (
      <LockedBranding
        onBack={() => router.push('/settings')}
        title="Branding is managed by your Platform Admin"
        copy="Logo sizes, custom logos, wordmarks, and tenant branding are controlled by the MateDesk platform team."
      />
    );
  }

  if (!isOwner) {
    return (
      <LockedBranding
        onBack={() => router.push('/settings')}
        title="Workspace owner access required"
        copy="NetaMate HelpDesk branding can only be changed by the workspace owner. Agents and managers keep read-only access to the branded workspace."
      />
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="secondary-bar">
        <button
          onClick={() => router.push('/settings')}
          className="flex items-center gap-1.5 transition-colors"
          style={{ fontSize: 12, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <ArrowLeft size={13} /> Settings
        </button>
        <span style={{ color: 'var(--border-md)' }}>|</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>Branding</span>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: '24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gap: 18 }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 750, color: 'var(--text-0)', marginBottom: 5 }}>
              NetaMate HelpDesk branding
            </h1>
            <p style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text-3)', maxWidth: 640 }}>
              The HelpDesk accent color stays native to the product. Customize the original MateDesk mark,
              wordmark, and sizing used in the workspace. Light mode uses dark branding; dark mode
              uses light branding when theme-aware logo rendering is enabled.
            </p>
          </div>

          {error && (
            <div style={{ padding: '10px 12px', border: '1px solid rgba(239,68,68,0.28)', background: 'var(--accent-danger-bg)', color: 'var(--accent-danger-fg)', fontSize: 12 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(280px,360px)', gap: 18, alignItems: 'start' }}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>
                Brand identity
              </div>

              <div style={{ padding: 16, display: 'grid', gap: 18 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Wordmark
                  </label>
                  <input
                    value={wordmark}
                    maxLength={80}
                    onChange={(e) => setWordmark(e.target.value)}
                    disabled={isLoading}
                    style={{
                      width: '100%', height: 40, padding: '0 11px',
                      background: 'var(--bg-input)', border: '1px solid var(--border-md)',
                      color: 'var(--text-1)', outline: 'none', fontSize: 13,
                    }}
                  />
                  <p style={{ marginTop: 5, fontSize: 10, color: 'var(--text-4)' }}>
                    For this deployment the recommended wordmark is “NetaMate”.
                  </p>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Logo
                  </label>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={chooseOfficialBranding}
                      style={{
                        height: 36, padding: '0 12px',
                        border: logoVariant === 'matedesk' ? '1px solid #2563eb' : '1px solid var(--border-md)',
                        background: logoVariant === 'matedesk' ? 'var(--accent-info-bg)' : 'var(--bg-input)',
                        color: logoVariant === 'matedesk' ? 'var(--accent-info-fg)' : 'var(--text-2)',
                        fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 7,
                      }}
                    >
                      <MateDeskMark size={18} />
                      Original MateDesk logo
                    </button>

                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      style={{
                        height: 36, padding: '0 12px',
                        border: '1px solid var(--border-md)',
                        background: 'var(--bg-input)', color: 'var(--text-2)',
                        fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 7,
                      }}
                    >
                      <Upload size={13} /> Upload custom
                    </button>

                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        if (!file) return;
                        setLogoFile(file);
                        setLogoVariant('');
                        setRemoveLogo(false);
                      }}
                    />
                  </div>

                  {logoFile && (
                    <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <ImagePlus size={12} /> {logoFile.name}
                    </div>
                  )}

                  <label style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, color: 'var(--text-2)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={themeAware}
                      onChange={(e) => setThemeAware(e.target.checked)}
                    />
                    Adapt monochrome logo automatically for light and dark mode
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10 }}>
                  <NumberField label="Logo size" value={iconSize} min={18} max={64} onChange={setIconSize} />
                  <NumberField label="Wordmark size" value={fontSize} min={12} max={48} onChange={setFontSize} />
                  <NumberField label="Line height" value={lineHeight} min={0} max={72} onChange={setLineHeight} />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 4 }}>
                  <button
                    type="button"
                    onClick={chooseOfficialBranding}
                    style={{
                      height: 36, padding: '0 12px',
                      background: 'transparent', border: '1px solid var(--border-md)',
                      color: 'var(--text-2)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 7,
                    }}
                  >
                    <RotateCcw size={13} /> Restore MateDesk icon
                  </button>

                  <button
                    type="button"
                    onClick={save}
                    disabled={isSaving || isLoading}
                    style={{
                      height: 38, padding: '0 15px',
                      background: '#2563eb', border: '1px solid #2563eb',
                      color: '#fff', fontSize: 11, fontWeight: 800, cursor: isSaving ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', gap: 7,
                      opacity: isSaving || isLoading ? 0.65 : 1,
                    }}
                  >
                    {saved ? <><Check size={13} /> Saved</> : <><Save size={13} /> {isSaving ? 'Saving…' : 'Save branding'}</>}
                  </button>
                </div>
              </div>
            </div>

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>
                Live preview
              </div>

              <div style={{ padding: 16, display: 'grid', gap: 10 }}>
                <BrandPreview
                  label="Dark mode"
                  dark
                  wordmark={wordmark || 'NetaMate'}
                  iconSize={iconSize}
                  fontSize={fontSize}
                  logoVariant={logoVariant}
                  logoUrl={previewUrl}
                  themeAware={themeAware}
                />
                <BrandPreview
                  label="Light mode"
                  wordmark={wordmark || 'NetaMate'}
                  iconSize={iconSize}
                  fontSize={fontSize}
                  logoVariant={logoVariant}
                  logoUrl={previewUrl}
                  themeAware={themeAware}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NumberField({
  label, value, min, max, onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          width: '100%', height: 36, padding: '0 9px',
          background: 'var(--bg-input)', border: '1px solid var(--border-md)',
          color: 'var(--text-1)', outline: 'none', fontSize: 12,
        }}
      />
    </div>
  );
}

function BrandPreview({
  label,
  dark = false,
  wordmark,
  iconSize,
  fontSize,
  logoVariant,
  logoUrl,
  themeAware,
}: {
  label: string;
  dark?: boolean;
  wordmark: string;
  iconSize: number;
  fontSize: number;
  logoVariant: string;
  logoUrl: string;
  themeAware: boolean;
}) {
  const foreground = dark ? '#ffffff' : '#000000';
  const muted = dark ? '#94a3b8' : '#64748b';

  return (
    <div style={{ border: dark ? '1px solid #2a2f3d' : '1px solid #dbe3ee', background: dark ? '#151821' : '#fff', padding: 14 }}>
      <div style={{ fontSize: 9, color: muted, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: foreground, minHeight: Math.max(iconSize, fontSize) }}>
        <div style={{ width: iconSize, height: iconSize, display: 'grid', placeItems: 'center', color: foreground }}>
          {logoVariant === 'matedesk' ? (
            <MateDeskMark size={iconSize} />
          ) : logoVariant === 'netamate' ? (
            <NetaMateMark size={iconSize} />
          ) : logoUrl && themeAware ? (
            <span
              style={{
                width: iconSize,
                height: iconSize,
                display: 'block',
                background: foreground,
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
            <img src={logoUrl} alt="" width={iconSize} height={iconSize} style={{ objectFit: 'contain' }} />
          ) : (
            <MateDeskMark size={iconSize} />
          )}
        </div>
        <span style={{ fontFamily: 'var(--font-hemi), sans-serif', fontWeight: 700, fontSize, lineHeight: 1, letterSpacing: '0.035em' }}>
          {wordmark}
        </span>
      </div>
    </div>
  );
}

function LockedBranding({
  onBack,
  title,
  copy,
}: {
  onBack: () => void;
  title: string;
  copy: string;
}) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="secondary-bar">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 transition-colors"
          style={{ fontSize: 12, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <ArrowLeft size={13} /> Settings
        </button>
        <span style={{ color: 'var(--border-md)' }}>|</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>Branding</span>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: '28px 24px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', padding: '32px 28px', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, margin: '0 auto 16px', background: 'var(--accent-info-bg)', display: 'grid', placeItems: 'center' }}>
              <Lock size={22} style={{ color: 'var(--accent-info-fg)' }} />
            </div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 6 }}>{title}</h2>
            <p style={{ fontSize: 13, color: 'var(--text-4)', lineHeight: 1.6 }}>{copy}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
