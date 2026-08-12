'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, LayoutTemplate, Plus, Loader2, X,
  Check, AlertCircle, ChevronRight, BookOpen,
} from 'lucide-react';
import {
  useAutomationTemplates, useCreateAutomationRule,
  FIELDS, OPERATORS_FOR, OPERATOR_LABELS, NO_VALUE_OPERATORS, ACTIONS,
  TRIGGER_LABELS, TRIGGER_COLORS, TEMPLATE_CATEGORIES,
  type AutomationRule, type AutomationCondition, type AutomationAction, type AutomationTemplate,
} from '@/hooks/useAutomation';
import { useGroups } from '@/hooks/useGroups';
import { useAgents } from '@/hooks/useAgents';
import { useOrganizations } from '@/hooks/useOrganizations';

// ── Shared input styles ───────────────────────────────────────────────────────

const INP: React.CSSProperties = {
  width: '100%', padding: '7px 10px', fontSize: 12,
  background: 'var(--bg-base)', border: '1px solid var(--border-md)',
  color: 'var(--text-1)', outline: 'none',
};

const SEL: React.CSSProperties = {
  padding: '6px 8px', fontSize: 12,
  background: 'var(--bg-base)', border: '1px solid var(--border-md)',
  color: 'var(--text-1)', outline: 'none', cursor: 'pointer',
};

function fi(e: React.FocusEvent<HTMLElement>) { (e.currentTarget as HTMLElement).style.borderColor = '#2563eb'; }
function fo(e: React.FocusEvent<HTMLElement>) { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-md)'; }

function SectionHdr({ title }: { title: string }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid var(--border-subtle)' }}>
      {title}
    </div>
  );
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        type="button"
        onClick={() => onChange(!value)}
        style={{ width: 36, height: 20, background: value ? '#2563eb' : 'var(--border-md)', position: 'relative', transition: 'background 0.15s', border: 'none', cursor: 'pointer', flexShrink: 0 }}
      >
        <span style={{ position: 'absolute', top: 2, left: value ? 18 : 2, width: 16, height: 16, background: '#fff', transition: 'left 0.15s' }} />
      </button>
      <span style={{ fontSize: 12, color: value ? 'var(--text-2)' : 'var(--text-4)' }}>{label}</span>
    </div>
  );
}

// ── Rule Panel (inline slide-in) ──────────────────────────────────────────────

interface PanelProps {
  prefill:  Partial<AutomationRule>;
  onClose:  () => void;
  onSaved:  (name: string) => void;
}

function RulePanel({ prefill, onClose, onSaved }: PanelProps) {
  const { data: groups = [] } = useGroups();
  const { data: agents = [] } = useAgents();
  const { data: orgs   = [] } = useOrganizations();
  const create = useCreateAutomationRule();

  const [name,           setName]           = useState(prefill?.name            ?? '');
  const [description,    setDescription]    = useState(prefill?.description     ?? '');
  const [isActive,       setIsActive]       = useState(prefill?.is_active       ?? true);
  const [priorityOrder,  setPriorityOrder]  = useState(prefill?.priority_order  ?? 10);
  const [trigger,        setTrigger]        = useState<string>(prefill?.trigger ?? 'ticket_created');
  const [scopeType,      setScopeType]      = useState<AutomationRule['scope_type']>(prefill?.scope_type ?? 'all_orgs');
  const [scopeOrgId,     setScopeOrgId]     = useState<string>(prefill?.scope_org_id ?? '');
  const [conditionMatch, setConditionMatch] = useState<AutomationRule['condition_match']>(prefill?.condition_match ?? 'all');
  const [conditions,     setConditions]     = useState<AutomationCondition[]>(prefill?.conditions ?? []);
  const [actions,        setActionsState]   = useState<AutomationAction[]>(prefill?.actions ?? []);
  const [stopProcessing, setStopProcessing] = useState(prefill?.stop_processing ?? false);
  const [error,          setError]          = useState('');
  const [saved,          setSaved]          = useState(false);

  const needsConfig = actions.some(a => ['set_group', 'set_assignee'].includes(a.type) && !a.value);

  function addCondition() {
    const field = FIELDS[0];
    setConditions(v => [...v, { field: field.key, operator: OPERATORS_FOR[field.type][0], value: '' }]);
  }
  function removeCondition(i: number) { setConditions(v => v.filter((_, idx) => idx !== i)); }
  function updateCondition(i: number, patch: Partial<AutomationCondition>) {
    setConditions(v => v.map((c, idx) => idx === i ? { ...c, ...patch } : c));
  }

  function addAction() { setActionsState(v => [...v, { type: ACTIONS[0].type, value: '' }]); }
  function removeAction(i: number) { setActionsState(v => v.filter((_, idx) => idx !== i)); }
  function updateAction(i: number, patch: Partial<AutomationAction>) {
    setActionsState(v => v.map((a, idx) => idx === i ? { ...a, ...patch } : a));
  }

  function renderConditionValue(cond: AutomationCondition, i: number) {
    if (NO_VALUE_OPERATORS.has(cond.operator)) return null;
    const fieldDef = FIELDS.find(f => f.key === cond.field);
    if (!fieldDef) return null;
    if (fieldDef.type === 'bool') {
      return (
        <select value={cond.value} onChange={e => updateCondition(i, { value: e.target.value })} style={{ ...SEL, flex: 1 }} onFocus={fi} onBlur={fo}>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      );
    }
    if (fieldDef.type === 'choice' && fieldDef.choices) {
      return (
        <select value={cond.value} onChange={e => updateCondition(i, { value: e.target.value })} style={{ ...SEL, flex: 1 }} onFocus={fi} onBlur={fo}>
          <option value="">— select —</option>
          {fieldDef.choices.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      );
    }
    if (fieldDef.type === 'numeric') {
      return (
        <input type="number" step="any" value={cond.value} onChange={e => updateCondition(i, { value: e.target.value })}
          placeholder="e.g. 2" style={{ ...INP, flex: 1, padding: '6px 8px' }} onFocus={fi} onBlur={fo} />
      );
    }
    return (
      <input value={cond.value} onChange={e => updateCondition(i, { value: e.target.value })}
        placeholder="value…" style={{ ...INP, flex: 1, padding: '6px 8px' }} onFocus={fi} onBlur={fo} />
    );
  }

  function renderActionValue(action: AutomationAction, i: number) {
    const actionDef = ACTIONS.find(a => a.type === action.type);
    if (!actionDef) return null;
    if (actionDef.valueType === 'none') {
      return <span style={{ fontSize: 11, color: 'var(--text-5)', fontStyle: 'italic', flex: 1, padding: '0 8px' }}>No value needed</span>;
    }
    if (actionDef.valueType === 'choice' && actionDef.choices) {
      return (
        <select value={action.value} onChange={e => updateAction(i, { value: e.target.value })} style={{ ...SEL, flex: 1 }} onFocus={fi} onBlur={fo}>
          <option value="">— select —</option>
          {actionDef.choices.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      );
    }
    if (actionDef.valueType === 'group') {
      return (
        <select value={action.value} onChange={e => updateAction(i, { value: e.target.value })} style={{ ...SEL, flex: 1 }} onFocus={fi} onBlur={fo}>
          <option value="">— select group —</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      );
    }
    if (actionDef.valueType === 'agent') {
      return (
        <select value={action.value} onChange={e => updateAction(i, { value: e.target.value })} style={{ ...SEL, flex: 1 }} onFocus={fi} onBlur={fo}>
          <option value="">— select agent —</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
        </select>
      );
    }
    return (
      <input value={action.value} onChange={e => updateAction(i, { value: e.target.value })}
        placeholder={actionDef?.placeholder ?? 'value…'} style={{ ...INP, flex: 1, padding: '6px 8px' }} onFocus={fi} onBlur={fo} />
    );
  }

  function handleSave() {
    if (!name.trim())    { setError('Rule name is required.'); return; }
    if (!actions.length) { setError('Add at least one action.'); return; }
    setError('');

    const payload = {
      name: name.trim(), description: description.trim(),
      is_active: isActive, priority_order: priorityOrder,
      trigger, scope_type: scopeType,
      scope_org_id: scopeType === 'specific_org' && scopeOrgId ? scopeOrgId : null,
      condition_match: conditionMatch, conditions, actions, stop_processing: stopProcessing,
    };

    create.mutate(payload, {
      onSuccess: () => { setSaved(true); setTimeout(() => { setSaved(false); onSaved(name.trim()); }, 700); },
      onError:   () => setError('Failed to save rule.'),
    });
  }

  const XBtn = ({ onClick }: { onClick: () => void }) => (
    <button type="button" onClick={onClick}
      style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: '1px solid var(--border-md)', color: 'var(--text-5)', cursor: 'pointer', flexShrink: 0 }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f87171'; (e.currentTarget as HTMLElement).style.borderColor = '#f87171'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-5)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-md)'; }}>
      <X size={11} />
    </button>
  );

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200 }} onClick={onClose} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 201,
        width: 700, background: 'var(--bg-card)', borderLeft: '1px solid var(--border-md)',
        display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,0.3)',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border-md)', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '1px 6px', fontWeight: 600 }}>FROM TEMPLATE</span>
              New Rule
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>
              {needsConfig
                ? '⚠ Select a group or agent before saving'
                : 'Template pre-filled — edit any field before saving'}
            </div>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 4 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; }}>
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

          <div style={{ marginBottom: 24 }}>
            <SectionHdr title="Basic Info" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 5 }}>Rule Name *</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Auto-escalate urgent tickets" style={INP} onFocus={fi} onBlur={fo} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 5 }}>Run Order</label>
                <input type="number" min={1} max={999} value={priorityOrder} onChange={e => setPriorityOrder(Number(e.target.value))} style={INP} onFocus={fi} onBlur={fo} />
                <p style={{ fontSize: 10, color: 'var(--text-5)', marginTop: 3 }}>Lower = runs first</p>
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 5 }}>Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                placeholder="What does this rule do?" style={{ ...INP, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} onFocus={fi} onBlur={fo} />
            </div>
            <div style={{ display: 'flex', gap: 24 }}>
              <Toggle value={isActive}       onChange={setIsActive}       label="Active" />
              <Toggle value={stopProcessing} onChange={setStopProcessing} label="Stop processing further rules after this fires" />
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <SectionHdr title="Trigger & Scope" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 5 }}>When</label>
                <select value={trigger} onChange={e => setTrigger(e.target.value)} style={{ ...INP, cursor: 'pointer' }} onFocus={fi} onBlur={fo}>
                  {Object.entries(TRIGGER_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 5 }}>Applies To</label>
                <select value={scopeType} onChange={e => { setScopeType(e.target.value as AutomationRule['scope_type']); setScopeOrgId(''); }} style={{ ...INP, cursor: 'pointer' }} onFocus={fi} onBlur={fo}>
                  <option value="all_orgs">All Organizations</option>
                  <option value="specific_org">Specific Organization</option>
                </select>
              </div>
            </div>
            {scopeType === 'specific_org' && (
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 5 }}>Organization</label>
                <select value={scopeOrgId} onChange={e => setScopeOrgId(e.target.value)} style={{ ...INP, cursor: 'pointer' }} onFocus={fi} onBlur={fo}>
                  <option value="">— Select organization —</option>
                  {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
            )}
          </div>

          <div style={{ marginBottom: 24 }}>
            <SectionHdr title="Conditions (IF)" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Match</span>
              {(['all', 'any'] as const).map(opt => (
                <button key={opt} type="button" onClick={() => setConditionMatch(opt)}
                  style={{ height: 26, padding: '0 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: conditionMatch === opt ? 'rgba(37,99,235,0.15)' : 'transparent', border: conditionMatch === opt ? '1px solid rgba(37,99,235,0.4)' : '1px solid var(--border-md)', color: conditionMatch === opt ? '#60a5fa' : 'var(--text-4)' }}>
                  {opt === 'all' ? 'ALL' : 'ANY'}
                </button>
              ))}
              <span style={{ fontSize: 12, color: 'var(--text-4)' }}>of the following conditions</span>
            </div>
            {conditions.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-5)', fontStyle: 'italic', marginBottom: 10 }}>
                No conditions — rule fires on every {TRIGGER_LABELS[trigger].toLowerCase()} event.
              </p>
            )}
            {conditions.map((cond, i) => {
              const fieldDef = FIELDS.find(f => f.key === cond.field) ?? FIELDS[0];
              const availOps = OPERATORS_FOR[fieldDef.type] ?? [];
              return (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                  <select value={cond.field}
                    onChange={e => {
                      const nfd = FIELDS.find(f => f.key === e.target.value)!;
                      updateCondition(i, { field: e.target.value, operator: OPERATORS_FOR[nfd.type][0], value: '' });
                    }}
                    style={{ ...SEL, width: 185 }} onFocus={fi} onBlur={fo}>
                    {FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                  <select value={cond.operator}
                    onChange={e => {
                      const nop = e.target.value;
                      updateCondition(i, { operator: nop, value: NO_VALUE_OPERATORS.has(nop) ? '' : cond.value });
                    }}
                    style={{ ...SEL, width: 175 }} onFocus={fi} onBlur={fo}>
                    {availOps.map(op => <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>)}
                  </select>
                  <div style={{ flex: 1 }}>{renderConditionValue(cond, i)}</div>
                  <XBtn onClick={() => removeCondition(i)} />
                </div>
              );
            })}
            <button type="button" onClick={addCondition}
              style={{ display: 'flex', alignItems: 'center', gap: 5, height: 28, padding: '0 12px', fontSize: 12, background: 'none', border: '1px dashed var(--border-md)', color: 'var(--text-4)', cursor: 'pointer', marginTop: 4 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--text-4)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-md)'; }}>
              <Plus size={11} /> Add Condition
            </button>
          </div>

          <div style={{ marginBottom: 8 }}>
            <SectionHdr title="Actions (THEN)" />
            {actions.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-5)', fontStyle: 'italic', marginBottom: 10 }}>
                Add at least one action to be executed when conditions match.
              </p>
            )}
            {actions.map((action, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                <select value={action.type}
                  onChange={e => updateAction(i, { type: e.target.value, value: '' })}
                  style={{ ...SEL, width: 185 }} onFocus={fi} onBlur={fo}>
                  {ACTIONS.map(a => <option key={a.type} value={a.type}>{a.label}</option>)}
                </select>
                <div style={{ flex: 1 }}>{renderActionValue(action, i)}</div>
                <XBtn onClick={() => removeAction(i)} />
              </div>
            ))}
            <button type="button" onClick={addAction}
              style={{ display: 'flex', alignItems: 'center', gap: 5, height: 28, padding: '0 12px', fontSize: 12, background: 'none', border: '1px dashed var(--border-md)', color: 'var(--text-4)', cursor: 'pointer', marginTop: 4 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--text-4)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-md)'; }}>
              <Plus size={11} /> Add Action
            </button>
          </div>
        </div>

        {/* Footer */}
        <div style={{ flexShrink: 0, padding: '14px 20px', borderTop: '1px solid var(--border-md)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#f87171' }}>
              <AlertCircle size={12} /> {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary gap-1.5" style={{ flex: 1, height: 34, fontSize: 12 }}
              onClick={handleSave} disabled={create.isPending || saved}>
              {create.isPending ? <><Loader2 size={11} className="animate-spin" /> Saving…</>
                : saved         ? <><Check size={11} /> Saved</>
                :                 <><Check size={11} /> Save Rule</>}
            </button>
            <button className="btn-secondary" style={{ height: 34, fontSize: 12, paddingLeft: 16, paddingRight: 16 }} onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PreBuiltRulesPage() {
  const router = useRouter();
  const { data: templates = [], isLoading } = useAutomationTemplates();
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [panelTemplate,  setPanelTemplate]  = useState<AutomationTemplate | null>(null);
  const [savedNames,     setSavedNames]     = useState<Set<string>>(new Set());

  const filtered = activeCategory === 'All'
    ? templates
    : templates.filter(t => t.category === activeCategory);

  function handleUse(t: AutomationTemplate) {
    setPanelTemplate(t);
  }

  function handleSaved(name: string) {
    setSavedNames(prev => new Set(prev).add(name));
    setPanelTemplate(null);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Header */}
      <div style={{ flexShrink: 0, padding: '10px 24px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => router.push('/settings')}
          style={{ color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; }}>
          <ArrowLeft size={14} />
        </button>
        <LayoutTemplate size={14} style={{ color: '#f59e0b' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Pre-Built Rules</span>
        <span style={{ fontSize: 12, color: 'var(--text-4)', marginLeft: 2 }}>— ready-to-use automation templates</span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            onClick={() => window.open('/settings/automation/instructions', '_blank')}
            style={{ display: 'flex', alignItems: 'center', gap: 5, height: 30, padding: '0 12px', fontSize: 12, background: 'none', border: '1px solid var(--border-md)', color: 'var(--text-3)', cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.background = 'none'; }}>
            <BookOpen size={12} /> Instructions <ChevronRight size={10} style={{ opacity: 0.5 }} />
          </button>
          <button
            onClick={() => router.push('/settings/automation/rules')}
            style={{ display: 'flex', alignItems: 'center', gap: 5, height: 30, padding: '0 12px', fontSize: 12, background: 'none', border: '1px solid var(--border-md)', color: 'var(--text-3)', cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.background = 'none'; }}>
            Custom Rules <ChevronRight size={10} style={{ opacity: 0.5 }} />
          </button>
        </div>
      </div>

      {/* Category tabs */}
      <div style={{ flexShrink: 0, display: 'flex', gap: 2, padding: '10px 24px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', overflowX: 'auto' }}>
        {TEMPLATE_CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              height: 28, padding: '0 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              background: activeCategory === cat ? 'rgba(37,99,235,0.15)' : 'transparent',
              border: activeCategory === cat ? '1px solid rgba(37,99,235,0.4)' : '1px solid transparent',
              color: activeCategory === cat ? '#60a5fa' : 'var(--text-4)',
            }}
            onMouseEnter={e => { if (activeCategory !== cat) (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; }}
            onMouseLeave={e => { if (activeCategory !== cat) (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <Loader2 size={24} className="animate-spin" style={{ color: '#2563eb' }} />
          </div>
        ) : filtered.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-5)', fontSize: 13, paddingTop: 60 }}>No templates in this category.</p>
        ) : (
          <div style={{ maxWidth: 1000, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {filtered.map(t => {
              const tc          = TRIGGER_COLORS[t.trigger] ?? { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' };
              const needsConfig = t.actions.some(a => ['set_group', 'set_assignee'].includes(a.type) && !a.value);
              const isSaved     = savedNames.has(t.name);

              return (
                <div
                  key={t.id}
                  style={{ padding: 16, background: 'var(--bg-surface)', border: `1px solid ${isSaved ? 'rgba(52,211,153,0.4)' : 'var(--border-md)'}`, display: 'flex', flexDirection: 'column', gap: 10, transition: 'border-color 0.1s' }}
                  onMouseEnter={e => { if (!isSaved) (e.currentTarget as HTMLElement).style.borderColor = 'rgba(37,99,235,0.35)'; }}
                  onMouseLeave={e => { if (!isSaved) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-md)'; }}
                >
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>{t.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-4)', lineHeight: 1.55 }}>{t.description}</div>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: tc.color, background: tc.bg, padding: '1px 7px' }}>
                      {TRIGGER_LABELS[t.trigger]}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-4)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', padding: '1px 7px' }}>
                      {t.conditions.length === 0 ? 'Always' : `${t.conditions.length} condition${t.conditions.length !== 1 ? 's' : ''}`}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-4)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', padding: '1px 7px' }}>
                      {t.actions.length} action{t.actions.length !== 1 ? 's' : ''}
                    </span>
                    {t.stop_processing && (
                      <span style={{ fontSize: 10, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '1px 5px' }}>Stop</span>
                    )}
                  </div>

                  {needsConfig && !isSaved && (
                    <div style={{ fontSize: 11, color: '#f59e0b', background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', padding: '4px 8px' }}>
                      ⚠ Select a group or agent after applying
                    </div>
                  )}

                  {isSaved ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, height: 30, fontSize: 12, fontWeight: 600, color: '#34d399', background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.25)' }}>
                      <Check size={11} /> Rule saved
                    </div>
                  ) : (
                    <button
                      onClick={() => handleUse(t)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, height: 30, fontSize: 12, fontWeight: 600, background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.3)', color: '#60a5fa', cursor: 'pointer', transition: 'background 0.12s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(37,99,235,0.2)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(37,99,235,0.1)'; }}
                    >
                      <Plus size={11} /> Use This Template
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Rule panel */}
      {panelTemplate && (
        <RulePanel
          prefill={{
            name:            panelTemplate.name,
            description:     panelTemplate.description,
            trigger:         panelTemplate.trigger,
            condition_match: panelTemplate.condition_match,
            conditions:      panelTemplate.conditions,
            actions:         panelTemplate.actions,
            stop_processing: panelTemplate.stop_processing,
            priority_order:  panelTemplate.priority_order,
            scope_type:      'all_orgs',
            is_active:       true,
          }}
          onClose={() => setPanelTemplate(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
