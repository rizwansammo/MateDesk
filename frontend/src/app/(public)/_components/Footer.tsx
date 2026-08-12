'use client';

import Link from 'next/link';
import { BrandLogo } from '@/components/BrandLogo';

const COLS = [
  { title: 'Product',   links: ['Overview', 'How it works', 'Pricing', 'Integrations', 'Changelog']          },
  { title: 'Company',   links: ['About NetaMate', 'Customers', 'Careers', 'Press', 'Contact']                 },
  { title: 'Resources', links: ['Documentation', 'API reference', 'MSP playbook', 'Status', 'Security']       },
  { title: 'Legal',     links: ['Terms of service', 'Privacy policy', 'DPA', 'SOC 2 report', 'Sub-processors'] },
];

export default function Footer() {
  return (
    <footer style={{ background: '#0B1220', borderTop: '1px solid #1C222C' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 40, padding: '56px 0 48px' }}>
          {/* Brand */}
          <div>
            <Link href="/" style={{ textDecoration: 'none', color: '#ECEEF2', display: 'inline-block', marginBottom: 16 }}>
              <BrandLogo size="sm" />
            </Link>
            <p style={{ fontSize: 13, lineHeight: 1.7, color: '#485168', maxWidth: 260 }}>
              The multi-tenant helpdesk built for managed service providers. Made by NetaMate Solutions.
            </p>
          </div>
          {/* Link columns */}
          {COLS.map(col => (
            <div key={col.title}>
              <h5 style={{ fontSize: 12, fontWeight: 700, color: '#ECEEF2', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 16 }}>
                {col.title}
              </h5>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {col.links.map(l => (
                  <li key={l}>
                    <a href="#" style={{ fontSize: 13, color: '#485168', textDecoration: 'none', transition: 'color 120ms' }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#9AA2B1'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = '#485168'; }}
                    >
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px solid #1C222C', padding: '20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, fontSize: 12, color: '#485168' }}>
          <span>© 2026 NetaMate Solutions. All rights reserved.</span>
          <span>SOC 2 Type II · ISO 27001 · GDPR compliant</span>
        </div>
      </div>
    </footer>
  );
}
