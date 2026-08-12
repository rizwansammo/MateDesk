'use client';

import React from 'react';
import { useChatStore } from '@/store/useChatStore';
import { ChatBar } from './ChatBar';
import { AgentIncomingPopup } from './AgentIncomingPopup';

export function ChatBarContainer() {
  const windows = useChatStore((s) => s.windows);

  return (
    <>
      {windows.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            right: 16,
            display: 'flex',
            alignItems: 'flex-end',
            gap: 8,
            zIndex: 1000,
            pointerEvents: 'none',
          }}
        >
          {windows.map((win) => (
            <div key={win.id} style={{ pointerEvents: 'auto' }}>
              <ChatBar win={win} />
            </div>
          ))}
        </div>
      )}
      <AgentIncomingPopup />
    </>
  );
}
