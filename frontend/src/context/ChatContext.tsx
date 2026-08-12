'use client';

import React, {
  createContext, useCallback, useContext, useEffect, useRef,
} from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore, ChatMessage } from '@/store/useChatStore';
import { apiFetch } from '@/lib/api';

// ── WS URL helper ─────────────────────────────────────────────────────────────

function buildWsUrl(path: string, token: string): string {
  const api = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');
  let base: string;
  if (api) {
    base = api.replace(/^http/, 'ws');
  } else {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    base = `${proto}//${window.location.host}`;
  }
  return `${base}${path}?token=${encodeURIComponent(token)}`;
}

// ── Context type ──────────────────────────────────────────────────────────────

interface ChatContextValue {
  isConnected:        boolean;
  isSupportConnected: boolean;
  openDM:             (userId: string, partnerName: string) => void;
  sendDM:             (recipientId: string, body: string) => void;
  markDMRead:         (senderId: string) => void;
  startSupport:       (body: string) => void;
  acceptSupport:      (sessionId: string) => void;
  dismissSupport:     (sessionId: string) => void;
  initiateSupport:    (userId: string, userName: string) => void;
  acceptInitiation:   (sessionId: string) => void;
  sendSupportMessage: (sessionId: string, body: string) => void;
  requestEndSession:  (sessionId: string) => void;
  declineEndSession:  (sessionId: string) => void;
  confirmEndSession:  (sessionId: string) => void;
  forceEndSession:    (sessionId: string) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS  = 30_000;

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const accessToken    = useAuthStore((s) => s.accessToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const chatWsRef      = useRef<WebSocket | null>(null);
  const supportWsRef   = useRef<WebSocket | null>(null);
  const chatRetryRef   = useRef(0);
  const supportRetryRef = useRef(0);
  const unmountedRef   = useRef(false);
  const pendingInitiationNames = useRef<Map<string, string>>(new Map());

  const connectedRef   = useRef(false);
  const supConnRef     = useRef(false);

  // Force-re-render for connected state
  const [, rerender] = React.useState(0);
  const bump = useCallback(() => rerender((n) => n + 1), []);

  const store = useChatStore.getState;

  // ── Chat WS (DM + presence) ───────────────────────────────────────────────

  const connectChat = useCallback(() => {
    if (unmountedRef.current || !accessToken) return;

    const url = buildWsUrl('/ws/chat/', accessToken);
    const ws  = new WebSocket(url);
    chatWsRef.current = ws;

    ws.onopen = () => {
      chatRetryRef.current = 0;
      connectedRef.current = true;
      bump();
    };

    ws.onmessage = (e) => {
      let data: Record<string, unknown>;
      try { data = JSON.parse(e.data); } catch { return; }

      const s = useChatStore.getState();

      switch (data.type) {
        case 'presence_snapshot': {
          const ids = (data.online_users as string[]) ?? [];
          s.setOnlineSnapshot(ids);
          break;
        }
        case 'chat.presence': {
          if (data.online) s.setUserOnline(data.user_id as string);
          else              s.setUserOffline(data.user_id as string);
          break;
        }
        case 'chat.dm': {
          const msg = data.message as {
            id: string; sender_id: string; recipient_id: string;
            body: string; created_at: string;
          };
          const myId    = useAuthStore.getState().user?.id;
          const partner = msg.sender_id === myId ? msg.recipient_id : msg.sender_id;
          const winId   = `dm_${partner}`;
          const win     = useChatStore.getState().windows.find((w) => w.id === winId);
          const chatMsg: ChatMessage = {
            id: msg.id, senderId: msg.sender_id,
            body: msg.body, createdAt: msg.created_at,
          };
          if (win) {
            s.appendMessage(winId, chatMsg);
            if (msg.sender_id !== myId && !win.minimized) {
              // window is open, mark read immediately via WS
              ws.send(JSON.stringify({ type: 'dm_read', sender_id: msg.sender_id }));
            } else if (msg.sender_id !== myId) {
              useChatStore.setState((prev) => ({
                windows: prev.windows.map((w) =>
                  w.id === winId ? { ...w, unread: w.unread + 1 } : w
                ),
              }));
              s.incDMUnread();
            }
          } else if (msg.sender_id !== myId) {
            s.incDMUnread();
          }
          break;
        }
        case 'chat.dm_read': {
          // partner read our messages — no local action needed
          break;
        }
      }
    };

    ws.onclose = () => {
      connectedRef.current = false;
      bump();
      if (unmountedRef.current) return;
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** chatRetryRef.current, RECONNECT_MAX_MS);
      chatRetryRef.current += 1;
      setTimeout(connectChat, delay);
    };

    ws.onerror = () => ws.close();
  }, [accessToken, bump]);

  // ── Support WS ────────────────────────────────────────────────────────────

  const connectSupport = useCallback(() => {
    if (unmountedRef.current || !accessToken) return;

    const url = buildWsUrl('/ws/support/', accessToken);
    const ws  = new WebSocket(url);
    supportWsRef.current = ws;

    ws.onopen = () => {
      supportRetryRef.current = 0;
      supConnRef.current = true;
      bump();
    };

    ws.onmessage = (e) => {
      let data: Record<string, unknown>;
      try { data = JSON.parse(e.data); } catch { return; }

      const s = useChatStore.getState();

      switch (data.type) {
        case 'support_started': {
          const sessionId = data.session_id as string;
          const resolved = useChatStore.getState().resolvePendingSupport(sessionId);
          if (!resolved) {
            // No pending window (e.g. page refreshed mid-flight) — open fresh
            s.openSupportWindow(sessionId, 'Support Agent', 'waiting');
            const fm = data.first_message as { id: string; body: string; created_at: string } | undefined;
            if (fm) {
              const myId = useAuthStore.getState().user?.id ?? '';
              s.appendMessage(`support_${sessionId}`, {
                id: fm.id, senderId: myId, senderType: 'user',
                body: fm.body, createdAt: fm.created_at,
              });
            }
          }
          // If resolved, pending window already has the optimistic message — keep it.
          break;
        }
        case 'support.session_active': {
          const winId = `support_${data.session_id}`;
          s.setWindowStatus(winId, 'active');
          break;
        }
        case 'support.message': {
          const msg = data.message as {
            id: string; sender_id: string; sender_type: 'user' | 'agent';
            body: string; created_at: string;
          };
          const winId = `support_${data.session_id}`;
          const win   = s.windows.find((w) => w.id === winId);
          const chatMsg: ChatMessage = {
            id: msg.id, senderId: msg.sender_id, senderType: msg.sender_type,
            body: msg.body, createdAt: msg.created_at,
          };
          if (win) {
            s.appendMessage(winId, chatMsg);
            const myId = useAuthStore.getState().user?.id;
            if (msg.sender_id !== myId) {
              useChatStore.setState((prev) => ({
                windows: prev.windows.map((w) =>
                  w.id === winId ? { ...w, unread: w.unread + 1 } : w
                ),
              }));
              s.incSupportUnread();
            }
          }
          break;
        }
        case 'support.end_request': {
          const winId = `support_${data.session_id}`;
          // Surface the end-request as a system message in the chat window
          s.appendMessage(winId, {
            id: `sys_${Date.now()}`,
            senderId: 'system',
            body: '__END_REQUEST__',
            createdAt: new Date().toISOString(),
          });
          break;
        }
        case 'support.session_ended': {
          const winId = `support_${data.session_id}`;
          s.setWindowStatus(winId, 'ended');
          break;
        }
        case 'support.end_declined': {
          // User declined — append a system marker so agent's ChatBar can reset its "Requested" state
          s.appendMessage(`support_${data.session_id}`, {
            id: `sys_${Date.now()}`,
            senderId: 'system',
            body: '__END_DECLINED__',
            createdAt: new Date().toISOString(),
          });
          break;
        }
        case 'support.agent_initiation': {
          // Agent wants to start a support session with this user
          s.openSupportWindow(data.session_id as string, 'Support Agent', 'waiting');
          s.appendMessage(`support_${data.session_id}`, {
            id: `sys_${Date.now()}`,
            senderId: 'system',
            body: '__AGENT_INITIATION__',
            createdAt: new Date().toISOString(),
          });
          break;
        }
        case 'support.queue_entry': {
          const sess = data.session as {
            id: string; session_number: string;
            user_id: string; user_name: string; body: string;
          };
          useChatStore.getState().addIncoming({
            id: sess.id, sessionNumber: sess.session_number,
            userId: sess.user_id, userName: sess.user_name || 'User',
            body: sess.body,
          });
          break;
        }
        case 'support.accepted': {
          // Another agent accepted — remove from incoming queue
          useChatStore.getState().removeIncoming(data.session_id as string);
          break;
        }
        case 'initiation_sent': {
          // Backend confirmed agent-initiated session was created; open window for agent
          const sessionId = data.session_id as string;
          const userId = data.user_id as string | undefined;
          const userName = (userId ? pendingInitiationNames.current.get(userId) : undefined) ?? 'User';
          if (userId) pendingInitiationNames.current.delete(userId);
          useChatStore.getState().openSupportWindow(sessionId, userName, 'waiting');
          break;
        }
      }
    };

    ws.onclose = () => {
      supConnRef.current = false;
      bump();
      if (unmountedRef.current) return;
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** supportRetryRef.current, RECONNECT_MAX_MS);
      supportRetryRef.current += 1;
      setTimeout(connectSupport, delay);
    };

    ws.onerror = () => ws.close();
  }, [accessToken, bump]);

  // ── Connect / disconnect on auth change ───────────────────────────────────

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;

    unmountedRef.current = false;
    connectChat();
    connectSupport();

    return () => {
      unmountedRef.current = true;
      chatWsRef.current?.close();
      supportWsRef.current?.close();
    };
  }, [isAuthenticated, accessToken, connectChat, connectSupport]);

  // ── Send helpers ──────────────────────────────────────────────────────────

  const sendChat    = useCallback((payload: object) => {
    if (chatWsRef.current?.readyState === WebSocket.OPEN) {
      chatWsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const sendSupport = useCallback((payload: object) => {
    if (supportWsRef.current?.readyState === WebSocket.OPEN) {
      supportWsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  // ── Public API ────────────────────────────────────────────────────────────

  const openDM = useCallback((userId: string, partnerName: string) => {
    useChatStore.getState().openDMWindow(userId, partnerName);
  }, []);

  const sendDM = useCallback((recipientId: string, body: string) => {
    sendChat({ type: 'dm', recipient_id: recipientId, body });
  }, [sendChat]);

  const markDMRead = useCallback((senderId: string) => {
    sendChat({ type: 'dm_read', sender_id: senderId });
    useChatStore.getState().markWindowRead(`dm_${senderId}`);
  }, [sendChat]);

  const startSupport = useCallback((body: string) => {
    sendSupport({ type: 'start_support', body });
    const myId = useAuthStore.getState().user?.id ?? '';
    useChatStore.getState().openPendingSupportWindow({
      id: `pending_${Date.now()}`,
      senderId: myId,
      senderType: 'user',
      body,
      createdAt: new Date().toISOString(),
    });
  }, [sendSupport]);

  const acceptSupport = useCallback((sessionId: string) => {
    sendSupport({ type: 'accept_support', session_id: sessionId });
    const s = useChatStore.getState();
    const incoming = s.incomingQueue.find((q) => q.id === sessionId);
    s.openSupportWindow(sessionId, incoming?.userName ?? 'User', 'active');
    s.removeIncoming(sessionId);
    // Load pre-acceptance messages (e.g. user's first message sent while waiting)
    apiFetch<{ id: string; sender_id: string; sender_type: 'user' | 'agent'; body: string; created_at: string }[]>(
      `/api/chat/support/sessions/${sessionId}/messages/`
    ).then((msgs) => {
      const winId = `support_${sessionId}`;
      msgs.forEach((msg) => {
        useChatStore.getState().appendMessage(winId, {
          id: msg.id, senderId: msg.sender_id, senderType: msg.sender_type,
          body: msg.body, createdAt: msg.created_at,
        });
      });
    }).catch(() => {});
  }, [sendSupport]);

  const dismissSupport = useCallback((sessionId: string) => {
    sendSupport({ type: 'dismiss_support', session_id: sessionId });
  }, [sendSupport]);

  const initiateSupport = useCallback((userId: string, userName: string) => {
    pendingInitiationNames.current.set(userId, userName);
    sendSupport({ type: 'initiate_support', user_id: userId });
  }, [sendSupport]);

  const acceptInitiation = useCallback((sessionId: string) => {
    sendSupport({ type: 'accept_initiation', session_id: sessionId });
  }, [sendSupport]);

  const sendSupportMessage = useCallback((sessionId: string, body: string) => {
    sendSupport({ type: 'message', session_id: sessionId, body });
  }, [sendSupport]);

  const requestEndSession = useCallback((sessionId: string) => {
    sendSupport({ type: 'end_support', session_id: sessionId });
  }, [sendSupport]);

  const declineEndSession = useCallback((sessionId: string) => {
    sendSupport({ type: 'decline_end', session_id: sessionId });
  }, [sendSupport]);

  const confirmEndSession = useCallback((sessionId: string) => {
    sendSupport({ type: 'confirm_end', session_id: sessionId });
    useChatStore.getState().setWindowStatus(`support_${sessionId}`, 'ended');
  }, [sendSupport]);

  const forceEndSession = useCallback((sessionId: string) => {
    sendSupport({ type: 'force_end', session_id: sessionId });
  }, [sendSupport]);

  const value: ChatContextValue = {
    isConnected:        connectedRef.current,
    isSupportConnected: supConnRef.current,
    openDM,
    sendDM,
    markDMRead,
    startSupport,
    acceptSupport,
    dismissSupport,
    initiateSupport,
    acceptInitiation,
    sendSupportMessage,
    requestEndSession,
    declineEndSession,
    confirmEndSession,
    forceEndSession,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used inside ChatProvider');
  return ctx;
}
