'use client';

import { useRouter } from 'next/navigation';
import { BookOpen, FileText, MessageSquare, ArrowRight } from 'lucide-react';
import { useKBArticles } from '@/hooks/useKB';
import { useCannedCategories } from '@/hooks/useCanned';

const CARDS = [
  {
    key:         'resolutions',
    href:        '/kb/resolutions',
    icon:        BookOpen,
    color:       '#a78bfa',
    bg:          'rgba(167,139,250,0.1)',
    border:      'rgba(167,139,250,0.25)',
    title:       'Resolutions',
    description: 'Document how tickets were resolved. Link resolution notes directly to closed tickets for future reference and team knowledge sharing.',
    disabled:    false,
  },
  {
    key:         'documentation',
    href:        '/kb/documentation',
    icon:        FileText,
    color:       '#60a5fa',
    bg:          'rgba(96,165,250,0.08)',
    border:      'rgba(96,165,250,0.2)',
    title:       'Documentation',
    description: 'Internal guides, runbooks, and how-to articles for your team. Keep technical knowledge organised and searchable in one place.',
    disabled:    false,
  },
  {
    key:         'canned-responses',
    href:        '/kb/canned-responses',
    icon:        MessageSquare,
    color:       '#34d399',
    bg:          'rgba(52,211,153,0.08)',
    border:      'rgba(52,211,153,0.2)',
    title:       'Canned Responses',
    description: 'Pre-written reply templates for common requests. Insert them into tickets with one click to save time and keep replies consistent.',
    disabled:    false,
  },
];

export default function KBLandingPage() {
  const router = useRouter();
  const { data: resolutions  = [] } = useKBArticles('resolution');
  const { data: cannedCats   = [] } = useCannedCategories();

  const counts: Record<string, number | null> = {
    resolutions:        resolutions.length,
    documentation:      null,
    'canned-responses': cannedCats.length,
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Secondary bar */}
      <div className="secondary-bar">
        <BookOpen size={13} style={{ color: '#a78bfa' }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>Knowledge Base</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto flex flex-col items-center justify-center p-8">

        {/* Heading */}
        <div className="text-center mb-10">
          <div
            className="flex items-center justify-center mb-4"
            style={{ width: 56, height: 56, background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.25)', margin: '0 auto 16px' }}
          >
            <BookOpen size={24} style={{ color: '#a78bfa' }} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-0)', marginBottom: 8 }}>
            Knowledge Base
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-4)', maxWidth: 420, lineHeight: 1.6 }}>
            Capture knowledge, document resolutions, and build reusable content for your team.
          </p>
        </div>

        {/* Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 280px)',
            gap: 20,
            justifyContent: 'center',
          }}
        >
          {CARDS.map(card => {
            const Icon  = card.icon;
            const count = counts[card.key];

            return (
              <div
                key={card.key}
                onClick={() => !card.disabled && router.push(card.href)}
                style={{
                  background:    'var(--bg-card)',
                  border:        `1px solid ${card.disabled ? 'var(--border-subtle)' : card.border}`,
                  padding:       '28px 24px 24px',
                  cursor:        card.disabled ? 'default' : 'pointer',
                  opacity:       card.disabled ? 0.55 : 1,
                  display:       'flex',
                  flexDirection: 'column',
                  gap:           16,
                  transition:    'border-color 0.15s, box-shadow 0.15s',
                  position:      'relative',
                }}
                onMouseEnter={e => {
                  if (!card.disabled) {
                    (e.currentTarget as HTMLElement).style.borderColor = card.color;
                    (e.currentTarget as HTMLElement).style.boxShadow  = `0 0 0 1px ${card.color}22`;
                  }
                }}
                onMouseLeave={e => {
                  if (!card.disabled) {
                    (e.currentTarget as HTMLElement).style.borderColor = card.border;
                    (e.currentTarget as HTMLElement).style.boxShadow  = 'none';
                  }
                }}
              >
                {/* Coming soon badge */}
                {card.disabled && (
                  <div style={{ position: 'absolute', top: 14, right: 14, fontSize: 9, fontWeight: 700, color: 'var(--text-5)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', padding: '2px 7px', letterSpacing: '0.1em' }}>
                    COMING SOON
                  </div>
                )}

                {/* Icon */}
                <div style={{ width: 44, height: 44, background: card.bg, border: `1px solid ${card.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={20} style={{ color: card.color }} />
                </div>

                {/* Text */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>{card.title}</span>
                    {count !== null && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: card.color, background: card.bg, border: `1px solid ${card.border}`, padding: '1px 7px' }}>
                        {count}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-4)', lineHeight: 1.65 }}>
                    {card.description}
                  </p>
                </div>

                {/* CTA */}
                {!card.disabled && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: card.color }}>
                    Open <ArrowRight size={12} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
