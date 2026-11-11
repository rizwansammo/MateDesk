'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Bell, ChevronLeft, ChevronRight, MessageSquare, RefreshCw, Send } from 'lucide-react';
import type { Project } from '@/types/projects';
import {
  useProjectConversation, useSendProjectMessage, type MessageVisibility,
} from '@/hooks/useProjectCommunication';
import { ProjectError, ProjectLoading } from './ProjectUI';

const when = (value: string) => new Date(value).toLocaleString();

export function ProjectConversationPanel({ project }: { project: Project }) {
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState('');
  const [visibility, setVisibility] = useState<MessageVisibility>('internal');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const conversation = useProjectConversation(project.id, page);
  const send = useSendProjectMessage(project.id);
  const isClient = project.my_role === 'client_reviewer';
  const canPost = project.status !== 'archived' && (isClient || project.can_edit);
  const canPublish = project.can_manage && project.visibility === 'client';
  const choice = isClient ? 'client' : canPublish ? visibility : 'internal';
  const totalPages = Math.max(1, Math.ceil((conversation.data?.count || 0) / 25));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = message.trim();
    if (!body || !canPost || send.isPending) return;
    const id = requestId || crypto.randomUUID();
    setRequestId(id);
    setNotice('');
    try {
      await send.mutateAsync({ body, visibility: choice, request_id: id });
      setMessage('');
      setRequestId(null);
      setNotice('Message posted.');
      setPage(1);
    } catch {
      // Keep request_id and message for safe retry with the same payload.
    }
  }

  return <section className="panel w-full min-w-0">
    <div className="panel-header flex-wrap gap-2">
      <div>
        <h2 className="panel-title inline-flex items-center gap-2"><MessageSquare size={15}/> Project Conversation</h2>
        <p className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
          Discuss project progress. Messages are not Scope or Delivery approvals.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Link className="btn-secondary inline-flex items-center gap-1 text-xs" href="/projects/notifications">
          <Bell size={14}/> Notifications
        </Link>
        <button type="button" className="icon-btn" aria-label="Refresh conversation"
          onClick={() => void conversation.refetch()}><RefreshCw size={14}/></button>
      </div>
    </div>
    {send.isError && <div className="p-3"><ProjectError error={send.error}/></div>}
    {notice && <p role="status" className="p-3 text-xs" style={{ color: 'var(--accent-ok-fg)' }}>{notice}</p>}
    {canPost && <form onSubmit={submit} className="space-y-2 border-b p-3"
      style={{ borderColor: 'var(--border-subtle)' }}>
      <label htmlFor="project-conversation-message" className="label">New Message</label>
      <textarea id="project-conversation-message" className="input min-h-[105px] w-full"
        value={message} maxLength={5000} rows={4} placeholder="Write a project update or question"
        onChange={e => { setMessage(e.target.value); setRequestId(null); setNotice(''); }}/>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>
          {isClient ? 'Shared with the project team' : canPublish ? (
            <select className="select" aria-label="Message visibility" value={visibility}
              disabled={send.isPending} onChange={e => { setVisibility(e.target.value as MessageVisibility); setRequestId(null); }}>
              <option value="internal">Staff Only</option>
              <option value="client">Shared With Client</option>
            </select>
          ) : 'Staff Only'}
        </div>
        <button type="submit" className="btn-primary inline-flex items-center gap-1"
          disabled={!message.trim() || send.isPending}><Send size={13}/>
          {send.isPending ? 'Posting…' : 'Post Message'}
        </button>
      </div>
    </form>}
    {project.status === 'archived' && <p className="p-3 text-xs" style={{ color: 'var(--text-3)' }}>
      Archived project messages are read only.
    </p>}
    {conversation.isLoading ? <ProjectLoading text="Loading conversation…"/> :
      conversation.isError ? <div className="p-3"><ProjectError error={conversation.error}
        retry={() => void conversation.refetch()}/></div> :
      !conversation.data?.results.length ? <p className="p-8 text-center text-xs"
        style={{ color: 'var(--text-3)' }}>No messages on this page.</p> :
      <ol className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
        {conversation.data.results.map(item => <li key={item.id} className="space-y-2 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>
              {item.author}{item.is_mine ? ' · You' : ''}
            </span>
            <time className="text-[11px]" dateTime={item.created_at}
              style={{ color: 'var(--text-3)' }}>{when(item.created_at)}</time>
          </div>
          <p className="whitespace-pre-wrap break-words text-sm" style={{ color: 'var(--text-1)' }}>
            {item.body}
          </p>
          {!isClient && <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
            {item.visibility === 'client' ? 'Shared With Client' : 'Staff Only'}
          </span>}
        </li>)}
      </ol>}
    {totalPages > 1 && <div className="flex items-center justify-between border-t p-3 text-xs"
      style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-3)' }}>
      <span>Page {page} of {totalPages}</span>
      <div className="flex gap-2">
        <button className="icon-btn" aria-label="Previous conversation page" disabled={page === 1}
          onClick={() => setPage(n => n - 1)}><ChevronLeft size={14}/></button>
        <button className="icon-btn" aria-label="Next conversation page" disabled={page >= totalPages}
          onClick={() => setPage(n => n + 1)}><ChevronRight size={14}/></button>
      </div>
    </div>}
  </section>;
}
