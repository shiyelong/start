"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import AuthGuard from "@/components/AuthGuard";
import { fetchWithAuth } from "@/lib/auth";
import clsx from "clsx";

interface Msg { role: "user" | "assistant"; content: string; mode?: string; }

const MODES = [
  { id: "chat", label: "智能对话", icon: "fa-comments", color: "text-[#3ea6ff]", desc: "通用AI助手" },
  { id: "code", label: "代码助手", icon: "fa-code", color: "text-[#2ba640]", desc: "写代码/Debug" },
  { id: "write", label: "文案创作", icon: "fa-pen-fancy", color: "text-[#a855f7]", desc: "写文章/文案" },
  { id: "translate", label: "翻译", icon: "fa-language", color: "text-[#f0b90b]", desc: "多语言互译" },
  { id: "image", label: "图片描述", icon: "fa-image", color: "text-[#ec4899]", desc: "AI看图说话" },
  { id: "analyze", label: "数据分析", icon: "fa-chart-line", color: "text-[#f97316]", desc: "分析数据趋势" },
];

const SUGGESTIONS: Record<string, string[]> = {
  chat: ["今天天气怎么样？", "推荐几部好看的电影", "帮我制定一个健身计划", "解释一下量子计算", "如何提高工作效率？", "推荐几个好玩的游戏"],
  code: ["用Python写一个快速排序", "React useEffect怎么用？", "帮我写一个登录API", "解释async/await原理", "SQL查询优化建议", "Docker部署Node项目"],
  write: ["写一篇产品发布文案", "帮我写一段自我介绍", "写一个短视频脚本", "生成5个营销标题", "写一封商务邮件", "写一段朋友圈文案"],
  translate: ["把这段翻译成英文", "日语「お疲れ様」怎么翻译？", "翻译：人工智能改变世界", "法语的「你好」怎么说？", "韩语基础问候语", "把英文翻译成中文"],
  image: ["描述一张日落海滩的图片", "这张图片里有什么？", "帮我生成图片描述文案", "分析这张设计图的配色"],
  analyze: ["分析这组销售数据的趋势", "帮我做用户画像分析", "预测下个月的增长率", "对比两个方案的优劣"],
};

const MODE_PROMPTS: Record<string, string> = {
  chat: "你是星聚平台的AI助手，友好、专业、有趣。用中文回答。",
  code: "你是一个专业的编程助手。用中文解释，代码用markdown代码块格式。",
  write: "你是一个专业的文案创作者。用中文写作，风格生动有创意。",
  translate: "你是一个专业翻译。用户发什么语言的内容，你翻译成另一种语言。默认中英互译。",
  image: "你是一个图片描述专家。根据用户描述生成详细的画面描述文案。",
  analyze: "你是一个数据分析专家。帮用户分析数据、生成洞察和建议。用中文回答。",
};

const PROVIDER_CONFIG: Record<string, { model: string; name: string }> = {
  openai: { model: "gpt-3.5-turbo", name: "OpenAI" },
  deepseek: { model: "deepseek-chat", name: "DeepSeek" },
  moonshot: { model: "moonshot-v1-8k", name: "Moonshot" },
};

function AIChat() {
  const [mode, setMode] = useState("chat");
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "assistant", content: " 你好！我是星聚 AI 助手。\n\n我拥有多种能力模式，可以切换上方标签使用：\n\n 智能对话 — 问我任何问题\n 代码助手 — 写代码、Debug、技术咨询\n 文案创作 — 写文章、文案、脚本\n 翻译 — 多语言互译\n 图片描述 — AI看图说话\n 数据分析 — 分析数据趋势\n\n试试下方的快捷提问，或直接输入你的问题！", mode: "chat" }
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiProvider, setApiProvider] = useState<"openai" | "deepseek" | "moonshot">("deepseek");
  const [apiModel, setApiModel] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("xj_ai_settings");
      if (saved) {
        const s = JSON.parse(saved);
        if (s.apiProvider) setApiProvider(s.apiProvider);
        if (s.apiModel) setApiModel(s.apiModel);
      }
    } catch {}
  }, []);

  const saveSettings = () => {
    try {
      localStorage.setItem("xj_ai_settings", JSON.stringify({ apiProvider, apiModel }));
    } catch {}
    setShowSettings(false);
  };

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, typing]);

  const callAI = useCallback(async (userMsg: string) => {
    const systemPrompt = MODE_PROMPTS[mode] || MODE_PROMPTS.chat;
    const recentMsgs = msgs.slice(-10).map(m => ({ role: m.role, content: m.content }));
    const model = apiModel || PROVIDER_CONFIG[apiProvider]?.model || "deepseek-chat";

    const apiMessages = [
      { role: "system", content: systemPrompt },
      ...recentMsgs,
      { role: "user", content: userMsg },
    ];

    const res = await fetchWithAuth("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: apiMessages, provider: apiProvider, model }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error || `AI服务错误 (${res.status})`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("无法读取响应流");

    const decoder = new TextDecoder();
    let fullContent = "";

    setMsgs(prev => [...prev, { role: "assistant", content: "", mode }]);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              setMsgs(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: fullContent, mode };
                return updated;
              });
            }
          } catch { /* skip non-JSON lines */ }
        }
      }
    }

    if (!fullContent) {
      setMsgs(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: "AI返回了空内容，请稍后重试。", mode };
        return updated;
      });
    }
  }, [msgs, mode, apiProvider, apiModel]);

  const send = useCallback(async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || typing) return;
    setInput("");
    setMsgs(prev => [...prev, { role: "user", content: msg, mode }]);
    setTyping(true);

    try {
      await callAI(msg);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "未知错误";
      setMsgs(prev => [...prev, { role: "assistant", content: `? AI调用失败：${errMsg}`, mode }]);
    }
    setTyping(false);
  }, [input, mode, typing, callAI]);

  const clearChat = () => {
    setMsgs([{ role: "assistant", content: `已切换到${MODES.find(m => m.id === mode)?.label}模式。`, mode }]);
  };

  const currentSuggestions = SUGGESTIONS[mode] || SUGGESTIONS.chat;

  return (
    <>
      <main className="max-w-3xl mx-auto px-4 py-2 pb-20 md:pb-2 flex flex-col" style={{ height: "calc(100vh - 3.5rem)" }}>
        {/* 模式切换 */}
        <div className="flex gap-1.5 py-2 overflow-x-auto shrink-0 -mx-4 px-4">
          {MODES.map(m => (
            <button key={m.id} onClick={() => { setMode(m.id); inputRef.current?.focus(); }}
              className={clsx(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] whitespace-nowrap border transition shrink-0",
                mode === m.id ? "bg-[#3ea6ff]/15 text-[#3ea6ff] border-[#3ea6ff]/30 font-bold" : "text-[#8a8a8a] border-[#333]/50 hover:text-white"
              )}>
              <i className={`fas ${m.icon} ${mode === m.id ? m.color : ""}`} />{m.label}
            </button>
          ))}
          <button onClick={clearChat} className="px-2 py-1.5 rounded-lg text-[12px] text-[#666] border border-[#333]/30 hover:text-[#ff4444] transition shrink-0">
            <i className="fas fa-trash" />
          </button>
          <button onClick={() => setShowSettings(true)} className="px-2 py-1.5 rounded-lg text-[12px] border border-[#333]/30 text-[#666] hover:text-[#f0b90b] transition shrink-0">
            <i className="fas fa-gear" />
          </button>
        </div>

        {/* 服务状态 */}
        <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] text-[#3ea6ff] bg-[#3ea6ff]/5 rounded-lg border border-[#3ea6ff]/10 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-[#3ea6ff] animate-pulse" />
          通过服务端代理 · {PROVIDER_CONFIG[apiProvider]?.name || "DeepSeek"}
        </div>

        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto space-y-3 py-3">
          {msgs.map((m, i) => (
            <div key={i} className={`flex gap-2.5 ${m.role === "user" ? "flex-row-reverse" : ""} animate-slide-up`}>
              <div className={clsx(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                m.role === "assistant" ? "bg-gradient-to-br from-[#3ea6ff] to-[#2563eb] text-white" : "bg-[#212121] border border-[#333] text-[#aaa]"
              )}>
                {m.role === "assistant" ? <i className="fas fa-robot" /> : <i className="fas fa-user" />}
              </div>
              <div className={clsx(
                "max-w-[85%] px-4 py-3 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap",
                m.role === "assistant"
                  ? "bg-[#1a1a1a] border border-[#333]/50 text-[#ccc] rounded-tl-sm"
                  : "bg-[#3ea6ff] text-[#0f0f0f] rounded-tr-sm"
              )}>
                {m.content}
              </div>
            </div>
          ))}
          {typing && msgs[msgs.length - 1]?.role !== "assistant" && (
            <div className="flex gap-2.5 animate-slide-up">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#3ea6ff] to-[#2563eb] flex items-center justify-center text-white text-xs shrink-0">
                <i className="fas fa-robot" />
              </div>
              <div className="bg-[#1a1a1a] border border-[#333]/50 rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#3ea6ff] animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 rounded-full bg-[#3ea6ff] animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 rounded-full bg-[#3ea6ff] animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                  <span className="text-[11px] text-[#666]">AI思考中...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* 快捷提问 */}
        {msgs.length <= 2 && (
          <div className="flex flex-wrap gap-1.5 mb-2 shrink-0">
            {currentSuggestions.map(s => (
              <button key={s} onClick={() => send(s)}
                className="px-3 py-1.5 rounded-full bg-[#1a1a1a] border border-[#333]/50 text-[11px] text-[#8a8a8a] hover:text-white hover:border-[#3ea6ff]/30 transition">
                {s}
              </button>
            ))}
          </div>
        )}

        {/* 输入框 */}
        <div className="flex gap-2 pb-2 shrink-0">
          <div className="flex-1 relative">
            <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              className="w-full h-11 pl-4 pr-12 bg-[#1a1a1a] border border-[#333] rounded-xl text-sm text-white placeholder-[#666] outline-none focus:border-[#3ea6ff] transition"
              placeholder={`${MODES.find(m => m.id === mode)?.desc}...`}
              disabled={typing} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#444]">
              <i className={`fas ${MODES.find(m => m.id === mode)?.icon}`} />
            </span>
          </div>
          <button onClick={() => send()} disabled={typing || !input.trim()}
            className={clsx(
              "px-5 h-11 rounded-xl text-sm font-semibold transition",
              typing || !input.trim() ? "bg-[#333] text-[#666]" : "bg-[#3ea6ff] text-[#0f0f0f] hover:bg-[#65b8ff] active:scale-95"
            )}>
            <i className="fas fa-paper-plane" />
          </button>
        </div>
      </main>

      {/* AI设置弹窗 */}
      {showSettings && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowSettings(false)}>
          <div className="w-full max-w-md bg-[#1a1a1a] border border-[#333] rounded-2xl p-5 animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold"><i className="fas fa-gear mr-2 text-[#3ea6ff]" />AI 设置</h2>
              <button onClick={() => setShowSettings(false)} className="w-8 h-8 rounded-full bg-[#212121] flex items-center justify-center text-[#8a8a8a] hover:text-white"><i className="fas fa-times" /></button>
            </div>
            <p className="text-[12px] text-[#8a8a8a] mb-4">AI 请求通过服务端代理转发，API Key 安全存储在服务器端。你可以选择偏好的服务商和模型。</p>
            <div className="mb-3">
              <label className="text-xs text-[#8a8a8a] mb-1.5 block">AI 服务商</label>
              <div className="grid grid-cols-3 gap-2">
                {(["openai", "deepseek", "moonshot"] as const).map(p => (
                  <button key={p} onClick={() => { setApiProvider(p); setApiModel(""); }}
                    className={clsx("p-2.5 rounded-xl border text-center transition text-xs",
                      apiProvider === p ? "bg-[#3ea6ff]/15 border-[#3ea6ff]/30 text-[#3ea6ff] font-bold" : "border-[#333] text-[#aaa] hover:text-white"
                    )}>
                    {PROVIDER_CONFIG[p].name}
                    <div className="text-[10px] text-[#666] mt-0.5">{p === "openai" ? "GPT系列" : p === "deepseek" ? "国产便宜" : "Kimi"}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-4">
              <label className="text-xs text-[#8a8a8a] mb-1.5 block">模型名称（可选）</label>
              <input type="text" value={apiModel} onChange={e => setApiModel(e.target.value)}
                placeholder={PROVIDER_CONFIG[apiProvider].model}
                className="w-full h-10 px-3 bg-[#212121] border border-[#333] rounded-lg text-sm text-white placeholder-[#666] outline-none focus:border-[#3ea6ff]" />
            </div>
            <button onClick={saveSettings}
              className="w-full py-2.5 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition active:scale-95">
              <i className="fas fa-save mr-1.5" />保存设置
            </button>
            <div className="mt-3 p-3 rounded-xl bg-[#212121]/50 border border-[#333]/30 text-[10px] text-[#666] space-y-1">
              <p> API Key 安全存储在服务器端，不会暴露给浏览器。</p>
              <p> 选择服务商后，请求会通过后端代理转发到对应的AI服务。</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function AIPage() {
  return (
    <>
      <Header />
      <AuthGuard>
        <AIChat />
      </AuthGuard>
    </>
  );
}
