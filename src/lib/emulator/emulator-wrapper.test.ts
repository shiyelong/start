import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for EmulatorWrapper rewind buffer and speed control logic.
 *
 * Since EmulatorWrapper depends on Nostalgist (browser/WASM), we test the
 * rewind buffer logic by accessing the wrapper's public API after manually
 * setting internal state via type-casting.
 */

// We import the class but won't call init() — we'll test the rewind methods
// by mocking the internal nostalgist instance.
import { EmulatorWrapper } from './emulator-wrapper';

// Mock nostalgist module
vi.mock('nostalgist', () => ({
  Nostalgist: {
    launch: vi.fn(),
  },
}));

function createWrapperWithMockEmulator(): EmulatorWrapper {
  const wrapper = new EmulatorWrapper();

  // Inject a mock nostalgist instance so ensureRunning/ensureInitialized pass
  const mockEmulator = {
    saveState: vi.fn(() => new ArrayBuffer(16)),
    loadState: vi.fn(),
    sendCommand: vi.fn(),
    pressDown: vi.fn(),
    pressUp: vi.fn(),
  };

  const mockNostalgist = {
    getEmulator: () => mockEmulator,
    getStatus: () => 'running' as const,
    pause: vi.fn(),
    resume: vi.fn(),
    exit: vi.fn(),
    saveState: vi.fn(async () => ({ state: new Blob(), thumbnail: new Blob() })),
    loadState: vi.fn(),
  };

  // Set internal state via any-cast
  const w = wrapper as unknown as Record<string, unknown>;
  w.nostalgist = mockNostalgist;
  w.platform = 'NES';
  w.romHash = 'testhash';

  return wrapper;
}

describe('EmulatorWrapper — Rewind Buffer', () => {
  let wrapper: EmulatorWrapper;

  beforeEach(() => {
    wrapper = createWrapperWithMockEmulator();
  });

  it('starts with empty rewind buffer (0% level)', () => {
    expect(wrapper.getRewindBufferLevel()).toBe(0);
    expect(wrapper.isRewinding).toBe(false);
  });

  it('captureRewindFrame increases buffer level after enough frames', () => {
    // 1/600 rounds to 0, so capture a few frames
    for (let i = 0; i < 3; i++) {
      wrapper.captureRewindFrame();
    }
    // 3/600 = 0.5% → rounds to 1
    expect(wrapper.getRewindBufferLevel()).toBeGreaterThan(0);
  });

  it('captures multiple frames and increases level', () => {
    for (let i = 0; i < 10; i++) {
      wrapper.captureRewindFrame();
    }
    // 10 / 600 ≈ 1.67% → rounds to 2
    expect(wrapper.getRewindBufferLevel()).toBe(2);
  });

  it('rewindStep sets isRewinding to true', () => {
    // Capture some frames first
    for (let i = 0; i < 5; i++) {
      wrapper.captureRewindFrame();
    }
    wrapper.rewindStep();
    expect(wrapper.isRewinding).toBe(true);
  });

  it('rewindStep decreases buffer size', () => {
    for (let i = 0; i < 10; i++) {
      wrapper.captureRewindFrame();
    }
    const levelBefore = wrapper.getRewindBufferLevel();
    wrapper.rewindStep();
    wrapper.stopRewinding(); // allow further captures
    expect(wrapper.getRewindBufferLevel()).toBeLessThanOrEqual(levelBefore);
  });

  it('rewindStep on empty buffer does nothing', () => {
    wrapper.rewindStep();
    expect(wrapper.isRewinding).toBe(false);
    expect(wrapper.getRewindBufferLevel()).toBe(0);
  });

  it('stopRewinding resets isRewinding flag', () => {
    for (let i = 0; i < 5; i++) {
      wrapper.captureRewindFrame();
    }
    wrapper.rewindStep();
    expect(wrapper.isRewinding).toBe(true);
    wrapper.stopRewinding();
    expect(wrapper.isRewinding).toBe(false);
  });

  it('buffer level caps at 100% after 600+ frames', () => {
    for (let i = 0; i < 650; i++) {
      wrapper.captureRewindFrame();
    }
    expect(wrapper.getRewindBufferLevel()).toBe(100);
  });

  it('does not capture frames while rewinding', () => {
    for (let i = 0; i < 5; i++) {
      wrapper.captureRewindFrame();
    }
    wrapper.rewindStep();
    expect(wrapper.isRewinding).toBe(true);

    const levelDuringRewind = wrapper.getRewindBufferLevel();
    wrapper.captureRewindFrame(); // should be no-op
    expect(wrapper.getRewindBufferLevel()).toBe(levelDuringRewind);
  });
});
