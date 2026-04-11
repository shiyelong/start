// ---------------------------------------------------------------------------
// Performance Monitor — Runtime performance tracking for emulator sessions
// Validates: Requirements 15.1, 15.2, 15.3, 15.4
// ---------------------------------------------------------------------------

/** Rolling window size for FPS calculation (number of frame timestamps kept). */
const FRAME_WINDOW_SIZE = 60;

/** Duration (ms) of sustained low FPS before firing a warning. */
const LOW_FPS_THRESHOLD_MS = 2000;

/**
 * Lightweight performance monitor that tracks frame rate, detects sustained
 * FPS drops, and provides timing utilities for WASM core load and search
 * response measurement.
 */
export class PerformanceMonitor {
  private targetFps: number;
  private frameTimes: number[] = [];
  private warningCallback: ((message: string) => void) | null = null;
  private lowFpsStart: number | null = null;
  private warningFired = false;

  constructor(targetFps: number) {
    this.targetFps = targetFps;
  }

  // -----------------------------------------------------------------------
  // Frame tracking
  // -----------------------------------------------------------------------

  /**
   * Record a frame timestamp (from `requestAnimationFrame` or similar).
   * Maintains a rolling window of the last {@link FRAME_WINDOW_SIZE} timestamps
   * and checks for sustained low-FPS conditions.
   */
  recordFrame(timestamp: number): void {
    this.frameTimes.push(timestamp);

    // Keep only the rolling window
    if (this.frameTimes.length > FRAME_WINDOW_SIZE) {
      this.frameTimes.shift();
    }

    this.checkLowFps(timestamp);
  }

  /**
   * Calculate the current FPS from the rolling window of frame timestamps.
   * Returns 0 when fewer than 2 frames have been recorded.
   */
  getCurrentFps(): number {
    if (this.frameTimes.length < 2) return 0;

    const oldest = this.frameTimes[0];
    const newest = this.frameTimes[this.frameTimes.length - 1];
    const elapsed = newest - oldest;

    if (elapsed <= 0) return 0;

    // Number of frame intervals = number of timestamps - 1
    return ((this.frameTimes.length - 1) / elapsed) * 1000;
  }

  /**
   * Register a callback that fires when the frame rate drops below 90% of
   * the target for 2+ consecutive seconds.
   */
  onPerformanceWarning(callback: (message: string) => void): void {
    this.warningCallback = callback;
  }

  /** Reset internal state (useful when switching ROMs or re-initializing). */
  reset(): void {
    this.frameTimes = [];
    this.lowFpsStart = null;
    this.warningFired = false;
  }

  // -----------------------------------------------------------------------
  // Static timing utilities
  // -----------------------------------------------------------------------

  /**
   * Start a load-time measurement. Call `.end()` on the returned object to
   * get the elapsed time in milliseconds.
   *
   * ```ts
   * const timer = PerformanceMonitor.measureLoadTime('wasm-core');
   * await loadCore();
   * const ms = timer.end();
   * ```
   */
  static measureLoadTime(label: string): { label: string; end: () => number } {
    const start = performance.now();
    return {
      label,
      end(): number {
        return performance.now() - start;
      },
    };
  }

  /**
   * Measure elapsed time since a given start timestamp (from `performance.now()`).
   * Returns the duration in milliseconds.
   */
  static measureSearchTime(startTime: number): number {
    return performance.now() - startTime;
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private checkLowFps(currentTimestamp: number): void {
    const fps = this.getCurrentFps();
    const threshold = this.targetFps * 0.9;

    if (fps > 0 && fps < threshold) {
      // FPS is below 90% of target
      if (this.lowFpsStart === null) {
        this.lowFpsStart = currentTimestamp;
        this.warningFired = false;
      } else if (
        !this.warningFired &&
        currentTimestamp - this.lowFpsStart >= LOW_FPS_THRESHOLD_MS
      ) {
        this.warningFired = true;
        this.warningCallback?.(
          `Performance warning: frame rate (${fps.toFixed(1)} FPS) has been below ` +
            `${(threshold).toFixed(0)} FPS for over 2 seconds`,
        );
      }
    } else {
      // FPS recovered — reset tracking
      this.lowFpsStart = null;
      this.warningFired = false;
    }
  }
}
