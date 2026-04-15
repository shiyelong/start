'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Bell,
  Check,
  CheckCheck,
  X,
  Film,
  Music,
  BookOpen,
  MessageSquare,
  Megaphone,
  Radio,
  Settings,
  Loader2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NotificationType =
  | 'anime_update'
  | 'live_online'
  | 'message'
  | 'system'
  | 'comment_reply'
  | 'podcast_update';

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  link?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TYPE_ICONS: Record<NotificationType, typeof Bell> = {
  anime_update: Film,
  live_online: Radio,
  message: MessageSquare,
  system: Megaphone,
  comment_reply: MessageSquare,
  podcast_update: Music,
};

const TYPE_LABELS: Record<NotificationType, string> = {
  anime_update: '追番更新',
  live_online: '主播开播',
  message: '私信',
  system: '系统公告',
  comment_reply: '评论回复',
  podcast_update: '播客更新',
};

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: '1',
    type: 'anime_update',
    title: '进击的巨人 最终季',
    body: '第16集已更新',
    read: false,
    createdAt: new Date(Date.now() - 300000).toISOString(),
    link: '/anime/aot-final',
  },
  {
    id: '2',
    type: 'live_online',
    title: '主播 小明 开播了',
    body: '正在直播：英雄联盟排位赛',
    read: false,
    createdAt: new Date(Date.now() - 600000).toISOString(),
    link: '/live/rooms/123',
  },
  {
    id: '3',
    type: 'comment_reply',
    title: '有人回复了你的评论',
    body: '"说得太对了！完全同意你的观点..."',
    read: true,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: '4',
    type: 'system',
    title: '系统维护通知',
    body: '平台将于今晚 2:00-4:00 进行维护升级',
    read: true,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(MOCK_NOTIFICATIONS);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg text-gray-400 hover:text-[#3ea6ff] hover:bg-white/5 transition-colors"
        aria-label="通知"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center min-w-[18px] px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <h3 className="text-sm font-semibold text-white">通知</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-[#3ea6ff] hover:text-[#65b8ff] transition-colors flex items-center gap-1"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  全部已读
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded text-gray-500 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Notification list */}
          <div className="max-h-96 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-[#3ea6ff] animate-spin" />
              </div>
            )}

            {!loading && notifications.length === 0 && (
              <div className="text-center py-12">
                <Bell className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                <p className="text-xs text-gray-500">暂无通知</p>
              </div>
            )}

            {!loading &&
              notifications.map((notif) => {
                const Icon = TYPE_ICONS[notif.type] || Bell;
                return (
                  <div
                    key={notif.id}
                    className={`flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition-colors cursor-pointer border-b border-white/[0.02] ${
                      !notif.read ? 'bg-[#3ea6ff]/[0.03]' : ''
                    }`}
                    onClick={() => markAsRead(notif.id)}
                  >
                    {/* Icon */}
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        !notif.read ? 'bg-[#3ea6ff]/15 text-[#3ea6ff]' : 'bg-white/5 text-gray-500'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-white truncate">
                          {notif.title}
                        </span>
                        {!notif.read && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[#3ea6ff] shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 truncate mt-0.5">{notif.body}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-gray-600">
                          {TYPE_LABELS[notif.type]}
                        </span>
                        <span className="text-[10px] text-gray-600">
                          {timeAgo(notif.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-white/5 flex items-center justify-between">
            <a
              href="/settings"
              className="text-xs text-gray-500 hover:text-[#3ea6ff] transition-colors flex items-center gap-1"
            >
              <Settings className="w-3.5 h-3.5" />
              通知设置
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
