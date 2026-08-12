'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Layers, Plus, Edit2, Trash2, X, Check, Loader2, ChevronDown, ChevronRight, UserPlus } from 'lucide-react';
import { useGroups, useCreateGroup, useUpdateGroup, useDeleteGroup, useAddGroupAgent, useRemoveGroupAgent } from '@/hooks/useGroups';
import { useAgents } from '@/hooks/useAgents';
import type { SupportGroup } from '@/types/tickets';
import { ApiError } from '@/lib/api';
import { getAvatarColor, getInitials } from '@/lib/utils';

const GROUP_COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2'];

function groupColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return GROUP_COLORS[Math.abs(hash) % GROUP_COLORS.length];
}

// ── Group form modal (create / edit) ─────────────────────────────────────────

function GroupModal({ initial, onClose }: { initial?: SupportGroup; onClose: () => void }) {
  const isEdit = !!initial;
  const [name,        setName]        = useState(initial?.name        ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [error,       setError]       = useState('');

  const create    = useCreateGroup();
  const update    = useUpdateGroup(initial?.id ?? '');
  const isPending = create.isPending || update.isPending;

  async function handleSave() {
    setError('');
    if (!name.trim()) { setError('Name is required.'); return; }
    try {
      if (isEdit) {
        await update.mutateAsync({ name: name.trim(), description: description.trim() });
      } else {
        await create.mutateAsync({ name: name.trim(), description: description.trim() });
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', width: 400 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{isEdit ? 'Edit Group' : 'New Support Group'}</span>
          <button onClick={onClose} style={{ color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}><X size={14} /></button>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>Group Name *</label>
            <input
              autoFocus value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
              placeholder="e.g. Level 2 Support"
              style={{ width: '100%', height: 34, padding: '0 10px', background: 'var(--bg-base)', border: '1px solid var(--border-md)', color: 'var(--text-1)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>Description</label>
            <textarea
              value={description} onChange={e => setDescription(e.target.value)} rows={3}
              placeholder="Optional description…"
              style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-base)', border: '1px solid var(--border-md)', color: 'var(--text-1)', fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-md)'; }}
            />
          </div>
          {error && <p style={{ fontSize: 11, color: '#f87171', margin: 0 }}>{error}</p>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '10px 16px', borderTop: '1px solid var(--border-subtle)' }}>
          <button onClick={onClose} style={{ padding: '6px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-md)', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={isPending}
            style={{ padding: '6px 16px', background: '#2563eb', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: isPending ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: isPending ? 0.7 : 1 }}
          >
            {isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            {isEdit ? 'Save Changes' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete confirm modal ──────────────────────────────────────────────────────

function DeleteModal({ group, onClose }: { group: SupportGroup; onClose: () => void }) {
  const [error, setError] = useState('');
  const del = useDeleteGroup();

  async function handleDelete() {
    setError('');
    try {
      await del.mutateAsync(group.id);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete group.');
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', width: 360 }}>
        <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Delete Group</span>
          <button onClick={onClose} style={{ color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}><X size={14} /></button>
        </div>
        <div style={{ padding: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>
            Delete <strong style={{ color: 'var(--text-1)' }}>{group.name}</strong>?
            {group.ticket_count > 0 && <> {group.ticket_count} ticket{group.ticket_count !== 1 ? 's' : ''} will be unassigned from this group.</>}
          </p>
          {error && <p style={{ fontSize: 11, color: '#f87171', marginTop: 8, marginBottom: 0 }}>{error}</p>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '10px 16px', borderTop: '1px solid var(--border-subtle)' }}>
          <button onClick={onClose} style={{ padding: '6px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-md)', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleDelete} disabled={del.isPending}
            style={{ padding: '6px 16px', background: '#dc2626', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: del.isPending ? 'not-allowed' : 'pointer', opacity: del.isPending ? 0.7 : 1 }}
          >
            {del.isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Agents panel (expandable, shown below each group row) ─────────────────────

function AgentsPanel({ group }: { group: SupportGroup }) {
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const { data: allAgents = [] } = useAgents();
  const addAgent    = useAddGroupAgent(group.id);
  const removeAgent = useRemoveGroupAgent(group.id);

  const memberIds    = new Set(group.agents.map(a => a.id));
  const available    = allAgents.filter(a => !memberIds.has(a.id));

  function handleAdd() {
    if (!selectedAgentId) return;
    addAgent.mutate(selectedAgentId, { onSuccess: () => setSelectedAgentId('') });
  }

  return (
    <tr>
      <td colSpan={4} style={{ padding: 0, borderBottom: '1px solid var(--border-md)' }}>
        <div style={{ padding: '12px 16px 14px 52px', background: 'var(--bg-base)', borderTop: '1px solid var(--border-subtle)' }}>

          {/* Current agents */}
          <div style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Agents in this group
            </span>
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {group.agents.length === 0 ? (
                <span style={{ fontSize: 12, color: 'var(--text-5)', fontStyle: 'italic' }}>No agents assigned yet.</span>
              ) : group.agents.map(agent => (
                <div
                  key={agent.id}
                  className="flex items-center gap-1.5"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', padding: '3px 8px 3px 6px', fontSize: 12 }}
                >
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: getAvatarColor(agent.full_name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                    {getInitials(agent.full_name)}
                  </div>
                  <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>{agent.full_name}</span>
                  <button
                    onClick={() => removeAgent.mutate(agent.id)}
                    disabled={removeAgent.isPending}
                    style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 0 1px 3px', color: 'var(--text-4)', marginLeft: 2 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f87171'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; }}
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Add agent row */}
          {available.length > 0 && (
            <div className="flex items-center gap-2" style={{ marginTop: 4 }}>
              <select
                value={selectedAgentId}
                onChange={e => setSelectedAgentId(e.target.value)}
                className="select"
                style={{ height: 28, fontSize: 12, paddingTop: 0, paddingBottom: 0, minWidth: 200 }}
              >
                <option value="">Add agent…</option>
                {available.map(a => (
                  <option key={a.id} value={a.id}>{a.full_name}</option>
                ))}
              </select>
              <button
                onClick={handleAdd}
                disabled={!selectedAgentId || addAgent.isPending}
                className="btn-primary gap-1"
                style={{ height: 28, fontSize: 11, paddingTop: 0, paddingBottom: 0, opacity: !selectedAgentId ? 0.5 : 1 }}
              >
                {addAgent.isPending ? <Loader2 size={11} className="animate-spin" /> : <UserPlus size={11} />}
                Add
              </button>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SupportGroupsPage() {
  const router = useRouter();
  const { data: groups, isLoading, isError } = useGroups();

  const [showCreate,   setShowCreate]   = useState(false);
  const [editGroup,    setEditGroup]    = useState<SupportGroup | null>(null);
  const [deleteGroup,  setDeleteGroup]  = useState<SupportGroup | null>(null);
  const [expandedId,   setExpandedId]   = useState<string | null>(null);

  function toggleExpand(id: string) {
    setExpandedId(prev => prev === id ? null : id);
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
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>Support Groups</span>
        <div className="ml-auto">
          <button
            className="btn-primary gap-1"
            style={{ fontSize: 11, height: 28, paddingTop: 0, paddingBottom: 0 }}
            onClick={() => setShowCreate(true)}
          >
            <Plus size={12} /> New Group
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: '28px 24px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>

          <div className="flex items-center gap-3 mb-6">
            <div style={{ width: 40, height: 40, background: 'rgba(37,99,235,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Layers size={18} style={{ color: '#60a5fa' }} />
            </div>
            <div>
              <h1 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Support Groups</h1>
              <p style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>Organize tickets into queues. Click a group to manage its agents.</p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin" style={{ color: '#2563eb' }} />
            </div>
          ) : isError ? (
            <p style={{ fontSize: 12, color: '#f87171', textAlign: 'center', padding: '32px 0' }}>Failed to load groups.</p>
          ) : (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 24 }} />
                    <th>Group Name</th>
                    <th>Description</th>
                    <th className="text-right" style={{ width: 70 }}>Agents</th>
                    <th className="text-right" style={{ width: 70 }}>Tickets</th>
                    <th style={{ width: 100 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(groups ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <div className="empty-state py-10">
                          <Layers size={28} style={{ color: 'var(--border-md)', marginBottom: 8 }} />
                          <p className="empty-state-text">No groups yet</p>
                          <button className="btn-primary mt-3 gap-1" style={{ fontSize: 11 }} onClick={() => setShowCreate(true)}>
                            <Plus size={12} /> Create First Group
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (groups ?? []).map(group => {
                    const isExpanded = expandedId === group.id;
                    return (
                      <>
                        <tr key={group.id} style={{ cursor: 'pointer' }} onClick={() => toggleExpand(group.id)}>
                          <td>
                            {isExpanded
                              ? <ChevronDown size={13} style={{ color: 'var(--text-3)' }} />
                              : <ChevronRight size={13} style={{ color: 'var(--text-4)' }} />
                            }
                          </td>
                          <td>
                            <div className="flex items-center gap-2.5">
                              <div style={{ width: 28, height: 28, background: groupColor(group.name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                                {group.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{group.name}</span>
                                {group.is_default && (
                                  <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#fbbf24', background: 'rgba(245,158,11,0.15)', padding: '1px 6px' }}>DEFAULT</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td style={{ color: 'var(--text-4)', fontSize: 12, maxWidth: 220 }}>
                            <span className="truncate block">{group.description || '—'}</span>
                          </td>
                          <td className="text-right" style={{ color: 'var(--text-2)', fontWeight: 600, fontSize: 13 }}>
                            {group.agents.length}
                          </td>
                          <td className="text-right" style={{ color: '#60a5fa', fontWeight: 600, fontSize: 13 }}>
                            {group.ticket_count}
                          </td>
                          <td onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => setEditGroup(group)}
                                style={{ color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; }}
                              >
                                <Edit2 size={12} /> Edit
                              </button>
                              <button
                                onClick={() => setDeleteGroup(group)}
                                style={{ color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f87171'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && <AgentsPanel key={`panel-${group.id}`} group={group} />}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showCreate  && <GroupModal onClose={() => setShowCreate(false)} />}
      {editGroup   && <GroupModal initial={editGroup} onClose={() => setEditGroup(null)} />}
      {deleteGroup && <DeleteModal group={deleteGroup} onClose={() => setDeleteGroup(null)} />}
    </div>
  );
}
