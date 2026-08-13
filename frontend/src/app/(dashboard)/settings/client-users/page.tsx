'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Search, Loader2, Trash2, AlertCircle, CheckCircle, UserX,
} from 'lucide-react';
import { useClientUsers, useDeleteUser } from '@/hooks/useOrganizations';

const ROLE_LABELS: Record<string, string> = {
  client_owner: 'Client Owner',
  end_user:     'End User',
};

const AVATAR_COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2'];
function avatarColor(name: string) {
  let s = 0; for (const c of name) s += c.charCodeAt(0);
  return AVATAR_COLORS[s % AVATAR_COLORS.length];
}

type Tab = 'all' | 'unattached';

export default function ClientUsersPage() {
  const router = useRouter();
  const [tab,        setTab]        = useState<Tab>('all');
  const [search,     setSearch]     = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState('');

  const { data: users = [], isLoading } = useClientUsers(tab === 'unattached' ? 'unattached' : undefined);
  const deleteUser = useDeleteUser();

  const filtered = search.trim()
    ? users.filter(u => {
        const q = search.toLowerCase();
        return (
          u.full_name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.org_name ?? '').toLowerCase().includes(q) ||
          (u.deleted_org_name ?? '').toLowerCase().includes(q)
        );
      })
    : users;

  function confirmDelete(id: string, name: string) {
    setDeletingId(id);
    setDeletingName(name);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Secondary bar */}
      <div className="secondary-bar">
        <button
          onClick={() => router.push('/settings')}
          className="flex items-center gap-1.5"
          style={{ fontSize: 12, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-1)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; }}
        >
          <ArrowLeft size={13} /> Settings
        </button>
        <span style={{ color: 'var(--border-md)' }}>|</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>Client Users</span>

        {/* Tabs */}
        <div className="flex" style={{ marginLeft: 16, border: '1px solid var(--border-md)' }}>
          {(['all', 'unattached'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                fontSize: 11, fontWeight: 600, padding: '4px 14px', border: 'none', cursor: 'pointer',
                background: tab === t ? 'rgba(37,99,235,0.15)' : 'transparent',
                color: tab === t ? '#60a5fa' : 'var(--text-4)',
                borderRight: t === 'all' ? '1px solid var(--border-md)' : 'none',
              }}
            >
              {t === 'all' ? 'All Users' : 'Unattached'}
              {t === 'unattached' && tab === 'unattached' && users.length > 0 && (
                <span style={{ marginLeft: 5, background: '#f87171', color: '#fff', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 99 }}>
                  {users.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative flex items-center">
            <Search size={12} style={{ color: 'var(--text-4)', position: 'absolute', left: 9, pointerEvents: 'none' }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search users…"
              style={{
                height: 28, paddingLeft: 28, paddingRight: 10, width: 200,
                fontSize: 12, background: 'var(--bg-base)', border: '1px solid var(--border-md)',
                color: 'var(--text-1)', outline: 'none',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent-info-fg)' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <UserX size={32} style={{ color: 'var(--border-md)' }} />
            <p style={{ fontSize: 13, color: 'var(--text-3)' }}>
              {tab === 'unattached' ? 'No unattached users — all users belong to an organization.' : 'No users found.'}
            </p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Organization</th>
                <th>Job Title</th>
                <th>Department</th>
                <th>Joined</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map(user => (
                <tr key={user.id}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <div
                        className="flex items-center justify-center font-bold text-white flex-shrink-0"
                        style={{ width: 26, height: 26, borderRadius: '50%', background: avatarColor(user.full_name), fontSize: 10 }}
                      >
                        {user.full_name.charAt(0).toUpperCase()}
                      </div>
                      {user.org_id ? (
                        <Link
                          href={`/settings/organizations/${user.org_id}/users/${user.id}`}
                          style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = '#60a5fa'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-1)'; }}
                        >
                          {user.full_name}
                        </Link>
                      ) : (
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{user.full_name}</span>
                      )}
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-3)', fontSize: 12 }}>{user.email}</td>
                  <td>
                    <span style={{ fontSize: 11, color: 'var(--accent-indigo-fg)', background: 'rgba(129,140,248,0.1)', padding: '2px 7px' }}>
                      {ROLE_LABELS[user.role] ?? user.role}
                    </span>
                  </td>
                  <td>
                    {user.org_id ? (
                      <Link
                        href={`/settings/organizations/${user.org_id}`}
                        style={{ fontSize: 12, color: 'var(--accent-info-fg)' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '0.75'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '1'; }}
                      >
                        {user.org_name}
                      </Link>
                    ) : user.deleted_org_name ? (
                      <span style={{ fontSize: 11, color: 'var(--accent-warn-fg)', background: 'rgba(245,158,11,0.1)', padding: '2px 7px', fontWeight: 600 }}>
                        {user.deleted_org_name} [Deleted]
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--accent-danger-fg)', background: 'rgba(239,68,68,0.1)', padding: '2px 7px', fontWeight: 600 }}>
                        Unattached
                      </span>
                    )}
                  </td>
                  <td style={{ color: 'var(--text-4)', fontSize: 12 }}>{user.job_title || '—'}</td>
                  <td style={{ color: 'var(--text-4)', fontSize: 12 }}>{user.department || '—'}</td>
                  <td style={{ color: 'var(--text-4)', fontSize: 12 }}>
                    {new Date(user.date_joined).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td>
                    <span className="flex items-center gap-1" style={{ fontSize: 11, color: user.is_active ? '#34d399' : '#f87171' }}>
                      <CheckCircle size={11} />
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => confirmDelete(user.id, user.full_name)}
                      style={{ color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px 4px' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f87171'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; }}
                      title="Delete user"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Delete confirm */}
      {deletingId && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setDeletingId(null); }}
        >
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', width: '100%', maxWidth: 380 }}>
            <div style={{ padding: '20px 20px 16px' }}>
              <div className="flex items-center gap-3 mb-3">
                <AlertCircle size={20} style={{ color: 'var(--accent-danger-fg)', flexShrink: 0 }} />
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Delete User?</p>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--text-1)' }}>{deletingName}</strong> will be permanently deleted.
                Their tickets will remain but will show as an unnamed requester.
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--border-subtle)' }}>
              <button
                onClick={() => setDeletingId(null)}
                style={{ padding: '6px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-md)', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => deleteUser.mutate(deletingId, { onSuccess: () => setDeletingId(null) })}
                disabled={deleteUser.isPending}
                style={{ padding: '6px 16px', background: '#dc2626', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: deleteUser.isPending ? 0.6 : 1 }}
              >
                {deleteUser.isPending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                Delete User
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
