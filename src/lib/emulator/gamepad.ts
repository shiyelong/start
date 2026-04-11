/**
 * Gamepad support module — detects gamepads via Gamepad API,
 * provides pre-configured profiles, supports up to 4 gamepads,
 * simultaneous keyboard + gamepad input, disconnect handling,
 * and analog stick dead zone calibration.
 *
 * Requirements: 28.1-28.8, 18.6-18.7
 */

import type { InputFrame, ButtonMap } from '@/lib/types';

// ---------------------------------------------------------------------------
// Gamepad profiles
// ---------------------------------------------------------------------------

export interface GamepadProfile {
  name: string;
  /** Maps standard Gamepad API button indices to InputFrame keys */
  buttonMap: Record<number, keyof InputFrame>;
  /** Maps axes indices to d-pad directions: [axisIndex, threshold, direction] */
  axes: [number, number, keyof InputFrame][];
}

const XBOX_PROFILE: GamepadProfile = {
  name: 'Xbox',
  buttonMap: {
    0: 'a', 1: 'b', 2: 'x', 3: 'y',
    4: 'l', 5: 'r',
    8: 'select', 9: 'start',
    12: 'up', 13: 'down', 14: 'left', 15: 'right',
  },
  axes: [
    [0, -0.5, 'left'], [0, 0.5, 'right'],
    [1, -0.5, 'up'], [1, 0.5, 'down'],
  ],
};

const PLAYSTATION_PROFILE: GamepadProfile = {
  name: 'PlayStation',
  buttonMap: {
    0: 'a', 1: 'b', 2: 'x', 3: 'y',
    4: 'l', 5: 'r',
    8: 'select', 9: 'start',
    12: 'up', 13: 'down', 14: 'left', 15: 'right',
  },
  axes: [
    [0, -0.5, 'left'], [0, 0.5, 'right'],
    [1, -0.5, 'up'], [1, 0.5, 'down'],
  ],
};

const SWITCH_PRO_PROFILE: GamepadProfile = {
  name: 'Switch Pro',
  buttonMap: {
    0: 'b', 1: 'a', 2: 'y', 3: 'x',
    4: 'l', 5: 'r',
    8: 'select', 9: 'start',
    12: 'up', 13: 'down', 14: 'left', 15: 'right',
  },
  axes: [
    [0, -0.5, 'left'], [0, 0.5, 'right'],
    [1, -0.5, 'up'], [1, 0.5, 'down'],
  ],
};

const EIGHTBITDO_PROFILE: GamepadProfile = {
  name: '8BitDo',
  buttonMap: {
    0: 'b', 1: 'a', 3: 'x', 4: 'y',
    6: 'l', 7: 'r',
    10: 'select', 11: 'start',
    12: 'up', 13: 'down', 14: 'left', 15: 'right',
  },
  axes: [
    [0, -0.5, 'left'], [0, 0.5, 'right'],
    [1, -0.5, 'up'], [1, 0.5, 'down'],
  ],
};

export const GAMEPAD_PROFILES: Record<string, GamepadProfile> = {
  xbox: XBOX_PROFILE,
  playstation: PLAYSTATION_PROFILE,
  switch_pro: SWITCH_PRO_PROFILE,
  '8bitdo': EIGHTBITDO_PROFILE,
};

const DEFAULT_PROFILE = XBOX_PROFILE;

// ---------------------------------------------------------------------------
// Detect profile from gamepad id string
// ---------------------------------------------------------------------------

function detectProfile(id: string): GamepadProfile {
  const lower = id.toLowerCase();
  if (lower.includes('xbox') || lower.includes('xinput')) return XBOX_PROFILE;
  if (lower.includes('playstation') || lower.includes('dualshock') || lower.includes('dualsense')) return PLAYSTATION_PROFILE;
  if (lower.includes('pro controller') || lower.includes('switch')) return SWITCH_PRO_PROFILE;
  if (lower.includes('8bitdo')) return EIGHTBITDO_PROFILE;
  return DEFAULT_PROFILE;
}

// ---------------------------------------------------------------------------
// Neutral input
// ---------------------------------------------------------------------------

function neutralInput(): InputFrame {
  return {
    up: false, down: false, left: false, right: false,
    a: false, b: false, x: false, y: false,
    l: false, r: false, start: false, select: false,
    turbo: {},
  };
}

// ---------------------------------------------------------------------------
// GamepadManager
// ---------------------------------------------------------------------------

export type GamepadEventCallback = (type: 'connected' | 'disconnected', index: number, name: string) => void;

export class GamepadManager {
  private profiles: Map<number, GamepadProfile> = new Map();
  private deadZone = 0.25;
  private pollId: number | null = null;
  private eventCallback: GamepadEventCallback | null = null;
  private connectHandler: ((e: GamepadEvent) => void) | null = null;
  private disconnectHandler: ((e: GamepadEvent) => void) | null = null;

  /** Maximum supported gamepads */
  static readonly MAX_GAMEPADS = 4;

  start(onEvent?: GamepadEventCallback): void {
    if (typeof window === 'undefined' || !navigator.getGamepads) return;

    this.eventCallback = onEvent ?? null;

    this.connectHandler = (e: GamepadEvent) => {
      const gp = e.gamepad;
      if (gp.index >= GamepadManager.MAX_GAMEPADS) return;
      const profile = detectProfile(gp.id);
      this.profiles.set(gp.index, profile);
      this.eventCallback?.('connected', gp.index, `${profile.name} (${gp.id})`);
    };

    this.disconnectHandler = (e: GamepadEvent) => {
      this.profiles.delete(e.gamepad.index);
      this.eventCallback?.('disconnected', e.gamepad.index, e.gamepad.id);
    };

    window.addEventListener('gamepadconnected', this.connectHandler);
    window.addEventListener('gamepaddisconnected', this.disconnectHandler);

    // Detect already-connected gamepads
    const gamepads = navigator.getGamepads();
    for (const gp of gamepads) {
      if (gp && gp.index < GamepadManager.MAX_GAMEPADS) {
        const profile = detectProfile(gp.id);
        this.profiles.set(gp.index, profile);
        this.eventCallback?.('connected', gp.index, `${profile.name} (${gp.id})`);
      }
    }
  }

  stop(): void {
    if (typeof window === 'undefined') return;
    if (this.connectHandler) window.removeEventListener('gamepadconnected', this.connectHandler);
    if (this.disconnectHandler) window.removeEventListener('gamepaddisconnected', this.disconnectHandler);
    if (this.pollId !== null) cancelAnimationFrame(this.pollId);
    this.profiles.clear();
    this.connectHandler = null;
    this.disconnectHandler = null;
    this.pollId = null;
  }

  /** Read input from a specific gamepad index (0-3). Returns null if not connected. */
  readInput(index: number): InputFrame | null {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const gamepads = navigator.getGamepads();
    const gp = gamepads[index];
    if (!gp) return null;

    const profile = this.profiles.get(index) ?? DEFAULT_PROFILE;
    const frame = neutralInput();

    // Buttons
    for (const [btnIdx, key] of Object.entries(profile.buttonMap)) {
      const button = gp.buttons[Number(btnIdx)];
      if (button?.pressed) {
        (frame as unknown as Record<string, boolean>)[key] = true;
      }
    }

    // Axes (analog sticks → d-pad)
    for (const [axisIdx, threshold, direction] of profile.axes) {
      const value = gp.axes[axisIdx] ?? 0;
      if (threshold < 0 && value < threshold + this.deadZone * Math.sign(threshold)) {
        (frame as unknown as Record<string, boolean>)[direction] = true;
      } else if (threshold > 0 && value > threshold - this.deadZone * Math.sign(threshold)) {
        (frame as unknown as Record<string, boolean>)[direction] = true;
      }
    }

    return frame;
  }

  /** Read inputs from all connected gamepads. Returns array indexed by gamepad index. */
  readAllInputs(): (InputFrame | null)[] {
    const results: (InputFrame | null)[] = [];
    for (let i = 0; i < GamepadManager.MAX_GAMEPADS; i++) {
      results.push(this.readInput(i));
    }
    return results;
  }

  /** Merge keyboard input with gamepad input (gamepad takes priority for pressed buttons). */
  static mergeInputs(keyboard: InputFrame, gamepad: InputFrame | null): InputFrame {
    if (!gamepad) return keyboard;
    const merged = { ...keyboard, turbo: { ...keyboard.turbo } };
    const keys: (keyof Omit<InputFrame, 'turbo'>)[] = [
      'up', 'down', 'left', 'right', 'a', 'b', 'x', 'y', 'l', 'r', 'start', 'select',
    ];
    for (const k of keys) {
      if (gamepad[k]) merged[k] = true;
    }
    return merged;
  }

  /** Set analog stick dead zone (0-1). */
  setDeadZone(value: number): void {
    this.deadZone = Math.max(0, Math.min(1, value));
  }

  getDeadZone(): number {
    return this.deadZone;
  }

  /** Get connected gamepad count. */
  getConnectedCount(): number {
    return this.profiles.size;
  }

  /** Check if a specific gamepad index is connected. */
  isConnected(index: number): boolean {
    return this.profiles.has(index);
  }

  /** Set a custom profile for a gamepad index. */
  setProfile(index: number, profileKey: string): void {
    const profile = GAMEPAD_PROFILES[profileKey];
    if (profile) this.profiles.set(index, profile);
  }
}
