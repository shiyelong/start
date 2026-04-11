import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PerformanceMonitor } from './performance-monitor';

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    monitor = new PerformanceMonitor(60); // 60 FPS NTSC target
  });

  // -----------------------------------------------------------------------
  // FPS calculation
  // -----------------------------------------------------------------------

  describe('getCurrentFps', () => {
    it('returns 0 with fewer than 2 frames', () => {
      expect(monitor.getCurrentFps()).toBe(0);
      monitor.recordFrame(0);
      expect(monitor.getCurrentFps()).toBe(0);
    });

    it('calculates ~60 FPS from 60 Hz frame timestamps', () => {
      // Simulate 61 frames at ~16.67ms intervals (60 FPS)
      for (let i = 0; i <= 60; i++) {
        monitor.recordFrame(i * (1000 / 60));
      }
      const fps = monitor.getCurrentFps();
      expect(fps).toBeCloseTo(60, 0);
    });

    it('calculates ~50 FPS for PAL timing', () => {
      const palMonitor = new PerformanceMonitor(50);
      // 51 frames at 20ms intervals (50 FPS)
      for (let i = 0; i <= 50; i++) {
        palMonitor.recordFrame(i * 20);
      }
      const fps = palMonitor.getCurrentFps();
      expect(fps).toBeCloseTo(50, 0);
    });

    it('maintains a rolling window of 60 frames', () => {
      // Record 120 frames — only the last 60 should be kept
      for (let i = 0; i < 120; i++) {
        monitor.recordFrame(i * (1000 / 60));
      }
      const fps = monitor.getCurrentFps();
      // Should still be ~60 FPS from the rolling window
      expect(fps).toBeCloseTo(60, 0);
    });

    it('detects low FPS when frames are slow', () => {
      // Simulate 30 FPS (~33.33ms per frame)
      for (let i = 0; i <= 60; i++) {
        monitor.recordFrame(i * (1000 / 30));
      }
      const fps = monitor.getCurrentFps();
      expect(fps).toBeCloseTo(30, 0);
    });
  });

  // -----------------------------------------------------------------------
  // Performance warning (90% threshold for 2+ seconds)
  // -----------------------------------------------------------------------

  describe('performance warning', () => {
    it('fires warning when FPS < 90% of target for 2+ seconds', () => {
      const callback = vi.fn();
      monitor.onPerformanceWarning(callback);

      // Simulate frames at 30 FPS for 3 seconds (well below 54 FPS threshold)
      const frameInterval = 1000 / 30; // ~33.33ms
      const totalFrames = 90; // 3 seconds at 30 FPS
      for (let i = 0; i <= totalFrames; i++) {
        monitor.recordFrame(i * frameInterval);
      }

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.stringContaining('Performance warning'),
      );
    });

    it('does NOT fire warning when FPS is above 90% of target', () => {
      const callback = vi.fn();
      monitor.onPerformanceWarning(callback);

      // Simulate frames at 58 FPS (above 54 FPS threshold for 60 FPS target)
      const frameInterval = 1000 / 58;
      for (let i = 0; i <= 180; i++) {
        monitor.recordFrame(i * frameInterval);
      }

      expect(callback).not.toHaveBeenCalled();
    });

    it('does NOT fire warning if low FPS lasts less than 2 seconds', () => {
      const callback = vi.fn();
      monitor.onPerformanceWarning(callback);

      // Simulate 1 second of low FPS (30 FPS)
      for (let i = 0; i <= 30; i++) {
        monitor.recordFrame(i * (1000 / 30));
      }

      expect(callback).not.toHaveBeenCalled();
    });

    it('fires warning only once per sustained drop', () => {
      const callback = vi.fn();
      monitor.onPerformanceWarning(callback);

      // Simulate 5 seconds of low FPS
      const frameInterval = 1000 / 30;
      for (let i = 0; i <= 150; i++) {
        monitor.recordFrame(i * frameInterval);
      }

      // Should fire exactly once, not repeatedly
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('resets and can fire again after FPS recovers', () => {
      const callback = vi.fn();
      monitor.onPerformanceWarning(callback);

      // Phase 1: Low FPS for 3 seconds → triggers warning
      for (let i = 0; i <= 90; i++) {
        monitor.recordFrame(i * (1000 / 30));
      }
      expect(callback).toHaveBeenCalledTimes(1);

      // Phase 2: Recovery — high FPS frames to reset the window
      monitor.reset();
      const baseTime = 5000;
      for (let i = 0; i <= 60; i++) {
        monitor.recordFrame(baseTime + i * (1000 / 60));
      }

      // Phase 3: Drop again for 3 seconds → should fire again
      const baseTime2 = 10000;
      for (let i = 0; i <= 90; i++) {
        monitor.recordFrame(baseTime2 + i * (1000 / 30));
      }
      expect(callback).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // reset()
  // -----------------------------------------------------------------------

  describe('reset', () => {
    it('clears frame history and warning state', () => {
      for (let i = 0; i <= 60; i++) {
        monitor.recordFrame(i * (1000 / 60));
      }
      expect(monitor.getCurrentFps()).toBeGreaterThan(0);

      monitor.reset();
      expect(monitor.getCurrentFps()).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Static timing utilities
  // -----------------------------------------------------------------------

  describe('measureLoadTime', () => {
    it('returns elapsed time in milliseconds', () => {
      const timer = PerformanceMonitor.measureLoadTime('wasm-core');
      expect(timer.label).toBe('wasm-core');

      // The end() call should return a non-negative number
      const elapsed = timer.end();
      expect(elapsed).toBeGreaterThanOrEqual(0);
      expect(typeof elapsed).toBe('number');
    });
  });

  describe('measureSearchTime', () => {
    it('returns elapsed time from a start timestamp', () => {
      const start = performance.now();
      const elapsed = PerformanceMonitor.measureSearchTime(start);
      expect(elapsed).toBeGreaterThanOrEqual(0);
      expect(typeof elapsed).toBe('number');
    });
  });
});
