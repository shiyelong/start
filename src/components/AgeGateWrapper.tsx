'use client';

import { useState, useEffect } from 'react';
import { ageGate } from '@/lib/age-gate';
import AgeGateModal from '@/components/ui/AgeGateModal';

/**
 * AgeGateWrapper — 包裹整个应用，首次访问时弹出年龄选择。
 *
 * 检查 localStorage 中是否已选择过模式：
 * - 已选择 → 直接渲染 children
 * - 未选择 → 显示 AgeGateModal，选择后才渲染 children
 */
export default function AgeGateWrapper({ children }: { children: React.ReactNode }) {
  const [hasChosen, setHasChosen] = useState<boolean | null>(null);

  useEffect(() => {
    // 客户端检查是否已选择过模式
    setHasChosen(ageGate.hasChosenMode());
  }, []);

  // SSR / 初始加载时不渲染弹窗（避免 hydration mismatch）
  if (hasChosen === null) {
    return <>{children}</>;
  }

  // 未选择过模式 → 显示选择弹窗
  if (!hasChosen) {
    return (
      <>
        {/* 背景模糊显示主页内容 */}
        <div className="blur-sm pointer-events-none select-none">
          {children}
        </div>
        <AgeGateModal onComplete={() => setHasChosen(true)} />
      </>
    );
  }

  // 已选择 → 正常渲染
  return <>{children}</>;
}
