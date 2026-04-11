'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  ChevronRight,
  Send,
} from 'lucide-react';
import clsx from 'clsx';
import type { ChatMessage } from '@/lib/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum characters allowed per chat message (Requirement 13.5) */
const MAX_MESSAGE_LENGTH = 200;

// ---------------------------------------------------------------------------
// Slot badge colors matching LobbyView
// ---------------------------------------------------------------------------

const SLOT_STYLES: Record<string, string> = {
  P1: 'text-blue-400 bg-blue-400/15',
  P2: 'text-red-400 bg-red-400/15',
  P3: 'text-green-400 bg-green-400/15',
  P4: 'text-yellow-400 bg-yellow-400/15',
  Spectator: 'text-muted bg-bg-hover',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

function slotLabel(slot: string): string {
  // Normalise: the server may send "1", "2", etc. or "P1", "Spectator"
  if (/^\d$/.test(slot)) return `P${slot}`;
  return slot;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ChatPanel({
  messages,
  onSendMessage,
  isCollapsed,
  onToggleCollapse,
}: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(messages.length);

  // Track unread messages when collapsed
  useEffect(() => {
    const newCount = messages.length - prevMessageCountRef.current;
    if (isCollapsed && newCount > 0) {
      setUnreadCount((c) => c + newCount);
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length, isCollapsed]);

  // Clear unread when expanded
  useEffect(() => {
    if (!isCollapsed) {
      setUnreadCount(0);
    }
  }, [isCollapsed]);

  // Auto-scroll to bottom on new messages when expanded
  useEffect(() => {
    if (!isCollapsed) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isCollapsed]);

  const handleSend = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    // Truncate to 200 characters (Requirement 13.5)
    onSendMessage(trimmed.slice(0, MAX_MESSAGE_LENGTH));
    setDraft('');
  }, [draft, onSendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
      // Stop game input propagation while typing
      e.stopPropagation();
    },
    [handleSend],
  );

  // ---- Collapsed state ----
  if (isCollapsed) {
    return (
      <button
        onClick={onToggleCollapse}
        className="relative flex items-center justify-center w-10 h-10 rounded-lg bg-bg-card border border-border text-muted hover:text-white hover:bg-bg-hover transition"
        title="展开聊天"
      >
        <MessageSquare size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[10px] font-bold">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
    );
  }

  // ---- Expanded state ----
  return (
    <div className="flex flex-col w-72 max-w-[90vw] h-full bg-bg-card border-l border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <span className="text-xs font-bold flex items-center gap-1.5">
          <MessageSquare size={13} />
          聊天
        </span>
        <button
          onClick={onToggleCollapse}
          className="p-1 rounded-lg text-muted hover:text-white hover:bg-bg-hover transition"
          title="收起聊天"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0">
        {messages.length === 0 && (
          <p className="text-[10px] text-muted text-center py-4">
            暂无消息，发送第一条吧！
          </p>
        )}

        {messages.map((msg, i) => {
          const label = slotLabel(msg.slot);
          const style = SLOT_STYLES[label] ?? SLOT_STYLES.Spectator;

          return (
            <div key={`${msg.timestamp}-${i}`} className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span
                  className={clsx(
                    'px-1.5 py-0.5 rounded text-[10px] font-bold leading-none',
                    style,
                  )}
                >
                  {label}
                </span>
                <span className="text-xs font-semibold truncate max-w-[120px]">
                  {msg.senderName}
                </span>
                <span className="text-[10px] text-muted ml-auto shrink-0">
                  {formatTimestamp(msg.timestamp)}
                </span>
              </div>
              <p className="text-xs text-subtle break-words pl-0.5">
                {msg.message}
              </p>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-t border-border shrink-0">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder="输入消息…"
          className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-bg-hover border border-border text-xs text-white placeholder:text-muted focus:outline-none focus:border-accent transition"
        />
        <button
          onClick={handleSend}
          disabled={!draft.trim()}
          className={clsx(
            'p-1.5 rounded-lg transition',
            draft.trim()
              ? 'text-accent hover:bg-accent/15'
              : 'text-muted cursor-not-allowed',
          )}
          title="发送"
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}
