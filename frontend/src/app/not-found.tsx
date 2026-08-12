'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, Home, HelpCircle } from 'lucide-react';

export default function NotFound() {
  // On a tenant subdomain → go to /login. On plain domain → go to / (marketing).
  const [homeHref, setHomeHref] = useState('/');

  useEffect(() => {
    const parts = window.location.hostname.split('.');
    if (parts.length >= 2) setHomeHref('/login');
  }, []);

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: '#060810' }}
    >
      <div
        className="w-full max-w-lg"
        style={{ background: '#0f1320', border: '1px solid var(--border-panel)' }}
      >
        {/* Header accent */}
        <div style={{ height: 3, background: 'linear-gradient(90deg, #ef4444, #f97316)' }} />

        <div className="p-8">
          {/* 404 number */}
          <div className="flex items-start gap-4 mb-6">
            <div
              className="flex items-center justify-center flex-shrink-0"
              style={{ width: 56, height: 56, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              <HelpCircle size={26} style={{ color: '#ef4444' }} />
            </div>
            <div>
              <div className="font-bold" style={{ fontSize: 64, color: '#ef4444', lineHeight: 1, marginBottom: 6 }}>
                404
              </div>
              <h1 className="font-semibold leading-snug" style={{ fontSize: 17, color: 'var(--text-1)' }}>
                Unfortunately the page<br />you requested does not exist.
              </h1>
            </div>
          </div>

          {/* Reasons */}
          <ul
            className="space-y-2.5 mb-7 pl-1"
            style={{ fontSize: 13, color: 'var(--text-3)' }}
          >
            {[
              'You made a mistake when typing the page address (URL).',
              'Clicked on a broken or incorrect link.',
              'The requested page has been deleted.',
            ].map(reason => (
              <li key={reason} className="flex items-start gap-2.5">
                <span style={{ color: '#ef4444', marginTop: 2, flexShrink: 0 }}>●</span>
                {reason}
              </li>
            ))}
          </ul>

          {/* Actions */}
          <div
            className="flex items-center gap-3 pt-6"
            style={{ borderTop: '1px solid var(--border-panel)' }}
          >
            <button
              onClick={() => window.history.back()}
              className="flex items-center gap-2 px-4 py-2.5 transition-all"
              style={{
                fontSize: 13, color: 'var(--text-3)',
                border: '1px solid var(--border-panel)', background: 'transparent',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--bg-surface)';
                e.currentTarget.style.color = 'var(--text-1)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-3)';
              }}
            >
              <ArrowLeft size={13} />
              Go back and try again
            </button>
            <Link
              href={homeHref}
              className="flex items-center gap-2 px-4 py-2.5 text-white font-semibold transition-all hover:opacity-90"
              style={{
                fontSize: 13,
                background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              }}
            >
              <Home size={13} />
              Return to home page
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
