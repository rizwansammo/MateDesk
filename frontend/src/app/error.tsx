'use client';

import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { MateDeskMark } from '@/components/MateDeskMark';

const IS_SINGLE_TENANT = (process.env.NEXT_PUBLIC_DEPLOYMENT_MODE ?? 'multi_tenant') === 'single_tenant';
const PRODUCT_NAME = process.env.NEXT_PUBLIC_PRODUCT_NAME || (IS_SINGLE_TENANT ? 'NetaMate HelpDesk' : 'MateDesk');
const PRODUCT_WORDMARK = process.env.NEXT_PUBLIC_PRODUCT_WORDMARK || (IS_SINGLE_TENANT ? 'NetaMate' : 'MateDesk');

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--bg-base)', color: 'var(--text-1)' }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-panel)',
        }}
      >
        <div style={{ height: 3, background: 'linear-gradient(90deg, var(--accent-info-fg), #2563eb)' }} />

        <div style={{ padding: 30 }}>
          {IS_SINGLE_TENANT && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 24, color: 'var(--brand-monochrome)' }}>
              <MateDeskMark size={28} />
              <div>
                <div style={{ fontFamily: 'var(--font-hemi), sans-serif', fontSize: 17, fontWeight: 700, lineHeight: 1 }}>
                  {PRODUCT_WORDMARK}
                </div>
                <div style={{ marginTop: 4, fontSize: 10, color: 'var(--accent-info-fg)', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                  HelpDesk
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div
              style={{
                width: 44,
                height: 44,
                flexShrink: 0,
                display: 'grid',
                placeItems: 'center',
                background: 'var(--accent-danger-bg)',
                border: '1px solid rgba(239,68,68,0.24)',
              }}
            >
              <AlertTriangle size={20} style={{ color: 'var(--accent-danger-fg)' }} />
            </div>

            <div>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 750, color: 'var(--text-0)' }}>
                Something went wrong
              </h1>
              <p style={{ margin: '7px 0 0', fontSize: 12, lineHeight: 1.6, color: 'var(--text-3)' }}>
                The workspace could not complete this request. You can retry without signing out.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={reset}
            style={{
              width: '100%',
              height: 40,
              marginTop: 24,
              background: '#2563eb',
              border: '1px solid #2563eb',
              color: '#fff',
              fontSize: 12,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <RefreshCcw size={14} />
            Try again
          </button>

          {IS_SINGLE_TENANT && (
            <div style={{ marginTop: 16, textAlign: 'center', fontSize: 10, color: 'var(--text-4)' }}>
              {PRODUCT_NAME}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
