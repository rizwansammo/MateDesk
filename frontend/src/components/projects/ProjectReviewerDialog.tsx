'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { UserPlus } from 'lucide-react';
import { useAddProjectMember } from '@/hooks/useProjects';
import { useProjectReviewerCandidates } from '@/hooks/useProjectReviewers';
import { ProjectDialog, ProjectError, ProjectLoading } from './ProjectUI';

export function ProjectReviewerDialog({ projectId, clientOrgId, onClose }: {
  projectId: string; clientOrgId: string; onClose: () => void;
}) {
  const { data: candidates = [], isLoading, error, refetch } =
    useProjectReviewerCandidates(projectId, true);
  const add = useAddProjectMember(projectId);
  const [userId, setUserId] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId || add.isPending) return;
    try {
      await add.mutateAsync({ user_id: userId, role: 'client_reviewer' });
      onClose();
    } catch { /* Show API error in dialog. */ }
  }

  return (
    <ProjectDialog title="Add Client Reviewer" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {add.error && <ProjectError error={add.error} />}
        <p className="text-xs leading-5" style={{ color: 'var(--text-3)' }}>
          Choose an active user from this Client Organization. A reviewer can see
          published work and send feedback, but cannot access internal notes
          or change the project status.
        </p>
        {isLoading ? <ProjectLoading text="Finding client reviewers…" /> :
          error ? <ProjectError error={error} retry={() => { void refetch(); }} /> : (
            <div>
              <label className="label" htmlFor="reviewer-candidate">Client User</label>
              <select id="reviewer-candidate" className="select w-full"
                required value={userId} onChange={e => setUserId(e.target.value)}
                disabled={candidates.length === 0}>
                <option value="">Select a client user</option>
                {candidates.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.name} · {user.email}
                  </option>
                ))}
              </select>
              {!candidates.length && (
                <p className="mt-2 text-xs" style={{ color: 'var(--text-3)' }}>
                  No additional eligible client users are available.
                </p>
              )}
            </div>
          )}
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>
          Need to create an account?{' '}
          <Link href={`/settings/organizations/${clientOrgId}`}
            className="underline" style={{ color: 'var(--accent-info-fg)' }}>
            Manage Client Organization Users
          </Link>
        </p>
        <div className="flex justify-end gap-2 border-t pt-3"
          style={{ borderColor: 'var(--border-subtle)' }}>
          <button className="btn-secondary" type="button" onClick={onClose}
            disabled={add.isPending}>Cancel</button>
          <button className="btn-primary" type="submit"
            disabled={!userId || add.isPending || isLoading}>
            <UserPlus size={13} /> {add.isPending ? 'Adding…' : 'Grant Reviewer Access'}
          </button>
        </div>
      </form>
    </ProjectDialog>
  );
}