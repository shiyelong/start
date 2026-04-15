'use client';

import { useState, useCallback } from 'react';
import { ageGate } from '@/lib/age-gate';
import type { UserMode } from '@/lib/types';
import {
  ShieldCheck,
  Baby,
  GraduationCap,
  User,
  UserCheck,
  Heart,
  Lock,
  ChevronRight,
} from 'lucide-react';

/**
 * AgeGateModal — 首次访问时的年龄/模式选择弹窗。
 *
 * 用户必须选择一个模式才能继续使用平台。
 * 选择成人模式需要确认年满18岁。
 * 选择后存储到 localStorage，下次不再弹出。
 */

interface ModeOption {
  mode: UserMode;
  label: string;
  description: string;
  ageRange: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  maxRating: string;
}

const MODE_OPTIONS: ModeOption[] = [
  {
    mode: 'child',
    label: '儿童模式',
    description: '仅显示适合所有年龄的内容',
    ageRange: '12岁以下',
    icon: <Baby size={24} />,
    color: 'text-green-400',
    bgColor: 'bg-green-500/10 border-green-500/30 hover:bg-green-500/20',
    maxRating: 'G',
  },
  {
    mode: 'teen',
    label: '青少年模式',
    description: '适合青少年的内容，过滤限制级',
    ageRange: '13-16岁',
    icon: <GraduationCap size={24} />,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20',
    maxRating: 'PG-13',
  },
  {
    mode: 'mature',
    label: '成熟模式',
    description: '包含部分限制级内容',
    ageRange: '17岁',
    icon: <User size={24} />,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10 border-yellow-500/30 hover:bg-yellow-500/20',
    maxRating: 'R',
  },
  {
    mode: 'adult',
    label: '成人模式',
    description: '完整内容访问，包含成人专区',
    ageRange: '18岁以上',
    icon: <UserCheck size={24} />,
    color: 'text-red-400',
    bgColor: 'bg-red-500/10 border-red-500/30 hover:bg-red-500/20',
    maxRating: 'NC-17',
  },
  {
    mode: 'elder',
    label: '长辈模式',
    description: '超大字体，简化界面，仅G/PG内容',
    ageRange: '60岁以上',
    icon: <Heart size={24} />,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10 border-purple-500/30 hover:bg-purple-500/20',
    maxRating: 'PG',
  },
];

interface AgeGateModalProps {
  onComplete: () => void;
}

export default function AgeGateModal({ onComplete }: AgeGateModalProps) {
  const [step, setStep] = useState<'select' | 'confirm-adult' | 'set-pin'>('select');
  const [selectedMode, setSelectedMode] = useState<UserMode | null>(null);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');

  const handleSelectMode = useCallback((mode: UserMode) => {
    setSelectedMode(mode);
    if (mode === 'adult') {
      setStep('confirm-adult');
    } else {
      setStep('set-pin');
    }
  }, []);

  const handleConfirmAdult = useCallback(() => {
    setStep('set-pin');
  }, []);

  const handleSetPin = useCallback(async () => {
    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      setPinError('请输入6位数字密码');
      return;
    }
    if (pin !== confirmPin) {
      setPinError('两次密码不一致');
      return;
    }
    if (!selectedMode) return;

    await ageGate.setPin(pin);
    ageGate.selectMode(selectedMode);
    onComplete();
  }, [pin, confirmPin, selectedMode, onComplete]);

  const handleSkipPin = useCallback(() => {
    if (!selectedMode) return;
    ageGate.selectMode(selectedMode);
    onComplete();
  }, [selectedMode, onComplete]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[#141414] border border-[#333] rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 text-center border-b border-[#333]/50">
          <div className="w-16 h-16 rounded-full bg-[#3ea6ff]/10 flex items-center justify-center mx-auto mb-4">
            <ShieldCheck size={32} className="text-[#3ea6ff]" />
          </div>
          <h1 className="text-xl font-bold text-white mb-1">欢迎来到星聚</h1>
          <p className="text-sm text-[#8a8a8a]">
            {step === 'select' && '请选择你的年龄模式，以获得最适合的内容体验'}
            {step === 'confirm-adult' && '确认你已年满18岁'}
            {step === 'set-pin' && '设置密码锁定当前模式（可选）'}
          </p>
        </div>

        {/* Step 1: Mode Selection */}
        {step === 'select' && (
          <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.mode}
                onClick={() => handleSelectMode(opt.mode)}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${opt.bgColor}`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${opt.color}`}>
                  {opt.icon}
                </div>
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{opt.label}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-[#aaa]">
                      {opt.ageRange}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${opt.color} bg-white/5`}>
                      ≤{opt.maxRating}
                    </span>
                  </div>
                  <p className="text-xs text-[#888] mt-0.5">{opt.description}</p>
                </div>
                <ChevronRight size={16} className="text-[#555]" />
              </button>
            ))}
          </div>
        )}

        {/* Step 2: Adult Confirmation */}
        {step === 'confirm-adult' && (
          <div className="p-6 text-center">
            <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <Lock size={36} className="text-red-400" />
            </div>
            <h2 className="text-lg font-bold text-white mb-2">年龄确认</h2>
            <p className="text-sm text-[#8a8a8a] mb-6 leading-relaxed">
              成人模式包含 NC-17 级内容（成人视频、成人漫画、成人小说等）。
              <br />
              请确认你已年满 <span className="text-red-400 font-bold">18 岁</span>。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setStep('select')}
                className="flex-1 py-3 rounded-xl bg-[#2a2a2a] text-[#aaa] text-sm font-medium hover:bg-[#333] transition"
              >
                返回
              </button>
              <button
                onClick={handleConfirmAdult}
                className="flex-1 py-3 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-500 transition"
              >
                我已年满18岁
              </button>
            </div>
          </div>
        )}

        {/* Step 3: PIN Setup (Optional) */}
        {step === 'set-pin' && (
          <div className="p-6">
            <div className="text-center mb-4">
              <Lock size={24} className="text-[#3ea6ff] mx-auto mb-2" />
              <h2 className="text-base font-bold text-white">设置模式锁定密码</h2>
              <p className="text-xs text-[#888] mt-1">
                设置6位数字密码，防止他人切换到更高级别模式
              </p>
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs text-[#888] mb-1 block">设置密码（6位数字）</label>
                <input
                  type="password"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setPinError(''); }}
                  placeholder="输入6位数字密码"
                  className="w-full h-10 px-4 bg-[#0f0f0f] border border-[#333] rounded-lg text-sm text-white text-center tracking-[0.5em] placeholder-[#555] outline-none focus:border-[#3ea6ff] transition"
                />
              </div>
              <div>
                <label className="text-xs text-[#888] mb-1 block">确认密码</label>
                <input
                  type="password"
                  maxLength={6}
                  value={confirmPin}
                  onChange={(e) => { setConfirmPin(e.target.value.replace(/\D/g, '')); setPinError(''); }}
                  placeholder="再次输入密码"
                  className="w-full h-10 px-4 bg-[#0f0f0f] border border-[#333] rounded-lg text-sm text-white text-center tracking-[0.5em] placeholder-[#555] outline-none focus:border-[#3ea6ff] transition"
                />
              </div>
              {pinError && (
                <p className="text-xs text-red-400 text-center">{pinError}</p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSkipPin}
                className="flex-1 py-3 rounded-xl bg-[#2a2a2a] text-[#aaa] text-sm font-medium hover:bg-[#333] transition"
              >
                跳过
              </button>
              <button
                onClick={handleSetPin}
                className="flex-1 py-3 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] text-sm font-bold hover:bg-[#65b8ff] transition"
              >
                确认
              </button>
            </div>

            <p className="text-[10px] text-[#555] text-center mt-3">
              已选择: <span className="text-[#3ea6ff]">{MODE_OPTIONS.find(o => o.mode === selectedMode)?.label}</span>
              {' · '}密码可在设置中修改
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
