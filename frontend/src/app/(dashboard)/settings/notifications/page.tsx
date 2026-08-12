'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, ChevronLeft, Save } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface NotifSetting {
  key: string;
  label: string;
  description: string;
  defaultOn: boolean;
}

interface NotifGroup {
  title: string;
  settings: NotifSetting[];
}

// ── Config ────────────────────────────────────────────────────────────────────

const NOTIF_GROUPS: NotifGroup[] = [
  {
    title: 'Tickets',
    settings: [
      { key: 'new_ticket',       label: 'New Ticket Created',       description: 'Notify when a new ticket is submitted by a client.',            defaultOn: true  },
      { key: 'ticket_assigned',  label: 'Ticket Assigned to Me',    description: 'Notify when a ticket is assigned to your account.',             defaultOn: true  },
      { key: 'status_changed',   label: 'Ticket Status Changed',    description: 'Notify when the status of any ticket changes.',                 defaultOn: true  },
      { key: 'client_reply',     label: 'Client Reply Received',    description: 'Notify when a client posts a public reply on a ticket.',        defaultOn: true  },
      { key: 'internal_note',    label: 'Internal Note Added',      description: 'Notify when a team member adds an internal note.',              defaultOn: false },
      { key: 'ticket_resolved',  label: 'Ticket Resolved / Closed', description: 'Notify when a ticket is marked resolved or closed.',           defaultOn: false },
      { key: 'unassigned_new',   label: 'New Unassigned Ticket',    description: 'Notify when a ticket has no assigned agent after 15 minutes.', defaultOn: true  },
    ],
  },
  {
    title: 'SLA & Escalations',
    settings: [
      { key: 'sla_breach',       label: 'SLA Breach Warning',      description: 'Notify 30 minutes before an SLA deadline is missed.',         defaultOn: true  },
      { key: 'sla_breached',     label: 'SLA Breached',            description: 'Notify immediately when an SLA is breached.',                 defaultOn: true  },
      { key: 'level_escalation', label: 'Level Escalated',         description: 'Notify when a ticket is escalated to a higher support level.', defaultOn: true  },
    ],
  },
  {
    title: 'System',
    settings: [
      { key: 'daily_digest',     label: 'Daily Summary Digest',    description: 'Receive a daily summary of open, pending, and overdue tickets.', defaultOn: true  },
      { key: 'weekly_report',    label: 'Weekly Report',           description: 'Receive a weekly performance report every Monday morning.',      defaultOn: false },
      { key: 'system_alerts',    label: 'System Alerts',           description: 'Notify about platform maintenance, updates, and downtime.',      defaultOn: true  },
    ],
  },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex-shrink-0 transition-colors duration-150"
      style={{
        width: 36, height: 20,
        background: on ? '#2563eb' : 'var(--bg-elevated)',
        border: `1px solid ${on ? '#2563eb' : 'var(--border-md)'}`,
        borderRadius: 10,
        position: 'relative',
      }}
    >
      <span
        className="absolute transition-all duration-150"
        style={{
          top: 2,
          left: on ? 18 : 2,
          width: 14, height: 14,
          background: on ? '#fff' : '#64748b',
          borderRadius: '50%',
        }}
      />
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const router = useRouter();

  // Build initial state from defaults
  const [settings, setSettings] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    NOTIF_GROUPS.forEach(g => g.settings.forEach(s => { initial[s.key] = s.defaultOn; }));
    return initial;
  });
  const [saved, setSaved] = useState(false);

  function toggle(key: string) {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const enabledCount = Object.values(settings).filter(Boolean).length;

  return (
    <div className="flex flex-col h-full">

      {/* Secondary bar */}
      <div className="secondary-bar">
        <button className="btn-ghost gap-1" onClick={() => router.push('/settings')}>
          <ChevronLeft size={13} /> Settings
        </button>
        <span style={{ fontSize: 12, color: '#64748b' }}>/ Notifications</span>
        <div className="ml-auto flex items-center gap-3">
          {saved && (
            <span style={{ fontSize: 12, color: '#34d399' }}>Preferences saved.</span>
          )}
          <button className="btn-primary gap-1.5" style={{ height: 28, fontSize: 11, paddingTop: 0, paddingBottom: 0 }} onClick={handleSave}>
            <Save size={12} /> Save
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-6" style={{ maxWidth: 720, margin: '0 auto' }}>

          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div
              className="w-10 h-10 flex items-center justify-center flex-shrink-0"
              style={{ background: '#252936', color: '#60a5fa' }}
            >
              <Bell size={18} />
            </div>
            <div>
              <h1 className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>Notification Settings</h1>
              <p style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                {enabledCount} of {Object.keys(settings).length} notifications enabled
              </p>
            </div>
          </div>

          {/* Groups */}
          <div className="space-y-4">
            {NOTIF_GROUPS.map(group => (
              <div key={group.title} className="panel">
                <div className="panel-header">
                  <span className="panel-title">{group.title}</span>
                </div>
                <div>
                  {group.settings.map((s, i) => (
                    <div
                      key={s.key}
                      className="flex items-center justify-between px-4 py-3"
                      style={{ borderBottom: i < group.settings.length - 1 ? '1px solid #1e2130' : 'none' }}
                    >
                      <div className="flex-1 min-w-0 mr-4">
                        <div className="text-xs font-medium" style={{ color: '#e2e8f0' }}>{s.label}</div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{s.description}</div>
                      </div>
                      <Toggle on={settings[s.key]} onChange={() => toggle(s.key)} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Note */}
          <p style={{ fontSize: 11, color: '#475569', marginTop: 20, textAlign: 'center' }}>
            Email delivery for notifications will be configured when the mail server is connected (Phase 10).
          </p>
        </div>
      </div>
    </div>
  );
}
