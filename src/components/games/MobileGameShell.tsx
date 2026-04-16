"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Maximize2, Minimize2, Volume2, VolumeX } from "lucide-react";
import { enterFullscreen, exitFullscreen, isFullscreen, lockOrientation, unlockOrientation, requestWakeLock } from "@/lib/game-engine/fullscreen";
import { getPlatformInfo } from "@/lib/platform/detect";

interface Props {
  title: string;
  /** 是否支持全屏 (默认 true) */
  allowFullscreen?: boolean;
  /** 全屏时锁定方向 */
  orientation?: "landscape" | "portrait";
  /** 静音状态 */
  muted?: boolean;
  onToggleMute?: () => void;
  /** 返回路径 (默认 /games) */
  backHref?: string;
  /** 额外的顶栏按钮 */
  extraButtons?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * 移动端游戏外壳 — 提供统一的顶栏、全屏、返回、静音控制
 * 在移动端自动隐藏 Header，提供沉浸式游戏体验
 */
export default function MobileGameShell({
  title, allowFullscreen = true, orientation,
  muted, onToggleMute, backHref = "/games",
  extraButtons, children,
}: Props) {
  const router = useRouter();
  const [isFull, setIsFull] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [barVisible, setBarVisible] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const wakeLockRef = useRef<(() => void) | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const info = getPlatformInfo();
    setIsMobile(info.formFactor === "mobile" || info.formFactor === "tablet");
  }, []);

  // 全屏变化监听
  useEffect(() => {
    const onChange = () => setIsFull(isFullscreen());
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);

  // 全屏时自动隐藏顶栏
  useEffect(() => {
    if (isFull) {
      hideTimerRef.current = setTimeout(() => setBarVisible(false), 3000);
    } else {
      setBarVisible(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    }
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, [isFull]);

  // 唤醒锁
  useEffect(() => {
    requestWakeLock().then(release => { wakeLockRef.current = release; });
    return () => { wakeLockRef.current?.(); };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (isFullscreen()) {
      await exitFullscreen();
      unlockOrientation();
    } else {
      await enterFullscreen(containerRef.current || undefined);
      if (orientation) await lockOrientation(orientation);
    }
  }, [orientation]);

  const handleBack = useCallback(() => {
    if (isFullscreen()) {
      exitFullscreen();
      unlockOrientation();
    }
    router.push(backHref);
  }, [router, backHref]);

  const showBar = () => {
    setBarVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (isFull) {
      hideTimerRef.current = setTimeout(() => setBarVisible(false), 3000);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative bg-[#0f0f0f] ${isFull ? "fixed inset-0 z-[9999]" : "min-h-0"}`}
      onTouchStart={isFull ? showBar : undefined}
      onMouseMove={isFull ? showBar : undefined}
    >
      {/* 顶栏 */}
      <div
        className={`flex items-center gap-2 px-3 py-2 bg-[#0f0f0f]/90 backdrop-blur-sm transition-all duration-300 ${
          isFull ? `absolute top-0 left-0 right-0 z-50 ${barVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-full pointer-events-none"}` : ""
        }`}
        style={isFull ? { paddingTop: "env(safe-area-inset-top, 0px)" } : undefined}
      >
        <button
          onClick={handleBack}
          className="p-2 -ml-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 active:bg-white/10 transition"
          aria-label="返回"
        >
          <ArrowLeft size={20} />
        </button>

        <h1 className="text-sm font-bold text-white truncate flex-1">{title}</h1>

        {extraButtons}

        {onToggleMute && (
          <button
            onClick={onToggleMute}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 active:bg-white/10 transition"
            aria-label={muted ? "开启音效" : "关闭音效"}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        )}

        {allowFullscreen && (
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 active:bg-white/10 transition"
            aria-label={isFull ? "退出全屏" : "全屏"}
          >
            {isFull ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        )}
      </div>

      {/* 游戏内容 */}
      <div className={isFull ? "w-full h-full" : ""}>
        {children}
      </div>

      {/* 移动端底部安全区 */}
      {!isFull && isMobile && (
        <div className="h-[env(safe-area-inset-bottom,0px)]" />
      )}
    </div>
  );
}
