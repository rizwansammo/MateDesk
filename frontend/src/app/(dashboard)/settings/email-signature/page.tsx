'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Mail, Save, Eye } from 'lucide-react';
import { useTenant } from '@/hooks/useTenant';
import { useAuthStore } from '@/store/useAuthStore';

const VARIABLES = [
  '{{agent_name}}', '{{company_name}}', '{{support_email}}', '{{phone}}', '{{portal_url}}',
];

const DEFAULT_SIG = `Best regards,
{{agent_name}}
{{company_name}} | Support Team

Email: {{support_email}}
Phone: {{phone}}
Portal: {{portal_url}}`;

export default function EmailSignaturePage() {
  const router = useRouter();
  const { data: tenant } = useTenant();
  const user = useAuthStore(s => s.user);
  const [sig,     setSig]     = useState(DEFAULT_SIG);
  const [preview, setPreview] = useState(false);

  // Preview against this tenant's own details — never placeholder company data,
  // which would show one customer another company's name.
  const rendered = sig
    .replace(/{{agent_name}}/g,    user?.full_name          || 'Your name')
    .replace(/{{company_name}}/g,  tenant?.name             || 'Your company')
    .replace(/{{support_email}}/g, tenant?.support_email    || 'Not set — add it in Company Profile')
    .replace(/{{phone}}/g,         tenant?.phone            || 'Not set — add it in Company Profile')
    .replace(/{{portal_url}}/g,
      tenant?.slug ? `https://${tenant.slug}.matedesk.pro` : 'Your portal URL');

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
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>Email Signature</span>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: '28px 24px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>

          <div className="flex items-center gap-3 mb-6">
            <div style={{ width: 40, height: 40, background: 'rgba(37,99,235,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Mail size={18} style={{ color: 'var(--accent-info-fg)' }} />
            </div>
            <div>
              <h1 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Email Signature</h1>
              <p style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>Default signature appended to outgoing ticket replies.</p>
            </div>
          </div>

          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>

            {/* Tabs */}
            <div className="flex" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              {[
                { id: false, label: 'Edit' },
                { id: true,  label: 'Preview' },
              ].map(tab => (
                <button
                  key={String(tab.id)}
                  onClick={() => setPreview(tab.id)}
                  style={{
                    padding: '9px 18px', fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer',
                    background: preview === tab.id ? 'var(--bg-elevated)' : 'transparent',
                    color:      preview === tab.id ? 'var(--text-1)'  : 'var(--text-4)',
                    borderBottom: preview === tab.id ? '2px solid #2563eb' : '2px solid transparent',
                  }}
                >
                  {tab.id ? <Eye size={12} style={{ display: 'inline', marginRight: 5 }} /> : null}
                  {tab.label}
                </button>
              ))}
            </div>

            <div style={{ padding: '20px 24px' }}>
              {!preview ? (
                <>
                  {/* Variable chips */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {VARIABLES.map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setSig(s => s + v)}
                        style={{
                          fontSize: 11, padding: '2px 8px', background: 'rgba(37,99,235,0.12)',
                          border: '1px solid rgba(37,99,235,0.25)', color: 'var(--accent-info-fg)', cursor: 'pointer',
                        }}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={sig}
                    onChange={e => setSig(e.target.value)}
                    rows={8}
                    style={{
                      width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-md)',
                      color: 'var(--text-1)', fontSize: 13, fontFamily: 'monospace',
                      padding: '10px 12px', resize: 'vertical', outline: 'none',
                      lineHeight: 1.6,
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
                  />
                  <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>
                    Click a variable above to insert it. Variables are replaced with live values when sending.
                  </p>
                </>
              ) : (
                <div
                  style={{
                    background: 'var(--bg-base)', border: '1px solid var(--border-md)',
                    padding: '16px 20px', fontSize: 13, color: 'var(--text-2)',
                    lineHeight: 1.7, whiteSpace: 'pre-wrap', minHeight: 160,
                  }}
                >
                  {rendered}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <button
                className="flex items-center gap-2 px-5 py-2 font-semibold text-white"
                style={{ background: '#2563eb', fontSize: 12 }}
              >
                <Save size={12} /> Save Signature
              </button>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Backend integration coming soon</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
