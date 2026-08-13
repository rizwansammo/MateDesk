'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, Lock } from 'lucide-react';

export default function BrandingPage() {
  const router = useRouter();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="secondary-bar">
        <button
          onClick={() => router.push('/settings')}
          className="flex items-center gap-1.5 transition-colors"
          style={{ fontSize: 12, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-1)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; }}
        >
          <ArrowLeft size={13} /> Settings
        </button>
        <span style={{ color: 'var(--border-md)' }}>|</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>Branding</span>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: '28px 24px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>

          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-md)',
              padding: '32px 28px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              gap: 16,
            }}
          >
            <div style={{
              width: 48, height: 48,
              background: 'rgba(37,99,235,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Lock size={22} style={{ color: 'var(--accent-info-fg)' }} />
            </div>

            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 6 }}>
                Branding is managed by your Platform Admin
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-4)', lineHeight: 1.6, maxWidth: 400 }}>
                Logo sizes, custom logos, and brand colors for MateDesk
                are configured per-tenant by the NetaMate platform team.
                If you need branding changes, contact your platform administrator.
              </p>
            </div>

            <div style={{
              width: '100%',
              background: 'rgba(37,99,235,0.06)',
              border: '1px solid rgba(37,99,235,0.2)',
              padding: '12px 16px',
              fontSize: 12,
              color: 'var(--text-4)',
              textAlign: 'left',
              lineHeight: 1.6,
            }}>
              <strong style={{ color: 'var(--text-3)' }}>Custom branding</strong> (logo upload, custom
              colors, white-label) is available on the Enterprise plan.
              Speak to NetaMate Solutions to upgrade.
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
