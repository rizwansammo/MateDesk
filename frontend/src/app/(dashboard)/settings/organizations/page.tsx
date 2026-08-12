'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Plus, Search, Edit2, Trash2, Loader2, X,
} from 'lucide-react';
import {
  useOrganizations, useCreateOrganization, useUpdateOrganization,
  useDeleteOrganization, useCreateUserInOrg, type ClientOrg,
} from '@/hooks/useOrganizations';

const inp = 'w-full h-9 px-3 text-[13px] bg-[#0f1117] border border-[#2a2f3d] text-[#e2e8f0] placeholder-[#3d4a6b] outline-none focus:border-[#2563eb] transition-colors';
const lbl = 'block mb-1 text-[11px] font-medium text-[#94a3b8] uppercase tracking-wide';

const EMPTY_FORM = {
  name: '', domain: '', contact_name: '', contact_email: '',
  phone: '', address: '', is_active: true,
};

const EMPTY_CONTACT = {
  first_name: '', last_name: '', email: '', role: 'client_owner',
  job_title: '', department: '', phone: '',
};

const CLIENT_ROLE_OPTIONS = [
  { value: 'client_owner', label: 'Client Owner' },
  { value: 'end_user',     label: 'End User' },
];

const AVATAR_COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2'];
function avatarColor(name: string) {
  let s = 0; for (const c of name) s += c.charCodeAt(0);
  return AVATAR_COLORS[s % AVATAR_COLORS.length];
}

export default function OrganizationsPage() {
  const router = useRouter();
  const [search,     setSearch]     = useState('');
  const [showForm,          setShowForm]          = useState(false);
  const [editingOrg,        setEditingOrg]        = useState<ClientOrg | null>(null);
  const [deletingId,        setDeletingId]        = useState<string | null>(null);
  const [deleteUsersChecked, setDeleteUsersChecked] = useState(false);
  const [form,              setForm]              = useState(EMPTY_FORM);
  const [contact,    setContact]    = useState(EMPTY_CONTACT);
  const [formError,  setFormError]  = useState('');

  const { data: orgs = [], isLoading } = useOrganizations(search || undefined);
  const createOrg  = useCreateOrganization();
  const updateOrg  = useUpdateOrganization();
  const deleteOrg  = useDeleteOrganization();
  const createUser = useCreateUserInOrg();

  function openCreate() {
    setEditingOrg(null);
    setForm(EMPTY_FORM);
    setContact(EMPTY_CONTACT);
    setFormError('');
    setShowForm(true);
  }

  function openEdit(org: ClientOrg) {
    setEditingOrg(org);
    setFormError('');
    setForm({
      name: org.name, domain: org.domain,
      contact_name: org.contact_name, contact_email: org.contact_email,
      phone: org.phone, address: org.address, is_active: org.is_active,
    });
    setShowForm(true);
  }

  function handleSubmit() {
    if (!form.name.trim()) return;
    setFormError('');

    if (editingOrg) {
      updateOrg.mutate({ id: editingOrg.id, data: form }, { onSuccess: () => setShowForm(false) });
      return;
    }

    // Build org payload — derive contact fields from the first-contact form
    const fullName = `${contact.first_name} ${contact.last_name}`.trim();
    const orgPayload = {
      ...form,
      contact_name:  fullName  || form.contact_name,
      contact_email: contact.email || form.contact_email,
    };

    createOrg.mutate(orgPayload, {
      onSuccess: (newOrg) => {
        // Auto-create the first contact as a user if email was provided
        if (contact.email.trim()) {
          createUser.mutate(
            { orgId: newOrg.id, data: { ...contact, phone: contact.phone || form.phone } },
            {
              onError: (err: unknown) => {
                // Org was created — just surface the user creation error non-blockingly
                const msg = (err instanceof Error ? err.message : null) ?? 'Org created, but failed to create first user.';
                setFormError(msg);
                return;
              },
            },
          );
        }
        setShowForm(false);
        setForm(EMPTY_FORM);
        setContact(EMPTY_CONTACT);
      },
    });
  }

  const isSaving = createOrg.isPending || updateOrg.isPending || createUser.isPending;

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Secondary bar */}
      <div className="secondary-bar">
        <button
          onClick={() => router.push('/settings')}
          className="flex items-center gap-1.5 transition-colors"
          style={{ fontSize: 12, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-1)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; }}
        >
          <ArrowLeft size={13} /> Back to Settings
        </button>
        <span style={{ color: 'var(--border-md)' }}>|</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>Client Organizations</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative flex items-center">
            <Search size={12} style={{ color: 'var(--text-4)', position: 'absolute', left: 9, pointerEvents: 'none' }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search clients..."
              style={{
                height: 28, paddingLeft: 28, paddingRight: 10, width: 200,
                fontSize: 12, background: 'var(--bg-base)', border: '1px solid var(--border-md)',
                color: 'var(--text-1)', outline: 'none',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
            />
          </div>
          <button
            onClick={openCreate}
            className="btn-primary gap-1"
            style={{ height: 28, fontSize: 12, paddingTop: 0, paddingBottom: 0 }}
          >
            <Plus size={12} /> New Client
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin" style={{ color: '#2563eb' }} />
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Client Name</th>
                <th>Domain</th>
                <th>Main Contact</th>
                <th>Status</th>
                <th className="text-right">Total Tickets</th>
                <th className="text-right">Users</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orgs.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="py-14 text-center" style={{ fontSize: 13, color: 'var(--text-5)' }}>
                      {search ? `No results for "${search}"` : 'No client organizations yet — click New Client to add one'}
                    </div>
                  </td>
                </tr>
              ) : orgs.map(org => (
                <tr key={org.id}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <div
                        className="flex items-center justify-center font-bold text-white flex-shrink-0"
                        style={{ width: 28, height: 28, background: avatarColor(org.name), fontSize: 12 }}
                      >
                        {org.name.charAt(0).toUpperCase()}
                      </div>
                      <Link
                        href={`/settings/organizations/${org.id}`}
                        className="font-semibold transition-colors"
                        style={{ fontSize: 13, color: 'var(--text-1)' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = '#60a5fa'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-1)'; }}
                      >
                        {org.name}
                      </Link>
                    </div>
                  </td>
                  <td style={{ color: '#60a5fa', fontSize: 12 }}>{org.domain || '—'}</td>
                  <td style={{ color: 'var(--text-2)', fontSize: 13 }}>{org.contact_name || '—'}</td>
                  <td>
                    <span className={org.is_active ? 'badge badge-success' : 'badge badge-danger'}>
                      {org.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="text-right" style={{ color: '#60a5fa', fontWeight: 600, fontSize: 13 }}>
                    {org.total_tickets}
                  </td>
                  <td className="text-right" style={{ color: 'var(--text-3)', fontSize: 13 }}>
                    {org.user_count}
                  </td>
                  <td style={{ color: 'var(--text-4)', fontSize: 12 }}>
                    {new Date(org.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => openEdit(org)}
                        className="flex items-center gap-1 transition-colors"
                        style={{ fontSize: 12, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#60a5fa'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; }}
                      >
                        <Edit2 size={12} /> Edit
                      </button>
                      <button
                        onClick={() => { setDeleteUsersChecked(false); setDeletingId(org.id); }}
                        style={{ color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-4)'; }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.65)', padding: 24 }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', width: '100%', maxWidth: 540, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
                {editingOrg ? 'Edit Organization' : 'New Client Organization'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                style={{ color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-1)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-4)'; }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-4 overflow-y-auto" style={{ padding: '20px' }}>

              {formError && (
                <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', fontSize: 12 }}>
                  {formError}
                </div>
              )}

              {/* ── Organization details ── */}
              <div>
                <label className={lbl}>Organization Name *</label>
                <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Acme Corp" className={inp} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Domain</label>
                  <input type="text" value={form.domain} onChange={e => setForm(p => ({ ...p, domain: e.target.value }))} placeholder="acme.com" className={inp} />
                </div>
                <div>
                  <label className={lbl}>Org Phone</label>
                  <input type="text" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+1 (555) 000-0000" className={inp} />
                </div>
              </div>
              <div>
                <label className={lbl}>Address</label>
                <input type="text" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="123 Main St, City, State" className={inp} />
              </div>
              <div className="flex items-center justify-between py-2" style={{ borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Active</span>
                <button
                  type="button"
                  onClick={() => setForm(p => ({ ...p, is_active: !p.is_active }))}
                  style={{ width: 40, height: 22, background: form.is_active ? '#2563eb' : 'var(--border-md)', position: 'relative', transition: 'background 0.15s', flexShrink: 0, border: 'none', cursor: 'pointer' }}
                >
                  <span style={{ position: 'absolute', top: 3, left: form.is_active ? 21 : 3, width: 16, height: 16, background: '#fff', transition: 'left 0.15s' }} />
                </button>
              </div>

              {/* ── First Contact (create only) ── */}
              {!editingOrg && (
                <>
                  <div style={{ paddingTop: 4 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 12 }}>
                      First Contact — will be created as a user
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={lbl}>First Name *</label>
                        <input type="text" value={contact.first_name} onChange={e => setContact(p => ({ ...p, first_name: e.target.value }))} placeholder="John" className={inp} />
                      </div>
                      <div>
                        <label className={lbl}>Last Name</label>
                        <input type="text" value={contact.last_name} onChange={e => setContact(p => ({ ...p, last_name: e.target.value }))} placeholder="Smith" className={inp} />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className={lbl}>Email *</label>
                    <input type="email" value={contact.email} onChange={e => setContact(p => ({ ...p, email: e.target.value }))} placeholder="john@acme.com" className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Role</label>
                    <select
                      value={contact.role}
                      onChange={e => setContact(p => ({ ...p, role: e.target.value }))}
                      className={inp}
                      style={{ cursor: 'pointer' }}
                    >
                      {CLIENT_ROLE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value} style={{ background: '#0f1117' }}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={lbl}>Job Title</label>
                      <input type="text" value={contact.job_title} onChange={e => setContact(p => ({ ...p, job_title: e.target.value }))} placeholder="IT Manager" className={inp} />
                    </div>
                    <div>
                      <label className={lbl}>Department</label>
                      <input type="text" value={contact.department} onChange={e => setContact(p => ({ ...p, department: e.target.value }))} placeholder="IT" className={inp} />
                    </div>
                  </div>
                  <div>
                    <label className={lbl}>Contact Phone</label>
                    <input type="tel" value={contact.phone} onChange={e => setContact(p => ({ ...p, phone: e.target.value }))} placeholder="+1 (555) 000-0000" className={inp} />
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-5)', marginTop: -4 }}>
                    Leave email blank to skip user creation. The user account will have no password until a password-reset link is sent.
                  </p>
                </>
              )}

              {/* Edit mode: keep existing contact fields */}
              {editingOrg && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Contact Name</label>
                    <input type="text" value={form.contact_name} onChange={e => setForm(p => ({ ...p, contact_name: e.target.value }))} placeholder="John Smith" className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Contact Email</label>
                    <input type="email" value={form.contact_email} onChange={e => setForm(p => ({ ...p, contact_email: e.target.value }))} placeholder="john@acme.com" className={inp} />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 flex-shrink-0" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <button onClick={() => setShowForm(false)} className="btn-ghost" style={{ fontSize: 12 }}>Cancel</button>
              <button
                onClick={handleSubmit}
                disabled={!form.name.trim() || (!editingOrg && !contact.first_name.trim()) || isSaving}
                className="btn-primary"
                style={{ fontSize: 12 }}
              >
                {isSaving ? 'Saving…' : editingOrg ? 'Save Changes' : 'Create Organization'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deletingId && (() => {
        const deletingOrg = orgs.find(o => o.id === deletingId);
        const userCount   = deletingOrg?.user_count ?? 0;
        return (
          <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.65)' }}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', width: '100%', maxWidth: 400 }}>
              <div className="p-6" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Delete Organization?</h2>
                <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>
                  <strong style={{ color: 'var(--text-1)' }}>{deletingOrg?.name}</strong> will be permanently deleted along with all associated tickets.
                  {userCount > 0 && !deleteUsersChecked && (
                    <> The {userCount} user{userCount !== 1 ? 's' : ''} in this org will remain and become unattached.</>
                  )}
                </p>
                {userCount > 0 && (
                  <label
                    style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', padding: '10px 12px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}
                  >
                    <input
                      type="checkbox"
                      checked={deleteUsersChecked}
                      onChange={e => setDeleteUsersChecked(e.target.checked)}
                      style={{ accentColor: '#dc2626', width: 14, height: 14, flexShrink: 0 }}
                    />
                    <span style={{ fontSize: 13, color: '#f87171', lineHeight: 1.4 }}>
                      Also permanently delete all {userCount} user{userCount !== 1 ? 's' : ''} in this organization
                    </span>
                  </label>
                )}
              </div>
              <div className="flex items-center justify-end gap-2 px-5 py-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <button onClick={() => setDeletingId(null)} className="btn-ghost" style={{ fontSize: 12 }}>Cancel</button>
                <button
                  onClick={() => deleteOrg.mutate(
                    { id: deletingId, deleteUsers: deleteUsersChecked },
                    { onSuccess: () => { setDeletingId(null); setDeleteUsersChecked(false); } },
                  )}
                  disabled={deleteOrg.isPending}
                  style={{ fontSize: 12, background: '#dc2626', color: '#fff', border: 'none', padding: '6px 16px', fontWeight: 600, cursor: 'pointer' }}
                >
                  {deleteOrg.isPending ? 'Deleting…' : deleteUsersChecked ? 'Delete Org & Users' : 'Delete Organization'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
