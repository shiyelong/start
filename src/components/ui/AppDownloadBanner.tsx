'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Download, X } from 'lucide-react';

const DISMISS_KEY = 'app-download-banner-dismissed';
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  // Capacitor injects this global
  if ('Capacitor' in window) return true;
  // Electron injects this on the window
  if ('electronAPI' in window || navigator.userAgent.includes('Electron')) return true;
  return false;
}

export default function AppDownloadBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Don't show in native apps
    if (isNativeApp()) return;

    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed) {
      const ts = parseInt(dismissed, 10);
      if (Date.now() - ts < DISMISS_DURATION) return;
    }
    // Small delay so it doesn't flash on load
    const timer = setTimeout(() => setVisible(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-20 lg:bottom-6 right-4 z-40 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="flex items-center gap-2 bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-2.5 shadow-2xl shadow-black/40">
        <Link
          href="/download"
          className="flex items-center gap-2 text-sm text-white hover:text-[#3ea6ff] transition-colors"
        >
          <div className="w-8 h-8 rounded-lg bg-[#3ea6ff]/15 flex items-center justify-center shrink-0">
            <Download className="w-4 h-4 text-[#3ea6ff]" />
          </div>
          <span className="font-medium">下载星聚APP</span>
        </Link>
        <button
          onClick={dismiss}
          className="p-1 rounded-md text-gray-500 hover:text-white hover:bg-white/10 transition-colors ml-1"
          aria-label="关闭"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
