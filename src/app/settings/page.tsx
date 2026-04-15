'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import { ageGate } from '@/lib/age-gate';
import type { UserMode } from '@/lib/types';
import {
  Settings,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  User,
  Bell,
  Monitor,
  Info,
  ChevronRight,
  Check,
  X,
  Eye,
  EyeOff,
  KeyRound,
  Trash2,
  Tv,
  MessageCircle,
  MessageSquare,
  Megaphone,
  Podcast,
  Radio,
  Moon,
  Globe,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Mode config
// ---------------------------------------------------------------------------

interface ModeOption {
  id: UserMode;
  label: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ElementType;
  level: number; // higher = more restrictive content allowed
}

const MODE_OPTIONS: ModeOption[] = [
  {
    id: 'child',
    label: '儿童',
    description: '仅限 G 级内容，每日 90 分钟',
    color: 'text-green-400',
    bgColor: 'bg-green-500/15',
    borderColor: 'border-green-500/30',
    icon: ShieldCheck,
    level: 0,
  },
  {
    id: 'teen',
    label: '青少年',
    description: 'G ~ PG-13 内容，每日 3 小时',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/15',
    borderColor: 'border-blue-500/30',
    icon: Shield,
    level: 1,
  },
  {
    id: 'mature',
    label: '成熟',
    description: 'G ~ R 级内容，无时间限制',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/15',
    borderColor: 'border-amber-500/30',
    icon: Shield,
    level: 2,
  },
  {
    id: 'adult',
    label: '成人',
    description: '全部内容，含成人专区',
    color: 'text-red-400',
    bgColor: 'bg-red-500/15',
    borderColor: 'border-red-500/30',
    icon: ShieldAlert,
    level: 3,
  },
  {
    id: 'elder',
    label: '长辈',
    description: '简化界面，G ~ PG 内容',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/15',
    borderColor: 'border-purple-500/30',
    icon: ShieldCheck,
    level: 0,
  },
];

function getModeOption(mode: UserMode): ModeOption {
  return MODE_OPTIONS.find((m) => m.id === mode) ?? MODE_OPTIONS[1];
}

// ---------------------------------------------------------------------------
// Notification preferences
// ---------------------------------------------------------------------------

interface NotifPref {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
}

const NOTIF_PREFS: NotifPref[] = [
  { id: 'anime_update', label: '追番更新', description: '关注的动漫有新集更新时通知', icon: Tv },
  { id: 'live_start', label: '主播开播', description: '关注的主播开始直播时通知', icon: Radio },
  { id: 'dm', label: '私信', description: '收到新私信时通知', icon: MessageSquare },
  { id: 'system', label: '系统公告', description: '平台重要公告和更新', icon: Megaphone },
  { id: 'comment', label: '评论回复', description: '有人回复你的评论时通知', icon: MessageCircle },
  { id: 'podcast_update', label: '播客更新', description: '订阅的播客有新节目时通知', icon: Podcast },
];

// ---------------------------------------------------------------------------
// Toggle switch component
// ---------------------------------------------------------------------------

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
        checked ? 'bg-[#3ea6ff]' : 'bg-[#333]'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-[#1a1a1a] rounded-2xl border border-white/5 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/5">
        <Icon className="w-4.5 h-4.5 text-[#3ea6ff]" />
        <h2 className="text-sm font-semibold text-white">{title}</h2>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// PIN dialog
// ---------------------------------------------------------------------------

function PinDialog({
  title,
  description,
  onSubmit,
  onCancel,
  isSettingNew,
}: {
  title: string;
  description: string;
  onSubmit: (pin: string) => void;
  onCancel: () => void;
  isSettingNew?: boolean;
}) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      setError('PIN 必须为 6 位数字');
      return;
    }
    if (isSettingNew && pin !== confirmPin) {
      setError('两次输入的 PIN 不一致');
      return;
    }
    setError('');
    onSubmit(pin);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onCancel} />
      <div className="relative bg-[#1a1a1a] rounded-2xl border border-white/10 w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <button
            onClick={onCancel}
            className="p-1 text-white/40 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-white/50">{description}</p>

        <div className="space-y-3">
          <div className="relative">
            <input
              type={showPin ? 'text' : 'password'}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="输入 6 位 PIN"
              maxLength={6}
              className="w-full h-10 px-3 pr-10 bg-[#0f0f0f] border border-[#333] rounded-lg text-sm text-white placeholder-[#555] outline-none focus:border-[#3ea6ff] transition tracking-widest text-center"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPin(!showPin)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition"
            >
              {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {isSettingNew && (
            <input
              type={showPin ? 'text' : 'password'}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="确认 PIN"
              maxLength={6}
              className="w-full h-10 px-3 bg-[#0f0f0f] border border-[#333] rounded-lg text-sm text-white placeholder-[#555] outline-none focus:border-[#3ea6ff] transition tracking-widest text-center"
            />
          )}

          {error && (
            <p className="text-xs text-red-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 h-9 rounded-lg bg-white/5 text-white/60 text-sm font-medium border border-[#333] hover:bg-white/10 transition"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 h-9 rounded-lg bg-[#3ea6ff] text-black text-sm font-semibold hover:bg-[#3ea6ff]/90 transition"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Age confirmation dialog (for adult mode)
// ---------------------------------------------------------------------------

function AgeConfirmDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onCancel} />
      <div className="relative bg-[#1a1a1a] rounded-2xl border border-white/10 w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-red-400" />
          <h3 className="text-base font-semibold text-white">年龄确认</h3>
        </div>
        <p className="text-sm text-white/50">
          切换到成人模式将解锁所有内容，包括成人专区。请确认你已年满 18 周岁。
        </p>
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 h-9 rounded-lg bg-white/5 text-white/60 text-sm font-medium border border-[#333] hover:bg-white/10 transition"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 h-9 rounded-lg bg-red-500 text-white text-sm font-semibold hover:bg-red-500/90 transition"
          >
            确认已满 18 岁
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete account confirmation dialog
// ---------------------------------------------------------------------------

function DeleteAccountDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onCancel} />
      <div className="relative bg-[#1a1a1a] rounded-2xl border border-white/10 w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Trash2 className="w-5 h-5 text-red-400" />
          <h3 className="text-base font-semibold text-white">注销账户</h3>
        </div>
        <p className="text-sm text-white/50">
          此操作不可撤销。注销后你的所有数据（播放历史、收藏、书签、播放列表）将被永久删除。
        </p>
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 h-9 rounded-lg bg-white/5 text-white/60 text-sm font-medium border border-[#333] hover:bg-white/10 transition"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 h-9 rounded-lg bg-red-500 text-white text-sm font-semibold hover:bg-red-500/90 transition"
          >
            确认注销
          </button>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// AgeGate Section
// ===========================================================================

function AgeGateSection() {
  const [currentMode, setCurrentMode] = useState<UserMode>('teen');
  const [pendingMode, setPendingMode] = useState<UserMode | null>(null);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [showSetPinDialog, setShowSetPinDialog] = useState(false);
  const [showAgeConfirm, setShowAgeConfirm] = useState(false);
  const [switchError, setSwitchError] = useState('');

  useEffect(() => {
    setCurrentMode(ageGate.getMode());
  }, []);

  const currentOption = getModeOption(currentMode);
  const CurrentIcon = currentOption.icon;

  const hasPin = typeof window !== 'undefined' && localStorage.getItem('starhub_age_gate_pin') !== null;

  const handleModeSelect = useCallback((mode: UserMode) => {
    if (mode === currentMode) return;
    setSwitchError('');

    const targetOption = getModeOption(mode);
    const currentOpt = getModeOption(currentMode);

    // Switching to a higher level requires PIN (if PIN is set)
    if (targetOption.level > currentOpt.level && hasPin) {
      setPendingMode(mode);
      // If switching to adult, show age confirm first
      if (mode === 'adult') {
        setShowAgeConfirm(true);
      } else {
        setShowPinDialog(true);
      }
      return;
    }

    // Switching to adult always needs age confirmation
    if (mode === 'adult') {
      setPendingMode(mode);
      setShowAgeConfirm(true);
      return;
    }

    // No PIN required — switch directly
    ageGate.selectMode(mode);
    setCurrentMode(mode);
  }, [currentMode, hasPin]);

  const handleAgeConfirm = useCallback(() => {
    setShowAgeConfirm(false);
    if (hasPin) {
      setShowPinDialog(true);
    } else if (pendingMode) {
      ageGate.selectMode(pendingMode);
      setCurrentMode(pendingMode);
      setPendingMode(null);
    }
  }, [hasPin, pendingMode]);

  const handlePinSubmit = useCallback(async (pin: string) => {
    if (!pendingMode) return;
    const success = await ageGate.switchMode(pendingMode, pin);
    if (success) {
      setCurrentMode(pendingMode);
      setPendingMode(null);
      setShowPinDialog(false);
      setSwitchError('');
    } else {
      setSwitchError('PIN 验证失败，请重试');
    }
  }, [pendingMode]);

  const handleSetPin = useCallback(async (pin: string) => {
    await ageGate.setPin(pin);
    setShowSetPinDialog(false);
  }, []);

  return (
    <>
      <Section title="AgeGate 分级模式" icon={Shield}>
        {/* Current mode badge */}
        <div className="flex items-center gap-3 mb-5">
          <span className="text-sm text-white/50">当前模式</span>
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${currentOption.bgColor} ${currentOption.color} ${currentOption.borderColor}`}
          >
            <CurrentIcon className="w-3.5 h-3.5" />
            {currentOption.label}
          </span>
        </div>

        {/* Mode options */}
        <div className="space-y-2">
          {MODE_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isActive = currentMode === option.id;
            return (
              <button
                key={option.id}
                onClick={() => handleModeSelect(option.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition text-left ${
                  isActive
                    ? `${option.bgColor} ${option.borderColor}`
                    : 'bg-[#0f0f0f] border-[#333]/50 hover:border-[#555]'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    isActive ? option.bgColor : 'bg-[#1a1a1a]'
                  }`}
                >
                  <Icon className={`w-4.5 h-4.5 ${isActive ? option.color : 'text-white/30'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${isActive ? option.color : 'text-white/70'}`}>
                    {option.label}
                  </p>
                  <p className="text-[11px] text-white/30 mt-0.5">{option.description}</p>
                </div>
                {isActive && (
                  <Check className={`w-4 h-4 flex-shrink-0 ${option.color}`} />
                )}
              </button>
            );
          })}
        </div>

        {switchError && (
          <p className="text-xs text-red-400 mt-3 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {switchError}
          </p>
        )}

        {/* Set/Change PIN button */}
        <button
          onClick={() => setShowSetPinDialog(true)}
          className="flex items-center gap-2 mt-4 px-4 py-2 rounded-lg bg-white/5 text-white/60 text-xs font-medium border border-[#333] hover:bg-white/10 hover:text-white transition"
        >
          <KeyRound className="w-3.5 h-3.5" />
          {hasPin ? '修改 PIN 密码' : '设置 PIN 密码'}
        </button>
      </Section>

      {/* Dialogs */}
      {showPinDialog && (
        <PinDialog
          title="验证 PIN"
          description="切换到更高级别模式需要验证 PIN 密码"
          onSubmit={handlePinSubmit}
          onCancel={() => {
            setShowPinDialog(false);
            setPendingMode(null);
            setSwitchError('');
          }}
        />
      )}

      {showSetPinDialog && (
        <PinDialog
          title={hasPin ? '修改 PIN 密码' : '设置 PIN 密码'}
          description="PIN 用于保护模式切换，请设置 6 位数字密码"
          isSettingNew
          onSubmit={handleSetPin}
          onCancel={() => setShowSetPinDialog(false)}
        />
      )}

      {showAgeConfirm && (
        <AgeConfirmDialog
          onConfirm={handleAgeConfirm}
          onCancel={() => {
            setShowAgeConfirm(false);
            setPendingMode(null);
          }}
        />
      )}
    </>
  );
}

// ===========================================================================
// Account Section
// ===========================================================================

function AccountSection() {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <>
      <Section title="账户设置" icon={User}>
        <div className="space-y-1">
          <button className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition group">
            <div className="flex items-center gap-3">
              <User className="w-4 h-4 text-white/30" />
              <div className="text-left">
                <p className="text-sm text-white/70 group-hover:text-white transition">修改昵称</p>
                <p className="text-[11px] text-white/30">当前：星聚用户</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-white/15 group-hover:text-white/30 transition" />
          </button>

          <button className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition group">
            <div className="flex items-center gap-3">
              <Lock className="w-4 h-4 text-white/30" />
              <div className="text-left">
                <p className="text-sm text-white/70 group-hover:text-white transition">修改密码</p>
                <p className="text-[11px] text-white/30">定期更换密码以保护账户安全</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-white/15 group-hover:text-white/30 transition" />
          </button>

          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-red-500/5 transition group"
          >
            <div className="flex items-center gap-3">
              <Trash2 className="w-4 h-4 text-red-400/50" />
              <div className="text-left">
                <p className="text-sm text-red-400/70 group-hover:text-red-400 transition">注销账户</p>
                <p className="text-[11px] text-white/30">永久删除账户和所有数据</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-white/15 group-hover:text-red-400/30 transition" />
          </button>
        </div>
      </Section>

      {showDeleteConfirm && (
        <DeleteAccountDialog
          onConfirm={() => setShowDeleteConfirm(false)}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </>
  );
}

// ===========================================================================
// Notification Section
// ===========================================================================

function NotificationSection() {
  const [prefs, setPrefs] = useState<Record<string, boolean>>(() => {
    const defaults: Record<string, boolean> = {};
    NOTIF_PREFS.forEach((p) => {
      defaults[p.id] = true;
    });
    return defaults;
  });

  const handleToggle = (id: string, val: boolean) => {
    setPrefs((prev) => ({ ...prev, [id]: val }));
  };

  return (
    <Section title="通知偏好" icon={Bell}>
      <div className="space-y-1">
        {NOTIF_PREFS.map((pref) => {
          const Icon = pref.icon;
          return (
            <div
              key={pref.id}
              className="flex items-center justify-between p-3 rounded-lg"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Icon className="w-4 h-4 text-white/30 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm text-white/70">{pref.label}</p>
                  <p className="text-[11px] text-white/30 truncate">{pref.description}</p>
                </div>
              </div>
              <Toggle
                checked={prefs[pref.id] ?? true}
                onChange={(val) => handleToggle(pref.id, val)}
              />
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ===========================================================================
// Display Section
// ===========================================================================

function DisplaySection() {
  return (
    <Section title="显示设置" icon={Monitor}>
      <div className="space-y-1">
        <div className="flex items-center justify-between p-3 rounded-lg">
          <div className="flex items-center gap-3">
            <Moon className="w-4 h-4 text-white/30" />
            <div>
              <p className="text-sm text-white/70">主题</p>
              <p className="text-[11px] text-white/30">当前仅支持深色模式</p>
            </div>
          </div>
          <span className="text-xs text-white/40 px-2.5 py-1 rounded-md bg-white/5 border border-[#333]">
            深色
          </span>
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg">
          <div className="flex items-center gap-3">
            <Globe className="w-4 h-4 text-white/30" />
            <div>
              <p className="text-sm text-white/70">语言</p>
              <p className="text-[11px] text-white/30">界面显示语言</p>
            </div>
          </div>
          <span className="text-xs text-white/40 px-2.5 py-1 rounded-md bg-white/5 border border-[#333]">
            中文
          </span>
        </div>
      </div>
    </Section>
  );
}

// ===========================================================================
// About Section
// ===========================================================================

function AboutSection() {
  return (
    <Section title="关于" icon={Info}>
      <div className="space-y-1">
        <div className="flex items-center justify-between p-3 rounded-lg">
          <div className="flex items-center gap-3">
            <Info className="w-4 h-4 text-white/30" />
            <p className="text-sm text-white/70">版本号</p>
          </div>
          <span className="text-xs text-white/40">v1.0.1</span>
        </div>

        <a
          href="https://github.com/nicrain/starhub"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition group"
        >
          <div className="flex items-center gap-3">
            <ExternalLink className="w-4 h-4 text-white/30" />
            <p className="text-sm text-white/70 group-hover:text-[#3ea6ff] transition">项目链接</p>
          </div>
          <ChevronRight className="w-4 h-4 text-white/15 group-hover:text-white/30 transition" />
        </a>
      </div>
    </Section>
  );
}

// ===========================================================================
// Main Settings Page
// ===========================================================================

export default function SettingsPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#0f0f0f] text-white">
        <div className="max-w-[700px] mx-auto px-4 py-6 pb-24 md:pb-8 space-y-4">
          {/* Page title */}
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Settings className="w-5 h-5 text-[#3ea6ff]" />
            设置
          </h1>

          {/* AgeGate mode switching — most important */}
          <AgeGateSection />

          {/* Account settings */}
          <AccountSection />

          {/* Notification preferences */}
          <NotificationSection />

          {/* Display settings */}
          <DisplaySection />

          {/* About */}
          <AboutSection />
        </div>
      </main>
    </>
  );
}
