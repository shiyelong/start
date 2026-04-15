'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  ThumbsUp,
  Reply,
  Flag,
  Send,
  ChevronDown,
  Loader2,
  AlertTriangle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Comment {
  id: string;
  userId: number;
  authorName: string;
  content: string;
  likes: number;
  liked: boolean;
  replies: Comment[];
  replyCount: number;
  createdAt: string;
}

interface CommentSectionProps {
  contentType: string;
  contentId: string;
}

type SortMode = 'newest' | 'hottest';

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
  if (days < 30) return `${days}天前`;
  const months = Math.floor(days / 30);
  return `${months}个月前`;
}

// ---------------------------------------------------------------------------
// Mock data (replaced by API calls in production)
// ---------------------------------------------------------------------------

const MOCK_COMMENTS: Comment[] = [
  {
    id: '1',
    userId: 1,
    authorName: '用户A',
    content: '这个内容太棒了，强烈推荐！',
    likes: 42,
    liked: false,
    replies: [
      {
        id: '1-1',
        userId: 2,
        authorName: '用户B',
        content: '同意，确实很不错',
        likes: 5,
        liked: false,
        replies: [],
        replyCount: 0,
        createdAt: new Date(Date.now() - 1800000).toISOString(),
      },
    ],
    replyCount: 1,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: '2',
    userId: 3,
    authorName: '用户C',
    content: '画质很好，希望能多更新一些类似的内容。',
    likes: 18,
    liked: false,
    replies: [],
    replyCount: 0,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
];

// ---------------------------------------------------------------------------
// Single Comment Item
// ---------------------------------------------------------------------------

function CommentItem({
  comment,
  depth,
  onLike,
  onReply,
  onReport,
}: {
  comment: Comment;
  depth: number;
  onLike: (id: string) => void;
  onReply: (id: string, content: string) => void;
  onReport: (id: string) => void;
}) {
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [replyText, setReplyText] = useState('');

  const handleSubmitReply = () => {
    const text = replyText.trim();
    if (!text) return;
    onReply(comment.id, text);
    setReplyText('');
    setShowReplyInput(false);
  };

  return (
    <div className={`${depth > 0 ? 'ml-8 border-l border-white/5 pl-4' : ''}`}>
      <div className="py-3">
        {/* Author + time */}
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded-full bg-[#3ea6ff]/20 flex items-center justify-center">
            <span className="text-[10px] text-[#3ea6ff] font-bold">
              {comment.authorName.charAt(0)}
            </span>
          </div>
          <span className="text-xs font-medium text-gray-300">{comment.authorName}</span>
          <span className="text-[10px] text-gray-600">{timeAgo(comment.createdAt)}</span>
        </div>

        {/* Content */}
        <p className="text-sm text-gray-300 leading-relaxed ml-8">{comment.content}</p>

        {/* Actions */}
        <div className="flex items-center gap-4 ml-8 mt-2">
          <button
            onClick={() => onLike(comment.id)}
            className={`flex items-center gap-1 text-xs transition-colors ${
              comment.liked
                ? 'text-[#3ea6ff]'
                : 'text-gray-600 hover:text-[#3ea6ff]'
            }`}
          >
            <ThumbsUp className="w-3.5 h-3.5" />
            {comment.likes > 0 && <span>{comment.likes}</span>}
          </button>

          {depth < 2 && (
            <button
              onClick={() => setShowReplyInput(!showReplyInput)}
              className="flex items-center gap-1 text-xs text-gray-600 hover:text-[#3ea6ff] transition-colors"
            >
              <Reply className="w-3.5 h-3.5" />
              回复
            </button>
          )}

          <button
            onClick={() => onReport(comment.id)}
            className="flex items-center gap-1 text-xs text-gray-600 hover:text-red-400 transition-colors"
          >
            <Flag className="w-3.5 h-3.5" />
            举报
          </button>
        </div>

        {/* Reply input */}
        {showReplyInput && (
          <div className="ml-8 mt-2 flex gap-2">
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmitReply()}
              placeholder={`回复 ${comment.authorName}...`}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#3ea6ff]/50"
            />
            <button
              onClick={handleSubmitReply}
              disabled={!replyText.trim()}
              className="px-3 py-1.5 bg-[#3ea6ff] text-white text-xs rounded-lg hover:bg-[#3ea6ff]/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Nested replies (max 2 levels) */}
      {comment.replies.map((reply) => (
        <CommentItem
          key={reply.id}
          comment={reply}
          depth={depth + 1}
          onLike={onLike}
          onReply={onReply}
          onReport={onReport}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CommentSection
// ---------------------------------------------------------------------------

export default function CommentSection({ contentType, contentId }: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>(MOCK_COMMENTS);
  const [loading, setLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());

  const totalCount = comments.reduce((sum, c) => sum + 1 + c.replyCount, 0);

  const handlePost = useCallback(() => {
    const text = newComment.trim();
    if (!text) return;

    const comment: Comment = {
      id: `local-${Date.now()}`,
      userId: 0,
      authorName: '我',
      content: text,
      likes: 0,
      liked: false,
      replies: [],
      replyCount: 0,
      createdAt: new Date().toISOString(),
    };

    setComments((prev) => [comment, ...prev]);
    setNewComment('');

    // TODO: POST /api/comments/[contentType]/[contentId]
  }, [newComment]);

  const handleLike = useCallback((id: string) => {
    setComments((prev) =>
      prev.map((c) => {
        if (c.id === id) {
          return { ...c, liked: !c.liked, likes: c.liked ? c.likes - 1 : c.likes + 1 };
        }
        return {
          ...c,
          replies: c.replies.map((r) =>
            r.id === id
              ? { ...r, liked: !r.liked, likes: r.liked ? r.likes - 1 : r.likes + 1 }
              : r,
          ),
        };
      }),
    );
    // TODO: POST /api/comments/[id]/like
  }, []);

  const handleReply = useCallback((parentId: string, content: string) => {
    const reply: Comment = {
      id: `reply-${Date.now()}`,
      userId: 0,
      authorName: '我',
      content,
      likes: 0,
      liked: false,
      replies: [],
      replyCount: 0,
      createdAt: new Date().toISOString(),
    };

    setComments((prev) =>
      prev.map((c) => {
        if (c.id === parentId) {
          return { ...c, replies: [...c.replies, reply], replyCount: c.replyCount + 1 };
        }
        return c;
      }),
    );
    // TODO: POST /api/comments/[parentId]/reply
  }, []);

  const handleReport = useCallback((id: string) => {
    setReportedIds((prev) => new Set(prev).add(id));
    // TODO: POST /api/comments/[id]/report
  }, []);

  const sorted = [...comments].sort((a, b) => {
    if (sortMode === 'hottest') return b.likes - a.likes;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="mt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-[#3ea6ff]" />
          <h3 className="text-sm font-semibold text-white">
            评论 <span className="text-gray-500 font-normal">({totalCount})</span>
          </h3>
        </div>

        <div className="flex items-center gap-1">
          {(['newest', 'hottest'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setSortMode(mode)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                sortMode === mode
                  ? 'bg-[#3ea6ff]/15 text-[#3ea6ff]'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {mode === 'newest' ? '最新' : '最热'}
            </button>
          ))}
        </div>
      </div>

      {/* Post input */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handlePost()}
          placeholder="发表评论..."
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#3ea6ff]/50 transition-colors"
        />
        <button
          onClick={handlePost}
          disabled={!newComment.trim()}
          className="px-4 py-2.5 bg-[#3ea6ff] text-white text-sm rounded-lg hover:bg-[#3ea6ff]/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
        >
          <Send className="w-4 h-4" />
          发送
        </button>
      </div>

      {/* Comment list */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-[#3ea6ff] animate-spin" />
        </div>
      )}

      {!loading && sorted.length === 0 && (
        <div className="text-center py-12">
          <MessageSquare className="w-8 h-8 text-gray-700 mx-auto mb-2" />
          <p className="text-xs text-gray-500">暂无评论，来发表第一条吧</p>
        </div>
      )}

      {!loading && (
        <div className="divide-y divide-white/[0.03]">
          {sorted.map((comment) => (
            <div key={comment.id}>
              {reportedIds.has(comment.id) ? (
                <div className="py-3 flex items-center gap-2 text-xs text-gray-600">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  该评论已被举报
                </div>
              ) : (
                <CommentItem
                  comment={comment}
                  depth={0}
                  onLike={handleLike}
                  onReply={handleReply}
                  onReport={handleReport}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
