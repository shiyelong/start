/**
 * 游戏全屏工具 — 管理全屏模式、屏幕方向锁定、唤醒锁
 */

/** 请求全屏 */
export async function enterFullscreen(el?: HTMLElement): Promise<boolean> {
  const target = el || document.documentElement;
  try {
    if (target.requestFullscreen) {
      await target.requestFullscreen();
      return true;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = target as any;
    if (t.webkitRequestFullscreen) { t.webkitRequestFullscreen(); return true; }
    if (t.msRequestFullscreen) { t.msRequestFullscreen(); return true; }
  } catch { /* ignore */ }
  return false;
}

/** 退出全屏 */
export async function exitFullscreen(): Promise<void> {
  try {
    if (document.exitFullscreen) { await document.exitFullscreen(); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = document as any;
    if (d.webkitExitFullscreen) d.webkitExitFullscreen();
    if (d.msExitFullscreen) d.msExitFullscreen();
  } catch { /* ignore */ }
}

/** 是否处于全屏 */
export function isFullscreen(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = document as any;
  return !!(document.fullscreenElement || d.webkitFullscreenElement || d.msFullscreenElement);
}

/** 锁定屏幕方向 (landscape/portrait) */
export async function lockOrientation(orientation: "landscape" | "portrait"): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = screen as any;
    if (s.orientation?.lock) {
      await s.orientation.lock(orientation === "landscape" ? "landscape-primary" : "portrait-primary");
      return true;
    }
  } catch { /* not supported */ }
  return false;
}

/** 解锁屏幕方向 */
export function unlockOrientation(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = screen as any;
    if (s.orientation?.unlock) s.orientation.unlock();
  } catch { /* ignore */ }
}

/** 请求唤醒锁 (防止屏幕熄灭) */
export async function requestWakeLock(): Promise<(() => void) | null> {
  try {
    if ("wakeLock" in navigator) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sentinel = await (navigator as any).wakeLock.request("screen");
      return () => sentinel.release();
    }
  } catch { /* not supported */ }
  return null;
}
