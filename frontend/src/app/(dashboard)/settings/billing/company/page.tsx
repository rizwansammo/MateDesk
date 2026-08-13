'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Building2, Save, Loader2, Check } from 'lucide-react';
import { useBillingProfile, useUpdateBillingProfile } from '@/hooks/useBilling';

export default function BillingCompanyPage() {
  const router = useRouter();
  const { data: profile, isLoading } = useBillingProfile();
  const update = useUpdateBillingProfile();

  const [form, setForm] = useState({
    company_name:  '',
    address:       '',
    email:         '',
    phone:         '',
    payment_terms: '',
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        company_name:  profile.company_name  ?? '',
        address:       profile.address       ?? '',
        email:         profile.email         ?? '',
        phone:         profile.phone         ?? '',
        payment_terms: profile.payment_terms ?? '',
      });
    }
  }, [profile]);

  function field(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));
  }

  function handleSave() {
    update.mutate(form, {
      onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000); },
    });
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 10px', fontSize: 13,
    background: 'var(--bg-base)', border: '1px solid var(--border-md)',
    color: 'var(--text-1)', outline: 'none',
  };
  const fi = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { e.currentTarget.style.borderColor = '#2563eb'; };
  const fo = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { e.currentTarget.style.borderColor = 'var(--border-md)'; };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Header */}
      <div style={{ flexShrink: 0, padding: '10px 24px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={() => router.push('/settings')}
          style={{ color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; }}
        >
          <ArrowLeft size={14} />
        </button>
        <Building2 size={14} style={{ color: 'var(--accent-warn-fg)' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Company Info</span>
        <span style={{ fontSize: 12, color: 'var(--text-4)', marginLeft: 2 }}>— shown on all invoices</span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 24px' }}>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent-info-fg)' }} />
          </div>
        ) : (
          <div style={{ maxWidth: 560, margin: '0 auto' }}>

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>

              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>Company Name</label>
                <input value={form.company_name} onChange={field('company_name')} placeholder="Your company or MSP name" style={inp} onFocus={fi} onBlur={fo} />
              </div>

              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>Address</label>
                <textarea value={form.address} onChange={field('address')} rows={3} placeholder="Street, City, State, ZIP / Postcode, Country" style={{ ...inp, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} onFocus={fi} onBlur={fo} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ padding: '16px 20px', borderRight: '1px solid var(--border-subtle)' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>Billing Email</label>
                  <input type="email" value={form.email} onChange={field('email')} placeholder="billing@yourcompany.com" style={inp} onFocus={fi} onBlur={fo} />
                </div>
                <div style={{ padding: '16px 20px' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>Phone</label>
                  <input type="tel" value={form.phone} onChange={field('phone')} placeholder="+1 (555) 000-0000" style={inp} onFocus={fi} onBlur={fo} />
                </div>
              </div>

              <div style={{ padding: '16px 20px' }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>Payment Terms</label>
                <textarea value={form.payment_terms} onChange={field('payment_terms')} rows={2} placeholder="e.g. Payment due within 30 days of invoice date." style={{ ...inp, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} onFocus={fi} onBlur={fo} />
                <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 5 }}>Printed at the bottom of every invoice PDF.</p>
              </div>
            </div>

            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                className="btn-primary gap-1.5"
                style={{ height: 34, fontSize: 12, paddingLeft: 18, paddingRight: 18 }}
                onClick={handleSave}
                disabled={update.isPending}
              >
                {update.isPending ? <><Loader2 size={12} className="animate-spin" /> Saving…</>
                  : saved ? <><Check size={12} /> Saved</>
                  : <><Save size={12} /> Save Changes</>}
              </button>
              {update.isError && <span style={{ fontSize: 12, color: 'var(--accent-danger-fg)' }}>Failed to save.</span>}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
