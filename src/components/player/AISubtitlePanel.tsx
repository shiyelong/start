'use client';

import { useState, useCallback } from 'react';
import {
  Subtitles,
  Mic,
  Languages,
  Upload,
  Loader2,
  Check,
  X,
  ChevronDown,
  Type,
  Palette,
  Move,
  Edit3,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SubtitleTask {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  language: string;
  resultUrl?: string;
}

export interface DubbingTask {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  language: string;
  voice: string;
  resultUrl?: string;
}

export interface SubtitleStyle {
  fontSize: 'small' | 'medium' | 'large';
  color: string;
  bgOpacity: number;
  position: 'bottom' | 'top';
}

export interface AISubtitlePanelProps {
  videoId: string;
  onSubtitleGenerated?: (url: string) => void;
  onDubbingGenerated?: (url: string) => void;
  onClose?: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUBTITLE_LANGUAGES = [
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt', label: 'Português' },
];

const VOICE_STYLES = [
  { id: 'natural', label: '自然' },
  { id: 'warm', label: '温暖' },
  { id: 'professional', label: '专业' },
  { id: 'energetic', label: '活力' },
];

const FONT_SIZES: Record<string, string> = {
  small: '14px',
  medium: '18px',
  large: '24px',
};

const SUBTITLE_COLORS = ['#ffffff', '#ffff00', '#00ff00', '#00ffff', '#ff69b4'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AISubtitlePanel({
  videoId,
  onSubtitleGenerated,
  onDubbingGenerated,
  onClose,
}: AISubtitlePanelProps) {
  const [activeTab, setActiveTab] = useState<'subtitle' | 'dubbing' | 'upload' | 'style'>('subtitle');

  // Subtitle state
  const [subtitleLang, setSubtitleLang] = useState('zh');
  const [subtitleTask, setSubtitleTask] = useState<SubtitleTask | null>(null);

  // Dubbing state
  const [dubbingLang, setDubbingLang] = useState('zh');
  const [voiceStyle, setVoiceStyle] = useState('natural');
  const [dubbingTask, setDubbingTask] = useState<DubbingTask | null>(null);

  // Style state
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>({
    fontSize: 'medium',
    color: '#ffffff',
    bgOpacity: 0.6,
    position: 'bottom',
  });

  // Edit state
  const [editMode, setEditMode] = useState(false);

  // -----------------------------------------------------------------------
  // Handlers (stub implementations)
  // -----------------------------------------------------------------------

  const handleGenerateSubtitle = useCallback(async () => {
    const taskId = `sub_${Date.now()}`;
    setSubtitleTask({
      taskId,
      status: 'pending',
      progress: 0,
      language: subtitleLang,
    });

    // Stub: simulate task submission
    setTimeout(() => {
      setSubtitleTask(prev =>
        prev ? { ...prev, status: 'processing', progress: 30 } : null,
      );
    }, 1000);

    setTimeout(() => {
      setSubtitleTask(prev =>
        prev
          ? {
              ...prev,
              status: 'completed',
              progress: 100,
              resultUrl: `/api/ai/subtitle/${taskId}/result.srt`,
            }
          : null,
      );
      onSubtitleGenerated?.(`/api/ai/subtitle/${taskId}/result.srt`);
    }, 3000);
  }, [subtitleLang, onSubtitleGenerated]);

  const handleGenerateDubbing = useCallback(async () => {
    const taskId = `dub_${Date.now()}`;
    setDubbingTask({
      taskId,
      status: 'pending',
      progress: 0,
      language: dubbingLang,
      voice: voiceStyle,
    });

    setTimeout(() => {
      setDubbingTask(prev =>
        prev ? { ...prev, status: 'processing', progress: 40 } : null,
      );
    }, 1500);

    setTimeout(() => {
      setDubbingTask(prev =>
        prev
          ? {
              ...prev,
              status: 'completed',
              progress: 100,
              resultUrl: `/api/ai/dubbing/${taskId}/result.mp3`,
            }
          : null,
      );
      onDubbingGenerated?.(`/api/ai/dubbing/${taskId}/result.mp3`);
    }, 4000);
  }, [dubbingLang, voiceStyle, onDubbingGenerated]);

  const handleUploadSubtitle = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.srt,.ass,.vtt';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        onSubtitleGenerated?.(URL.createObjectURL(file));
      }
    };
    input.click();
  }, [onSubtitleGenerated]);

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------

  const renderTaskStatus = (task: SubtitleTask | DubbingTask | null) => {
    if (!task) return null;
    return (
      <div className="mt-3 p-3 rounded-lg bg-white/5 border border-white/10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400">
            {task.status === 'pending' && '排队中...'}
            {task.status === 'processing' && '处理中...'}
            {task.status === 'completed' && '已完成'}
            {task.status === 'failed' && '失败'}
          </span>
          {task.status === 'processing' && (
            <Loader2 className="w-3.5 h-3.5 text-[#3ea6ff] animate-spin" />
          )}
          {task.status === 'completed' && (
            <Check className="w-3.5 h-3.5 text-green-400" />
          )}
        </div>
        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#3ea6ff] rounded-full transition-all duration-500"
            style={{ width: `${task.progress}%` }}
          />
        </div>
      </div>
    );
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="w-80 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Subtitles className="w-4 h-4 text-[#3ea6ff]" />
          AI 字幕与配音
        </h3>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/5">
        {[
          { id: 'subtitle' as const, label: '字幕', icon: Subtitles },
          { id: 'dubbing' as const, label: '配音', icon: Mic },
          { id: 'upload' as const, label: '上传', icon: Upload },
          { id: 'style' as const, label: '样式', icon: Type },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs transition-colors ${
              activeTab === tab.id
                ? 'text-[#3ea6ff] border-b-2 border-[#3ea6ff]'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Subtitle Tab */}
        {activeTab === 'subtitle' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">目标语言</label>
              <div className="relative">
                <select
                  value={subtitleLang}
                  onChange={(e) => setSubtitleLang(e.target.value)}
                  className="w-full h-9 px-3 bg-white/5 border border-white/10 rounded-lg text-sm text-white appearance-none outline-none focus:border-[#3ea6ff] transition-colors"
                >
                  {SUBTITLE_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code} className="bg-[#1a1a1a]">
                      {lang.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
              </div>
            </div>

            <button
              onClick={handleGenerateSubtitle}
              disabled={subtitleTask?.status === 'processing'}
              className="w-full py-2.5 rounded-lg bg-[#3ea6ff] text-black text-sm font-semibold hover:bg-[#65b8ff] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              <Languages className="w-4 h-4" />
              生成 AI 字幕
            </button>

            {renderTaskStatus(subtitleTask)}

            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditMode(!editMode)}
                className={`flex-1 py-2 rounded-lg text-xs border transition-colors flex items-center justify-center gap-1.5 ${
                  editMode
                    ? 'border-[#3ea6ff]/30 text-[#3ea6ff] bg-[#3ea6ff]/10'
                    : 'border-white/10 text-gray-400 hover:text-white'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                手动校正
              </button>
            </div>
          </div>
        )}

        {/* Dubbing Tab */}
        {activeTab === 'dubbing' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">目标语言</label>
              <div className="relative">
                <select
                  value={dubbingLang}
                  onChange={(e) => setDubbingLang(e.target.value)}
                  className="w-full h-9 px-3 bg-white/5 border border-white/10 rounded-lg text-sm text-white appearance-none outline-none focus:border-[#3ea6ff] transition-colors"
                >
                  {SUBTITLE_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code} className="bg-[#1a1a1a]">
                      {lang.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">语音风格</label>
              <div className="grid grid-cols-2 gap-2">
                {VOICE_STYLES.map((vs) => (
                  <button
                    key={vs.id}
                    onClick={() => setVoiceStyle(vs.id)}
                    className={`py-2 rounded-lg text-xs border transition-colors ${
                      voiceStyle === vs.id
                        ? 'border-[#3ea6ff]/30 text-[#3ea6ff] bg-[#3ea6ff]/10'
                        : 'border-white/10 text-gray-400 hover:text-white'
                    }`}
                  >
                    {vs.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleGenerateDubbing}
              disabled={dubbingTask?.status === 'processing'}
              className="w-full py-2.5 rounded-lg bg-[#3ea6ff] text-black text-sm font-semibold hover:bg-[#65b8ff] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              <Mic className="w-4 h-4" />
              生成 AI 配音
            </button>

            {renderTaskStatus(dubbingTask)}
          </div>
        )}

        {/* Upload Tab */}
        {activeTab === 'upload' && (
          <div className="space-y-4">
            <p className="text-xs text-gray-400">
              上传 SRT、ASS 或 VTT 格式的字幕文件
            </p>
            <button
              onClick={handleUploadSubtitle}
              className="w-full py-8 rounded-lg border-2 border-dashed border-white/10 hover:border-[#3ea6ff]/30 transition-colors flex flex-col items-center gap-2 text-gray-400 hover:text-[#3ea6ff]"
            >
              <Upload className="w-6 h-6" />
              <span className="text-xs">点击选择字幕文件</span>
              <span className="text-[10px] text-gray-600">.srt / .ass / .vtt</span>
            </button>
          </div>
        )}

        {/* Style Tab */}
        {activeTab === 'style' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block flex items-center gap-1.5">
                <Type className="w-3.5 h-3.5" />
                字体大小
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['small', 'medium', 'large'] as const).map((size) => (
                  <button
                    key={size}
                    onClick={() => setSubtitleStyle((s) => ({ ...s, fontSize: size }))}
                    className={`py-2 rounded-lg text-xs border transition-colors ${
                      subtitleStyle.fontSize === size
                        ? 'border-[#3ea6ff]/30 text-[#3ea6ff] bg-[#3ea6ff]/10'
                        : 'border-white/10 text-gray-400 hover:text-white'
                    }`}
                  >
                    <span style={{ fontSize: FONT_SIZES[size] }}>A</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1.5 block flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5" />
                字幕颜色
              </label>
              <div className="flex gap-2">
                {SUBTITLE_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setSubtitleStyle((s) => ({ ...s, color }))}
                    className={`w-8 h-8 rounded-full border-2 transition-colors ${
                      subtitleStyle.color === color
                        ? 'border-[#3ea6ff]'
                        : 'border-white/10'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">
                背景透明度: {Math.round(subtitleStyle.bgOpacity * 100)}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={subtitleStyle.bgOpacity * 100}
                onChange={(e) =>
                  setSubtitleStyle((s) => ({
                    ...s,
                    bgOpacity: parseInt(e.target.value) / 100,
                  }))
                }
                className="w-full accent-[#3ea6ff]"
              />
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1.5 block flex items-center gap-1.5">
                <Move className="w-3.5 h-3.5" />
                字幕位置
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['bottom', 'top'] as const).map((pos) => (
                  <button
                    key={pos}
                    onClick={() => setSubtitleStyle((s) => ({ ...s, position: pos }))}
                    className={`py-2 rounded-lg text-xs border transition-colors ${
                      subtitleStyle.position === pos
                        ? 'border-[#3ea6ff]/30 text-[#3ea6ff] bg-[#3ea6ff]/10'
                        : 'border-white/10 text-gray-400 hover:text-white'
                    }`}
                  >
                    {pos === 'bottom' ? '底部' : '顶部'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
