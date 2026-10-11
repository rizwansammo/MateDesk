'use client';

import { useState, type FormEvent } from 'react';
import { CheckCircle2, Mail, Send } from 'lucide-react';
import { ProjectDialog, ProjectError } from './ProjectUI';
import {
  useWorkItemEmailNotifications, useSendWorkItemNotification,
} from '@/hooks/useProjectEmails';

export function ProjectEmailDialog({ workItemId, onClose }: {
  workItemId: string; onClose: () => void;
}) {
  const { data, isLoading, error, refetch } = useWorkItemEmailNotifications(workItemId, true);
  const send = useSendWorkItemNotification(workItemId);
  const [recipientId, setRecipientId] = useState('');
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const selected = data?.reviewers.find(reviewer => reviewer.id === recipientId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || send.isPending || sent) return;
    try {
      await send.mutateAsync({
        recipient_id: recipientId, note: note.trim(), idempotency_key: requestKey,
      });
      setSent(true);
    } catch {
      // Keep the request key on a failed response so an accidental retry
      // cannot send twice; a fresh attempt requires an explicit new key.
    }
  }

  return (
    <ProjectDialog title="Notify Client" onClose={onClose}>
      {isLoading ? (
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>Loading client reviewers…</p>
      ) : error ? (
        <ProjectError error={error} retry={() => { void refetch(); }} />
      ) : sent ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 size={28} style={{ color: 'var(--accent-ok-fg)' }} />
          <strong className="text-sm" style={{ color: 'var(--text-0)' }}>Notification sent</strong>
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>
            The client can reply to the email to comment on this Work Item.
          </p>
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      ) : (
        <form className="space-y-3" onSubmit={submit}>
          {send.error && <ProjectError error={send.error} />}
          <p className="text-xs leading-5" style={{ color: 'var(--text-3)' }}>
            Send this Work Item update to an authorized Client Reviewer.
            Their email reply will become a client visible comment.
            An email reply does not approve the Work Item.
          </p>
          <div>
            <label className="label" htmlFor="email-reviewer">Client Reviewer</label>
            <select id="email-reviewer" className="select w-full" required
              value={recipientId} onChange={e => setRecipientId(e.target.value)}>
              <option value="">Select reviewer</option>
              {data?.reviewers.map(reviewer => (
                <option key={reviewer.id} value={reviewer.id}>
                  {reviewer.name} ({reviewer.email})
                </option>
              ))}
            </select>
            {data?.reviewers.length === 0 && (
              <p className="mt-2 text-xs" style={{ color: 'var(--text-3)' }}>
                No Client Reviewer is assigned to this Project. Add an authorized
                client member to enable notifications.
              </p>
            )}
          </div>
          <div>
            <label className="label" htmlFor="notification-note">Update Message</label>
            <textarea id="notification-note" className="input min-h-[110px] resize-y"
              value={note} maxLength={2000}
              onChange={e => setNote(e.target.value)}
              placeholder="Write a short update or request feedback…" />
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" type="button" onClick={onClose}
              disabled={send.isPending}>Cancel</button>
            <button className="btn-primary" type="submit"
              disabled={send.isPending || !selected}>
              <Send size={13} /> {send.isPending ? 'Sending…' : 'Send Notification'}
            </button>
          </div>
          {send.isError && (
            <button type="button" className="text-xs underline"
              style={{ color: 'var(--text-3)' }} onClick={() => {
                setRequestKey(crypto.randomUUID());
                send.reset();
              }}>
              Start a new send attempt
            </button>
          )}
          {(data?.notifications.length ?? 0) > 0 && (
            <div className="border-t pt-3" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold"
                style={{ color: 'var(--text-2)' }}><Mail size={13} /> Recent Notifications</div>
              {data?.notifications.slice(0, 5).map(notification => (
                <div key={notification.id} className="flex justify-between gap-2 py-1 text-xs">
                  <span className="truncate" style={{ color: 'var(--text-3)' }}>
                    {notification.recipient}
                  </span>
                  <span style={{ color: notification.status === 'sent'
                    ? 'var(--accent-ok-fg)' : 'var(--text-3)' }}>
                    {notification.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </form>
      )}
    </ProjectDialog>
  );
}
