"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronUp } from "lucide-react";

/**
 * 回到顶部按钮 — 滚动超过 400px 后显示
 */
export default function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 400);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={scrollToTop}
      className="fixed bottom-20 lg:bottom-8 right-4 z-40 w-10 h-10 rounded-full bg-[#1a1a1a]/80 border border-white/10 backdrop-blur-sm flex items-center justify-center text-white/60 hover:text-[#3ea6ff] hover:border-[#3ea6ff]/30 transition-all shadow-lg animate-fade-in"
      aria-label="回到顶部"
    >
      <ChevronUp size={20} />
    </button>
  );
}
