'use client';

import { useProjectAgentPermissions, useSetProjectAgentPermission } from '@/hooks/useProjectRequests';
import { ProjectDialog } from '@/components/projects/ProjectUI';

export function AgentProjectAccessDialog({ onClose }: { onClose: () => void }) {
  const { data: agents = [], isLoading, error, refetch } = useProjectAgentPermissions(true);
  const update = useSetProjectAgentPermission();

  return (
    <ProjectDialog title="Agent Project Access" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>
          Choose which Agents can create Projects and convert their assigned, approved Project Requests.
          Agents without permission can still review their assigned requests.
        </p>
        {isLoading && <p className="text-xs" style={{ color: 'var(--text-3)' }}>Loading agents…</p>}
        {error && <p role="alert" className="text-xs" style={{ color: 'var(--accent-danger-fg)' }}>
          {error instanceof Error ? error.message : 'Unable to load agents'}
          <button className="ml-2 underline" onClick={() => { void refetch(); }}>Retry</button>
        </p>}
        {update.error && <p role="alert" className="text-xs" style={{ color: 'var(--accent-danger-fg)' }}>
          {update.error.message}
        </p>}
        {!isLoading && agents.length === 0 && <p className="text-xs" style={{ color: 'var(--text-3)' }}>
          No active MSP Agents in this workspace.
        </p>}
        <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
          {agents.map(agent => (
            <div key={agent.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{agent.name}</div>
                <div className="truncate text-xs" style={{ color: 'var(--text-3)' }}>{agent.email}</div>
              </div>
              <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs" style={{ color: 'var(--text-2)' }}>
                <input aria-label={'Allow ' + agent.name + ' to create projects'}
                  type="checkbox" checked={agent.can_create_projects} disabled={update.isPending}
                  onChange={event => update.mutate({
                    id: agent.id, can_create_projects: event.target.checked,
                  })}/>
                Project Create
              </label>
            </div>
          ))}
        </div>
        <div className="flex justify-end border-t pt-3" style={{ borderColor: 'var(--border-subtle)' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </ProjectDialog>
  );
}
