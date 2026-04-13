/**
 * 主题功能 & 动画特效工具
 */

export type ThemeMode = "dark" | "light" | "auto";
export type AccentColor = "blue" | "purple" | "green" | "orange" | "pink" | "red";

export const accentColors: Record<AccentColor, { primary: string; hover: string; glow: string }> = {
  blue:   { primary: "#3ea6ff", hover: "#65b8ff", glow: "rgba(62,166,255,0.15)" },
  purple: { primary: "#a855f7", hover: "#c084fc", glow: "rgba(168,85,247,0.15)" },
  green:  { primary: "#2ba640", hover: "#34d058", glow: "rgba(43,166,64,0.15)" },
  orange: { primary: "#f0b90b", hover: "#f5d245", glow: "rgba(240,185,11,0.15)" },
  pink:   { primary: "#ec4899", hover: "#f472b6", glow: "rgba(236,72,153,0.15)" },
  red:    { primary: "#ff4444", hover: "#ff6b6b", glow: "rgba(255,68,68,0.15)" },
};

// CSS动画关键帧定义
export const animations = {
  // 粒子浮动
  float: `
    @keyframes float {
      0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.6; }
      50% { transform: translateY(-20px) rotate(180deg); opacity: 1; }
    }
  `,
  // 光晕脉冲
  glowPulse: `
    @keyframes glowPulse {
      0%, 100% { box-shadow: 0 0 20px var(--glow-color, rgba(62,166,255,0.15)); }
      50% { box-shadow: 0 0 40px var(--glow-color, rgba(62,166,255,0.3)); }
    }
  `,
  // 渐入上滑
  slideInUp: `
    @keyframes slideInUp {
      from { opacity: 0; transform: translateY(30px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `,
  // 缩放弹跳
  bounceIn: `
    @keyframes bounceIn {
      0% { opacity: 0; transform: scale(0.3); }
      50% { opacity: 1; transform: scale(1.05); }
      70% { transform: scale(0.9); }
      100% { transform: scale(1); }
    }
  `,
  // 闪烁
  shimmer: `
    @keyframes shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
  `,
  // 旋转光环
  rotateGlow: `
    @keyframes rotateGlow {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `,
  // 打字机效果
  typewriter: `
    @keyframes typewriter {
      from { width: 0; }
      to { width: 100%; }
    }
  `,
  // 波纹扩散
  ripple: `
    @keyframes ripple {
      0% { transform: scale(0); opacity: 0.5; }
      100% { transform: scale(4); opacity: 0; }
    }
  `,
};

// 获取所有动画CSS
export function getAllAnimationCSS(): string {
  return Object.values(animations).join("\n");
}
