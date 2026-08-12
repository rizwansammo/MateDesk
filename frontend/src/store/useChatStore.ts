'use client';

import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  senderId: string;
  senderType?: 'user' | 'agent';
  body: string;
  createdAt: string;
}

export interface ChatWindow {
  id: string;               // 'dm_{userId}' | 'support_{sessionId}'
  type: 'dm' | 'support';
  partnerId?: string;       // userId for DMs
  sessionId?: string;       // for support sessions
  partnerName: string;
  messages: ChatMessage[];
  minimized: boolean;
  unread: number;
  sessionStatus?: 'waiting' | 'active' | 'ended';
}

const MAX_WINDOWS = 4;

export interface IncomingSession {
  id:            string;
  sessionNumber: string;
  userId:        string;
  userName:      string;
  body:          string;
}

interface ChatStore {
  windows:            ChatWindow[];
  onlineUsers:        Set<string>;
  dmUnreadTotal:      number;
  supportUnreadTotal: number;
  incomingQueue:      IncomingSession[];
  dismissedSessions:  Set<string>;

  openDMWindow:             (userId: string, partnerName: string) => void;
  openSupportWindow:        (sessionId: string, partnerName?: string, status?: ChatWindow['sessionStatus']) => void;
  openPendingSupportWindow: (firstMsg: ChatMessage) => void;
  resolvePendingSupport:    (sessionId: string) => boolean;
  closeWindow:              (windowId: string) => void;
  toggleMinimize:           (windowId: string) => void;
  appendMessage:            (windowId: string, msg: ChatMessage) => void;
  markWindowRead:           (windowId: string) => void;
  setWindowStatus:          (windowId: string, status: ChatWindow['sessionStatus']) => void;
  setUserOnline:      (userId: string) => void;
  setUserOffline:     (userId: string) => void;
  setOnlineSnapshot:  (userIds: string[]) => void;
  incDMUnread:        () => void;
  clearDMUnread:      () => void;
  incSupportUnread:   () => void;
  clearSupportUnread: () => void;
  addIncoming:        (session: IncomingSession) => void;
  removeIncoming:     (sessionId: string) => void;
  dismissIncoming:    (sessionId: string) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  windows:            [],
  onlineUsers:        new Set(),
  dmUnreadTotal:      0,
  supportUnreadTotal: 0,
  incomingQueue:      [],
  dismissedSessions:  new Set(),

  openDMWindow: (userId, partnerName) => set((s) => {
    const id  = `dm_${userId}`;
    const hit = s.windows.find((w) => w.id === id);
    if (hit) {
      return { windows: s.windows.map((w) => w.id === id ? { ...w, minimized: false } : w) };
    }
    const next: ChatWindow = {
      id, type: 'dm', partnerId: userId, partnerName,
      messages: [], minimized: false, unread: 0,
    };
    const trimmed = s.windows.length >= MAX_WINDOWS ? s.windows.slice(1) : s.windows;
    return { windows: [...trimmed, next] };
  }),

  openSupportWindow: (sessionId, partnerName = 'Support Agent', status = 'waiting') => set((s) => {
    const id  = `support_${sessionId}`;
    const hit = s.windows.find((w) => w.id === id);
    if (hit) {
      return { windows: s.windows.map((w) => w.id === id ? { ...w, minimized: false } : w) };
    }
    const next: ChatWindow = {
      id, type: 'support', sessionId, partnerName,
      messages: [], minimized: false, unread: 0, sessionStatus: status,
    };
    const trimmed = s.windows.length >= MAX_WINDOWS ? s.windows.slice(1) : s.windows;
    return { windows: [...trimmed, next] };
  }),

  openPendingSupportWindow: (firstMsg) => set((s) => {
    const existing = s.windows.find((w) => w.id === 'support_pending');
    if (existing) {
      return { windows: s.windows.map((w) =>
        w.id === 'support_pending' ? { ...w, minimized: false, messages: [firstMsg] } : w
      )};
    }
    const next: ChatWindow = {
      id: 'support_pending', type: 'support', sessionId: undefined,
      partnerName: 'Support Agent', messages: [firstMsg],
      minimized: false, unread: 0, sessionStatus: 'waiting',
    };
    const trimmed = s.windows.length >= MAX_WINDOWS ? s.windows.slice(1) : s.windows;
    return { windows: [...trimmed, next] };
  }),

  resolvePendingSupport: (sessionId) => {
    let found = false;
    set((s) => {
      const idx = s.windows.findIndex((w) => w.id === 'support_pending');
      if (idx === -1) return {};
      found = true;
      const updated = [...s.windows];
      updated[idx] = { ...updated[idx], id: `support_${sessionId}`, sessionId };
      return { windows: updated };
    });
    return found;
  },

  closeWindow: (windowId) => set((s) => ({
    windows: s.windows.filter((w) => w.id !== windowId),
  })),

  toggleMinimize: (windowId) => set((s) => ({
    windows: s.windows.map((w) => w.id === windowId ? { ...w, minimized: !w.minimized } : w),
  })),

  appendMessage: (windowId, msg) => set((s) => ({
    windows: s.windows.map((w) =>
      w.id === windowId
        ? { ...w, messages: [...w.messages, msg] }
        : w
    ),
  })),

  markWindowRead: (windowId) => set((s) => ({
    windows: s.windows.map((w) => w.id === windowId ? { ...w, unread: 0 } : w),
  })),

  setWindowStatus: (windowId, status) => set((s) => ({
    windows: s.windows.map((w) =>
      w.id === windowId ? { ...w, sessionStatus: status } : w
    ),
  })),

  setUserOnline:  (userId) => set((s) => ({ onlineUsers: new Set([...s.onlineUsers, userId]) })),
  setUserOffline: (userId) => set((s) => {
    const next = new Set(s.onlineUsers);
    next.delete(userId);
    return { onlineUsers: next };
  }),
  setOnlineSnapshot: (userIds) => set({ onlineUsers: new Set(userIds) }),

  incDMUnread:        () => set((s) => ({ dmUnreadTotal: s.dmUnreadTotal + 1 })),
  clearDMUnread:      () => set({ dmUnreadTotal: 0 }),
  incSupportUnread:   () => set((s) => ({ supportUnreadTotal: s.supportUnreadTotal + 1 })),
  clearSupportUnread: () => set({ supportUnreadTotal: 0 }),

  addIncoming: (session) => set((s) => {
    if (s.incomingQueue.some((q) => q.id === session.id)) return {};
    return { incomingQueue: [...s.incomingQueue, session] };
  }),
  removeIncoming: (sessionId) => set((s) => ({
    incomingQueue: s.incomingQueue.filter((q) => q.id !== sessionId),
  })),
  dismissIncoming: (sessionId) => set((s) => ({
    dismissedSessions: new Set([...s.dismissedSessions, sessionId]),
  })),
}));
