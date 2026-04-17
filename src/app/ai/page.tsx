'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import {
  MessageSquare,
  Send,
  Trash2,
  Settings,
  Bot,
  User,
  Plus,
  ChevronDown,
  History,
  X,
  Loader2,
  Code,
  PenTool,
  Languages,
  BarChart3,
  ImageIcon,
  Sparkles,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
  messages: Msg[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODES = [
  { id: 'chat', label: '智能对话', icon: MessageSquare, desc: '通用AI助手' },
  { id: 'code', label: '代码助手', icon: Code, desc: '写代码/Debug' },
  { id: 'write', label: '文案创作', icon: PenTool, desc: '写文章/文案' },
  { id: 'translate', label: '翻译', icon: Languages, desc: '多语言互译' },
  { id: 'image', label: '图片描述', icon: ImageIcon, desc: 'AI看图说话' },
  { id: 'analyze', label: '数据分析', icon: BarChart3, desc: '分析数据趋势' },
];

const OPENROUTER_MODELS = [
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
  { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
  { id: 'google/gemini-pro', label: 'Gemini Pro' },
  { id: 'meta-llama/llama-3-70b-instruct', label: 'Llama 3 70B' },
  { id: 'deepseek/deepseek-chat', label: 'DeepSeek Chat' },
  { id: 'mistralai/mistral-large', label: 'Mistral Large' },
];

const SUGGESTIONS: Record<string, string[]> = {
  chat: ['今天天气怎么样？', '推荐几部好看的电影', '帮我制定一个健身计划'],
  code: ['用Python写一个快速排序', 'React useEffect怎么用？', '帮我写一个登录API'],
  write: ['写一篇产品发布文案', '帮我写一段自我介绍', '写一个短视频脚本'],
  translate: ['把这段翻译成英文', '日语「お疲れ様」怎么翻译？', '翻译：人工智能改变世界'],
  image: ['描述一张日落海滩的图片', '这张图片里有什么？', '帮我生成图片描述文案'],
  analyze: ['分析这组销售数据的趋势', '帮我做用户画像分析', '预测下个月的增长率'],
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AIPage() {
  // Chat state
  const [mode, setMode] = useState('chat');
  const [model, setModel] = useState(OPENROUTER_MODELS[0].id);
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: 'assistant',
      content:
        '你好！我是星聚 AI 助手，支持多种模型和对话模式。选择上方标签切换模式，或直接开始对话。',
    },
  ]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);

  // History state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showModelSelect, setShowModelSelect] = useState(false);

  // Refs
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, streaming]);

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const send = useCallback(
    async (text?: string) => {
      const msg = text || input.trim();
      if (!msg || streaming) return;
      setInput('');

      const userMsg: Msg = { role: 'user', content: msg };
      const updatedMsgs = [...msgs, userMsg];
      setMsgs(updatedMsgs);
      setStreaming(true);

      // Add empty assistant message for streaming
      const assistantMsg: Msg = { role: 'assistant', content: '' };
      setMsgs([...updatedMsgs, assistantMsg]);

      try {
        // Try real API first
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(typeof window !== 'undefined' && localStorage.getItem('starhub_token')
              ? { Authorization: `Bearer ${localStorage.getItem('starhub_token')}` }
              : {}),
          },
          body: JSON.stringify({
            model,
            messages: updatedMsgs.map((m) => ({ role: m.role, content: m.content })),
          }),
        });

        if (!res.ok) throw new Error(`API error: ${res.status}`);

        // Parse SSE stream
        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let accumulated = '';
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') break;

            try {
              const parsed = JSON.parse(data) as {
                choices?: { delta?: { content?: string } }[];
              };
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                accumulated += content;
                const current = accumulated;
                setMsgs((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: 'assistant', content: current };
                  return updated;
                });
              }
            } catch {
              // Skip malformed JSON chunks
            }
          }
        }

        // If no content was streamed, show a fallback
        if (!accumulated) {
          throw new Error('Empty response');
        }
      } catch {
        // Fallback: simulate response when API is unavailable
        const modelLabel = OPENROUTER_MODELS.find((m) => m.id === model)?.label || model;
        const stubResponse = `[离线模式] ${modelLabel} 暂时不可用。\n\n后端 API 已就绪（/api/ai/chat），部署到 Cloudflare Pages 并配置 OPENROUTER_API_KEY 后即可使用真实 AI 对话。\n\n你的问题：「${msg}」`;

        let accumulated = '';
        for (let i = 0; i < stubResponse.length; i++) {
          accumulated += stubResponse[i];
          const current = accumulated;
          await new Promise((r) => setTimeout(r, 12));
          setMsgs((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'assistant', content: current };
            return updated;
          });
        }
      }

      setStreaming(false);
    },
    [input, streaming, model, msgs],
  );

  const newConversation = useCallback(() => {
    if (msgs.length > 1) {
      const conv: Conversation = {
        id: `conv_${Date.now()}`,
        title: msgs.find((m) => m.role === 'user')?.content.slice(0, 30) || '新对话',
        updatedAt: new Date().toISOString(),
        messages: [...msgs],
      };
      setConversations((prev) => [conv, ...prev]);
    }
    setMsgs([
      {
        role: 'assistant',
        content: '新对话已开始。有什么我可以帮你的？',
      },
    ]);
    setActiveConvId(null);
  }, [msgs]);

  const loadConversation = useCallback((conv: Conversation) => {
    setMsgs(conv.messages);
    setActiveConvId(conv.id);
    setShowHistory(false);
  }, []);

  const deleteConversation = useCallback(
    (convId: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (activeConvId === convId) {
        setActiveConvId(null);
      }
    },
    [activeConvId],
  );

  const clearAll = useCallback(() => {
    setConversations([]);
    setMsgs([
      {
        role: 'assistant',
        content: '所有历史已清除。',
      },
    ]);
    setActiveConvId(null);
  }, []);

  const currentSuggestions = SUGGESTIONS[mode] || SUGGESTIONS.chat;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <>
      <Header />
      <main className="flex h-[calc(100vh-3.5rem)] bg-[#0f0f0f]">
        {/* History Sidebar (desktop) */}
        <aside
          className={`${
            showHistory ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          } fixed md:relative z-40 md:z-0 w-72 h-full bg-[#0a0a0a] border-r border-white/5 flex flex-col transition-transform`}
        >
          <div className="p-3 border-b border-white/5">
            <button
              onClick={newConversation}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-white/10 text-sm text-gray-300 hover:text-[#3ea6ff] hover:border-[#3ea6ff]/30 transition-colors"
            >
              <Plus className="w-4 h-4" />
              新对话
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {conversations.length === 0 && (
              <p className="text-xs text-gray-600 text-center py-8">暂无历史对话</p>
            )}
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                  activeConvId === conv.id
                    ? 'bg-[#3ea6ff]/10 text-[#3ea6ff]'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
                onClick={() => loadConversation(conv)}
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                <span className="text-xs truncate flex-1">{conv.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConversation(conv.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-500 hover:text-red-400 transition-all"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          {conversations.length > 0 && (
            <div className="p-3 border-t border-white/5">
              <button
                onClick={clearAll}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs text-gray-500 hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                清除所有历史
              </button>
            </div>
          )}

          {/* Mobile close */}
          <button
            onClick={() => setShowHistory(false)}
            className="md:hidden absolute top-3 right-3 p-1.5 rounded-lg text-gray-500 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </aside>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top bar */}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 shrink-0">
            <button
              onClick={() => setShowHistory(true)}
              className="md:hidden p-2 rounded-lg text-gray-400 hover:text-[#3ea6ff] transition-colors"
            >
              <History className="w-5 h-5" />
            </button>

            {/* Mode tabs */}
            <div className="flex gap-1 overflow-x-auto flex-1">
              {MODES.map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors shrink-0 ${
                      mode === m.id
                        ? 'bg-[#3ea6ff]/15 text-[#3ea6ff] font-semibold'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {m.label}
                  </button>
                );
              })}
            </div>

            {/* Model selector */}
            <div className="relative">
              <button
                onClick={() => setShowModelSelect(!showModelSelect)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400 border border-white/10 hover:border-[#3ea6ff]/30 hover:text-[#3ea6ff] transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {OPENROUTER_MODELS.find((m) => m.id === model)?.label || 'Model'}
                </span>
                <ChevronDown className="w-3 h-3" />
              </button>
              {showModelSelect && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-[#1a1a1a] border border-white/10 rounded-lg py-1 shadow-xl z-50">
                  {OPENROUTER_MODELS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setModel(m.id);
                        setShowModelSelect(false);
                      }}
                      className={`block w-full text-left px-3 py-2 text-xs transition-colors ${
                        model === m.id
                          ? 'text-[#3ea6ff] bg-[#3ea6ff]/10'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {m.label}
                      <span className="block text-[10px] text-gray-600 mt-0.5">{m.id}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {msgs.map((m, i) => (
              <div
                key={i}
                className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    m.role === 'assistant'
                      ? 'bg-gradient-to-br from-[#3ea6ff] to-[#2563eb]'
                      : 'bg-[#212121] border border-white/10'
                  }`}
                >
                  {m.role === 'assistant' ? (
                    <Bot className="w-4 h-4 text-white" />
                  ) : (
                    <User className="w-4 h-4 text-gray-400" />
                  )}
                </div>
                <div
                  className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === 'assistant'
                      ? 'bg-[#1a1a1a] border border-white/5 text-gray-300 rounded-tl-sm'
                      : 'bg-[#3ea6ff] text-[#0f0f0f] rounded-tr-sm'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {streaming && msgs[msgs.length - 1]?.content === '' && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#3ea6ff] to-[#2563eb] flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="bg-[#1a1a1a] border border-white/5 rounded-2xl rounded-tl-sm px-4 py-3">
                  <Loader2 className="w-4 h-4 text-[#3ea6ff] animate-spin" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Suggestions */}
          {msgs.length <= 2 && (
            <div className="flex flex-wrap gap-1.5 px-4 mb-2">
              {currentSuggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="px-3 py-1.5 rounded-full bg-[#1a1a1a] border border-white/5 text-xs text-gray-500 hover:text-white hover:border-[#3ea6ff]/30 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="px-4 pb-4 pt-2 border-t border-white/5">
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = '44px';
                  el.style.height = Math.min(el.scrollHeight, 128) + 'px';
                }}
                rows={1}
                className="flex-1 min-h-[44px] max-h-32 px-4 py-3 bg-[#1a1a1a] border border-white/10 rounded-xl text-sm text-white placeholder-gray-600 outline-none focus:border-[#3ea6ff]/40 focus:ring-1 focus:ring-[#3ea6ff]/10 transition-all resize-none"
                placeholder={`${MODES.find((m) => m.id === mode)?.desc}...`}
                disabled={streaming}
                style={{ height: '44px' }}
              />
              <button
                onClick={() => send()}
                disabled={streaming || !input.trim()}
                className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                  streaming || !input.trim()
                    ? 'bg-white/[0.04] text-white/15'
                    : 'bg-[#3ea6ff] text-white hover:bg-[#65b8ff] shadow-lg shadow-[#3ea6ff]/20'
                }`}
              >
                {streaming ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
            <div className="flex items-center justify-between mt-1.5 px-1">
              <span className="text-[10px] text-white/15">Enter 发送 · Shift+Enter 换行</span>
              <span className="text-[10px] text-white/15">{input.length}/4000</span>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
