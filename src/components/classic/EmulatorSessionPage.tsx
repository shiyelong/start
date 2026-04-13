'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Header from '@/components/Header';
import EmulatorCanvas from '@/components/classic/EmulatorCanvas';
import GameToolbar from '@/components/classic/GameToolbar';
import SaveStatePanel from '@/components/classic/SaveStatePanel';
import SpeedRewindPanel from '@/components/classic/SpeedRewindPanel';
import VideoFilterSelector from '@/components/classic/VideoFilterSelector';
import AudioControlPanel from '@/components/classic/AudioControlPanel';
import ButtonMapEditor from '@/components/classic/ButtonMapEditor';
import CheatPanel from '@/components/classic/CheatPanel';
import ChatPanel from '@/components/classic/ChatPanel';
import VirtualControls from '@/components/classic/VirtualControls';
import { RomManager } from '@/lib/rom/rom-manager';
import { EmulatorWrapper } from '@/lib/emulator/emulator-wrapper';
import { getCoreForPlatform } from '@/lib/emulator/core-registry';
import type { ConsolePlatform, RomEntry, InputFrame, ChatMessage } from '@/lib/types';
import {
  Loader2, AlertTriangle, ArrowLeft,
  Save, Gauge, Monitor, Volume2, Keyboard, Code, MessageSquare,
} from 'lucide-react';
import Link from 'next/link';

type LoadState =
  | { status: 'loading'; message: string }
  | { status: 'ready' }
  | { status: 'error'; message: string };

// Toolbar panel identifiers
type PanelId = 'saveState' | 'speedRewind' | 'videoFilter' | 'audio' | 'buttonMap' | 'cheat' | null;

export default function EmulatorSessionPage() {
  const params = useParams();
  const router = useRouter();
  const romId = params['rom-id'] as string;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const emulatorRef = useRef<EmulatorWrapper | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const romManagerRef = useRef(new RomManager());

  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading', message: '加载ROM...' });
  const [romEntry, setRomEntry] = useState<RomEntry | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [scale, setScale] = useState(100);
  const [speed, setSpeed] = useState<number>(1);

  // Panel state
  const [activePanel, setActivePanel] = useState<PanelId>(null);

  // Chat state (for multiplayer — stub for single-player)
  const [chatCollapsed, setChatCollapsed] = useState(true);
  const [chatMessages] = useState<ChatMessage[]>([]);
  const isMultiplayer = false; // Will be wired to room client in multiplayer flow

  // Touch device detection
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  const togglePanel = useCallback((panel: PanelId) => {
    setActivePanel((prev) => (prev === panel ? null : panel));
  }, []);

  // Load ROM and initialize emulator
  useEffect(() => {
    let cancelled = false;

    async function loadAndInit() {
      try {
        setLoadState({ status: 'loading', message: '从本地加载ROM...' });

        const entry = await romManagerRef.current.loadLocal(romId);
        if (cancelled) return;

        if (!entry) {
          setLoadState({ status: 'error', message: '未找到ROM文件，请返回游戏库重新选择。' });
          return;
        }

        setRomEntry(entry);

        const coreConfig = getCoreForPlatform(entry.platform);
        if (!coreConfig) {
          setLoadState({ status: 'error', message: `不支持的平台: ${entry.platform}` });
          return;
        }

        setLoadState({ status: 'loading', message: `加载${coreConfig.coreName}模拟器核心...` });

        const waitForCanvas = (): Promise<HTMLCanvasElement> => {
          return new Promise((resolve) => {
            const check = () => {
              if (canvasRef.current) {
                resolve(canvasRef.current);
              } else {
                requestAnimationFrame(check);
              }
            };
            check();
          });
        };

        const canvas = await waitForCanvas();
        if (cancelled) return;

        const wrapper = new EmulatorWrapper();
        emulatorRef.current = wrapper;

        await wrapper.init(canvas, entry.platform, entry.data);
        if (cancelled) {
          wrapper.destroy();
          return;
        }

        setLoadState({ status: 'ready' });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : '模拟器初始化失败';
        setLoadState({ status: 'error', message });
      }
    }

    loadAndInit();

    return () => {
      cancelled = true;
      if (emulatorRef.current) {
        emulatorRef.current.destroy();
        emulatorRef.current = null;
      }
    };
  }, [romId]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Toolbar handlers
  const handleTogglePause = useCallback(() => {
    const emu = emulatorRef.current;
    if (!emu) return;
    try {
      if (isPaused) {
        emu.resume();
        setIsPaused(false);
      } else {
        emu.pause();
        setIsPaused(true);
      }
    } catch {
      // Ignore if emulator not in correct state
    }
  }, [isPaused]);

  const handleToggleMute = useCallback(() => {
    const emu = emulatorRef.current;
    if (!emu) return;
    const newMuted = !isMuted;
    emu.setMasterVolume(newMuted ? 0 : 100);
    setIsMuted(newMuted);
  }, [isMuted]);

  const handleToggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await container.requestFullscreen();
      }
    } catch {
      // Fullscreen not supported or denied
    }
  }, []);

  const handleToggleTheaterMode = useCallback(() => {
    setIsTheaterMode((prev) => !prev);
  }, []);

  const handleSpeedChange = useCallback((newSpeed: number) => {
    const emu = emulatorRef.current;
    if (!emu) return;
    try {
      emu.setSpeed(newSpeed as 0.5 | 1 | 2 | 4);
      setSpeed(newSpeed);
    } catch {
      // Ignore
    }
  }, []);

  const handleSaveState = useCallback(() => {
    togglePanel('saveState');
  }, [togglePanel]);

  const handleExit = useCallback(() => {
    router.push('/games/classic');
  }, [router]);

  const handleVirtualInput = useCallback((input: InputFrame) => {
    const emu = emulatorRef.current;
    if (!emu) return;
    emu.setInputState(0, input);
  }, []);

  const handleSendChat = useCallback((_message: string) => {
    // Will be wired to RoomClient.sendChat() in multiplayer flow
  }, []);

  // Error state
  if (loadState.status === 'error') {
    return (
      <>
        <Header />
        <main className="max-w-[800px] mx-auto px-4 py-16 text-center">
          <AlertTriangle size={48} className="mx-auto mb-4 text-danger" />
          <h2 className="text-lg font-bold mb-2">加载失败</h2>
          <p className="text-muted text-sm mb-6">{loadState.message}</p>
          <Link
            href="/games/classic"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-[#0f0f0f] text-sm font-semibold hover:bg-accent-hover transition"
          >
            <ArrowLeft size={16} />
            返回游戏库
          </Link>
        </main>
      </>
    );
  }

  const platform: ConsolePlatform = romEntry?.platform ?? 'NES';

  return (
    <>
      {/* Header hidden in theater mode */}
      {!isTheaterMode && <Header />}

      <main
        ref={containerRef}
        className={
          isTheaterMode
            ? 'fixed inset-0 z-40 flex flex-col bg-black'
            : 'flex flex-col h-[calc(100vh-3.5rem)] bg-black md:pb-0 pb-14'
        }
      >
        {/* Toolbar */}
        <div className="flex items-center">
          <div className="flex-1 min-w-0">
            <GameToolbar
              isPaused={isPaused}
              isMuted={isMuted}
              isFullscreen={isFullscreen}
              isTheaterMode={isTheaterMode}
              scale={scale}
              speed={speed}
              onTogglePause={handleTogglePause}
              onToggleMute={handleToggleMute}
              onToggleFullscreen={handleToggleFullscreen}
              onToggleTheaterMode={handleToggleTheaterMode}
              onScaleChange={setScale}
              onSpeedChange={handleSpeedChange}
              onSaveState={handleSaveState}
              onExit={handleExit}
            />
          </div>

          {/* Extra toolbar buttons for panels */}
          <div className="flex items-center gap-1 px-2 bg-bg-card/90 backdrop-blur-sm border-b border-border py-2">
            <button
              onClick={() => togglePanel('speedRewind')}
              className={`p-1.5 rounded-lg text-xs transition ${activePanel === 'speedRewind' ? 'bg-accent/15 text-accent' : 'text-subtle hover:text-white hover:bg-bg-hover'}`}
              title="速度与回退"
            >
              <Gauge size={15} />
            </button>
            <button
              onClick={() => togglePanel('videoFilter')}
              className={`p-1.5 rounded-lg text-xs transition ${activePanel === 'videoFilter' ? 'bg-accent/15 text-accent' : 'text-subtle hover:text-white hover:bg-bg-hover'}`}
              title="显示设置"
            >
              <Monitor size={15} />
            </button>
            <button
              onClick={() => togglePanel('audio')}
              className={`p-1.5 rounded-lg text-xs transition ${activePanel === 'audio' ? 'bg-accent/15 text-accent' : 'text-subtle hover:text-white hover:bg-bg-hover'}`}
              title="音频设置"
            >
              <Volume2 size={15} />
            </button>
            <button
              onClick={() => togglePanel('buttonMap')}
              className={`p-1.5 rounded-lg text-xs transition ${activePanel === 'buttonMap' ? 'bg-accent/15 text-accent' : 'text-subtle hover:text-white hover:bg-bg-hover'}`}
              title="按键映射"
            >
              <Keyboard size={15} />
            </button>
            <button
              onClick={() => togglePanel('cheat')}
              className={`p-1.5 rounded-lg text-xs transition ${activePanel === 'cheat' ? 'bg-accent/15 text-accent' : 'text-subtle hover:text-white hover:bg-bg-hover'}`}
              title="金手指"
            >
              <Code size={15} />
            </button>
            {isMultiplayer && (
              <button
                onClick={() => setChatCollapsed((c) => !c)}
                className={`p-1.5 rounded-lg text-xs transition ${!chatCollapsed ? 'bg-accent/15 text-accent' : 'text-subtle hover:text-white hover:bg-bg-hover'}`}
                title="聊天"
              >
                <MessageSquare size={15} />
              </button>
            )}
          </div>
        </div>

        {/* Main content area */}
        <div className="flex flex-1 min-h-0 relative">
          {/* Canvas Area */}
          <div className="flex-1 relative">
            <EmulatorCanvas
              platform={platform}
              scale={scale}
              canvasRef={canvasRef}
              isFullscreen={isFullscreen}
              onRequestFullscreen={handleToggleFullscreen}
              onExitFullscreen={handleToggleFullscreen}
            />

            {/* Loading overlay */}
            {loadState.status === 'loading' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10">
                <Loader2 size={32} className="animate-spin text-accent mb-3" />
                <p className="text-sm text-subtle">{loadState.message}</p>
              </div>
            )}

            {/* Pause overlay */}
            {isPaused && loadState.status === 'ready' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10 pointer-events-none">
                <div className="px-6 py-3 rounded-xl bg-bg-card/90 backdrop-blur-sm border border-border">
                  <p className="text-sm font-bold text-accent">已暂停</p>
                </div>
              </div>
            )}

            {/* Virtual Controls for touch devices */}
            {isTouchDevice && loadState.status === 'ready' && (
              <VirtualControls
                platform={platform}
                onInput={handleVirtualInput}
                opacity={0.75}
                size="medium"
              />
            )}
          </div>

          {/* Chat panel (multiplayer only) */}
          {isMultiplayer && (
            <ChatPanel
              messages={chatMessages}
              onSendMessage={handleSendChat}
              isCollapsed={chatCollapsed}
              onToggleCollapse={() => setChatCollapsed((c) => !c)}
            />
          )}
        </div>

        {/* Cheat panel (inline, not a slide-over) */}
        {activePanel === 'cheat' && romEntry && (
          <div className="absolute top-12 right-0 z-30 w-80 max-w-[90vw] h-[calc(100%-3rem)] bg-bg-card border-l border-border shadow-xl overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="text-sm font-bold flex items-center gap-2">
                <Code size={16} className="text-accent" />
                金手指
              </h2>
              <button
                onClick={() => setActivePanel(null)}
                className="p-1 rounded-lg text-muted hover:text-white hover:bg-bg-hover transition text-lg"
              >
                ?
              </button>
            </div>
            <CheatPanel
              romHash={romEntry.hash}
              platform={platform}
              isMultiplayer={isMultiplayer}
              onAddCheat={(code, format) => {
                emulatorRef.current?.addCheat(code, format);
              }}
              onRemoveCheat={(code) => {
                emulatorRef.current?.removeCheat(code);
              }}
            />
          </div>
        )}
      </main>

      {/* Slide-over panels */}
      <SaveStatePanel
        emulator={emulatorRef.current}
        isOpen={activePanel === 'saveState'}
        onClose={() => setActivePanel(null)}
        isMultiplayer={isMultiplayer}
      />

      <SpeedRewindPanel
        emulator={emulatorRef.current}
        isOpen={activePanel === 'speedRewind'}
        onClose={() => setActivePanel(null)}
        isMultiplayer={isMultiplayer}
        currentSpeed={speed}
        onSpeedChange={handleSpeedChange}
      />

      <VideoFilterSelector
        platform={platform}
        isOpen={activePanel === 'videoFilter'}
        onClose={() => setActivePanel(null)}
        onFilterChange={(filter) => {
          emulatorRef.current?.setVideoFilter(filter);
        }}
        onPaletteChange={(palette) => {
          emulatorRef.current?.setColorPalette(palette);
        }}
      />

      <AudioControlPanel
        platform={platform}
        isOpen={activePanel === 'audio'}
        onClose={() => setActivePanel(null)}
        onVolumeChange={(vol) => {
          emulatorRef.current?.setMasterVolume(vol);
          setIsMuted(vol === 0);
        }}
        onChannelMuteChange={(channel, muted) => {
          emulatorRef.current?.setChannelMute(channel, muted);
        }}
        onLatencyChange={(ms) => {
          emulatorRef.current?.setAudioLatency(ms);
        }}
      />

      <ButtonMapEditor
        platform={platform}
        isOpen={activePanel === 'buttonMap'}
        onClose={() => setActivePanel(null)}
      />
    </>
  );
}
