'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Clock, Save } from 'lucide-react';

const DAYS = [
  { key: 'mon', label: 'Monday'    },
  { key: 'tue', label: 'Tuesday'   },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday'  },
  { key: 'fri', label: 'Friday'    },
  { key: 'sat', label: 'Saturday'  },
  { key: 'sun', label: 'Sunday'    },
];

const DEFAULT_HOURS: Record<string, { open: boolean; start: string; end: string }> = {
  mon: { open: true,  start: '08:00', end: '18:00' },
  tue: { open: true,  start: '08:00', end: '18:00' },
  wed: { open: true,  start: '08:00', end: '18:00' },
  thu: { open: true,  start: '08:00', end: '18:00' },
  fri: { open: true,  start: '08:00', end: '18:00' },
  sat: { open: true,  start: '09:00', end: '14:00' },
  sun: { open: false, start: '09:00', end: '17:00' },
};

const timeInp = 'h-8 px-2 text-[12px] bg-[#0f1117] border border-[#2a2f3d] text-[#e2e8f0] outline-none focus:border-[#2563eb] transition-colors';

export default function BusinessHoursPage() {
  const router = useRouter();
  const [hours, setHours] = useState(DEFAULT_HOURS);

  function toggle(day: string) {
    setHours(h => ({ ...h, [day]: { ...h[day], open: !h[day].open } }));
  }
  function setTime(day: string, field: 'start' | 'end', val: string) {
    setHours(h => ({ ...h, [day]: { ...h[day], [field]: val } }));
  }

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
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>Business Hours</span>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: '28px 24px' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>

          <div className="flex items-center gap-3 mb-6">
            <div style={{ width: 40, height: 40, background: 'rgba(37,99,235,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Clock size={18} style={{ color: 'var(--accent-info-fg)' }} />
            </div>
            <div>
              <h1 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Business Hours</h1>
              <p style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>Set when your team is available to handle support tickets.</p>
            </div>
          </div>

          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Weekly Schedule
              </span>
            </div>

            <div>
              {DAYS.map(({ key, label }) => {
                const day = hours[key];
                return (
                  <div
                    key={key}
                    className="flex items-center gap-4 px-5 py-3"
                    style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  >
                    {/* Toggle */}
                    <button
                      type="button"
                      onClick={() => toggle(key)}
                      style={{
                        width: 36, height: 20, position: 'relative', flexShrink: 0,
                        background: day.open ? '#2563eb' : 'var(--bg-elevated)', border: 'none', cursor: 'pointer', transition: 'background 0.15s',
                      }}
                    >
                      <span style={{
                        position: 'absolute', top: 2, left: day.open ? 18 : 2,
                        width: 16, height: 16, background: '#fff', transition: 'left 0.15s',
                      }} />
                    </button>

                    {/* Day label */}
                    <span style={{ fontSize: 13, color: day.open ? 'var(--text-1)' : 'var(--text-3)', width: 100, flexShrink: 0 }}>
                      {label}
                    </span>

                    {/* Time range */}
                    {day.open ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          value={day.start}
                          onChange={e => setTime(key, 'start', e.target.value)}
                          className={timeInp}
                          style={{ colorScheme: 'dark' }}
                        />
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>to</span>
                        <input
                          type="time"
                          value={day.end}
                          onChange={e => setTime(key, 'end', e.target.value)}
                          className={timeInp}
                          style={{ colorScheme: 'dark' }}
                        />
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>Closed</span>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>
                After-Hours Message
              </label>
              <textarea
                rows={2}
                defaultValue="We are currently outside of business hours. Your ticket has been received and will be addressed on the next business day."
                style={{
                  width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-md)',
                  color: 'var(--text-1)', fontSize: 12, padding: '8px 12px', resize: 'vertical', outline: 'none',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
              />
            </div>

            <div className="flex items-center gap-3 px-5 py-4">
              <button
                className="flex items-center gap-2 px-5 py-2 font-semibold text-white"
                style={{ background: '#2563eb', fontSize: 12 }}
              >
                <Save size={12} /> Save Changes
              </button>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Backend integration coming soon</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
