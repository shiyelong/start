import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateRoomCode, GameRoom } from './game-room';

// ---- Helpers for testing GameRoom ----

function neutralInput() {
  return {
    up: false, down: false, left: false, right: false,
    a: false, b: false, x: false, y: false,
    l: false, r: false,
    start: false, select: false,
    turbo: {},
  };
}

function makeInput(overrides: Record<string, boolean> = {}) {
  return { ...neutralInput(), ...overrides };
}

/** Minimal mock for DurableObjectState */
function mockState(): any {
  return {
    acceptWebSocket: vi.fn(),
    storage: {
      setAlarm: vi.fn().mockResolvedValue(undefined),
    },
  };
}

/** Minimal mock for WorkerEnv */
function mockEnv(): any {
  return {};
}

/** Create a mock WebSocket that records sent messages */
function mockWs(): WebSocket & { sent: any[] } {
  const sent: any[] = [];
  return {
    send(data: string) { sent.push(JSON.parse(data)); },
    close: vi.fn(),
    sent,
  } as any;
}

/**
 * Set up a GameRoom in playing state with the given player IDs.
 * Returns the room and the mock WebSockets for each player.
 */
function setupPlayingRoom(playerIds: string[]): { room: GameRoom; sockets: Map<string, ReturnType<typeof mockWs>> } {
  const room = new GameRoom(mockState(), mockEnv());
  const sockets = new Map<string, ReturnType<typeof mockWs>>();

  // Configure room
  (room as any).roomConfig.romHash = 'test-rom';
  (room as any).roomConfig.maxPlayers = 4;
  (room as any).roomConfig.inputDelay = 2;
  (room as any).roomCode = 'ABCDEF';

  // Add players
  for (let i = 0; i < playerIds.length; i++) {
    const ws = mockWs();
    sockets.set(playerIds[i], ws);
    (room as any).players.set(playerIds[i], {
      ws,
      info: {
        playerId: playerIds[i],
        displayName: playerIds[i],
        slot: i + 1,
        latencyMs: 0,
        isHost: i === 0,
      },
    });
  }

  if (playerIds.length > 0) {
    (room as any).hostId = playerIds[0];
  }

  // Transition to playing
  (room as any).roomPhase = 'playing';
  (room as any).currentFrame = 0;

  return { room, sockets };
}

describe('generateRoomCode', () => {
  it('produces a 6-character string', () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(6);
  });

  it('contains only uppercase alphanumeric characters [A-Z0-9]', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode();
      expect(code).toMatch(/^[A-Z0-9]{6}$/);
    }
  });

  it('generates distinct codes across multiple calls', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      codes.add(generateRoomCode());
    }
    // With 36^6 ≈ 2.2 billion possibilities, 100 codes should all be unique
    expect(codes.size).toBe(100);
  });
});

describe('Lockstep input synchronization', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('collectAndBroadcastInputs', () => {
    it('broadcasts combined inputs when all players submit for the current frame', () => {
      const { room, sockets } = setupPlayingRoom(['p1', 'p2']);

      // Both players submit input for frame 0
      const p1Input = makeInput({ a: true });
      const p2Input = makeInput({ b: true });

      (room as any).pendingInputs.set(0, new Map([
        ['p1', p1Input],
        ['p2', p2Input],
      ]));

      room.collectAndBroadcastInputs(0);

      // Both players should receive frame_inputs
      const p1Msgs = sockets.get('p1')!.sent;
      const p2Msgs = sockets.get('p2')!.sent;

      const p1FrameMsg = p1Msgs.find((m: any) => m.type === 'frame_inputs');
      const p2FrameMsg = p2Msgs.find((m: any) => m.type === 'frame_inputs');

      expect(p1FrameMsg).toBeDefined();
      expect(p1FrameMsg.frame).toBe(0);
      expect(p1FrameMsg.inputs.p1.a).toBe(true);
      expect(p1FrameMsg.inputs.p2.b).toBe(true);

      // Both players get identical combined inputs
      expect(p1FrameMsg.inputs).toEqual(p2FrameMsg.inputs);

      // Frame counter should advance
      expect((room as any).currentFrame).toBe(1);
    });

    it('does not broadcast when not all players have submitted', () => {
      const { room, sockets } = setupPlayingRoom(['p1', 'p2']);

      // Only p1 submits
      (room as any).pendingInputs.set(0, new Map([
        ['p1', makeInput({ a: true })],
      ]));

      room.collectAndBroadcastInputs(0);

      // No frame_inputs should be sent
      const p1Msgs = sockets.get('p1')!.sent;
      expect(p1Msgs.find((m: any) => m.type === 'frame_inputs')).toBeUndefined();
      expect((room as any).currentFrame).toBe(0);
    });

    it('advances through multiple frames when pipelined inputs are available', () => {
      const { room, sockets } = setupPlayingRoom(['p1', 'p2']);

      // Pre-fill inputs for frames 0 and 1
      (room as any).pendingInputs.set(0, new Map([
        ['p1', makeInput({ a: true })],
        ['p2', makeInput()],
      ]));
      (room as any).pendingInputs.set(1, new Map([
        ['p1', makeInput({ b: true })],
        ['p2', makeInput({ up: true })],
      ]));

      room.collectAndBroadcastInputs(0);

      // Should have advanced to frame 2
      expect((room as any).currentFrame).toBe(2);

      // Both frames should have been broadcast
      const p1Msgs = sockets.get('p1')!.sent.filter((m: any) => m.type === 'frame_inputs');
      expect(p1Msgs).toHaveLength(2);
      expect(p1Msgs[0].frame).toBe(0);
      expect(p1Msgs[1].frame).toBe(1);
    });

    it('broadcasts to spectators as well', () => {
      const { room, sockets } = setupPlayingRoom(['p1']);
      const spectatorWs = mockWs();
      (room as any).spectators.add(spectatorWs);

      (room as any).pendingInputs.set(0, new Map([
        ['p1', makeInput({ start: true })],
      ]));

      room.collectAndBroadcastInputs(0);

      const specMsg = spectatorWs.sent.find((m: any) => m.type === 'frame_inputs');
      expect(specMsg).toBeDefined();
      expect(specMsg.frame).toBe(0);
      expect(specMsg.inputs.p1.start).toBe(true);
    });

    it('ignores calls for non-current frames', () => {
      const { room, sockets } = setupPlayingRoom(['p1']);

      (room as any).currentFrame = 5;
      (room as any).pendingInputs.set(3, new Map([['p1', makeInput()]]));

      room.collectAndBroadcastInputs(3);

      // Nothing should be sent
      expect(sockets.get('p1')!.sent).toHaveLength(0);
    });
  });

  describe('handleInput via webSocketMessage', () => {
    it('stores input and triggers collection', async () => {
      const { room, sockets } = setupPlayingRoom(['p1', 'p2']);
      const p1Ws = sockets.get('p1')!;
      const p2Ws = sockets.get('p2')!;

      // p1 sends input
      await room.webSocketMessage(p1Ws as any, JSON.stringify({
        type: 'input',
        frame: 0,
        input: makeInput({ a: true }),
      }));

      // Not yet broadcast (p2 missing)
      expect(p1Ws.sent.find((m: any) => m.type === 'frame_inputs')).toBeUndefined();

      // p2 sends input
      await room.webSocketMessage(p2Ws as any, JSON.stringify({
        type: 'input',
        frame: 0,
        input: makeInput({ b: true }),
      }));

      // Now should be broadcast
      const frameMsg = p1Ws.sent.find((m: any) => m.type === 'frame_inputs');
      expect(frameMsg).toBeDefined();
      expect(frameMsg.frame).toBe(0);
      expect(frameMsg.inputs.p1.a).toBe(true);
      expect(frameMsg.inputs.p2.b).toBe(true);
    });

    it('ignores stale inputs (frame < currentFrame)', async () => {
      const { room, sockets } = setupPlayingRoom(['p1']);
      (room as any).currentFrame = 5;

      const p1Ws = sockets.get('p1')!;
      await room.webSocketMessage(p1Ws as any, JSON.stringify({
        type: 'input',
        frame: 3,
        input: makeInput(),
      }));

      // Should not have stored the input
      expect((room as any).pendingInputs.has(3)).toBe(false);
    });
  });

  describe('disconnection during play', () => {
    it('uses neutral inputs for disconnected player after timeout expires', () => {
      const { room, sockets } = setupPlayingRoom(['p1', 'p2']);

      // Mark p2 as disconnected with expired timer
      (room as any).disconnectedPlayers.add('p2');
      // No timer in disconnectTimers means the window has expired

      // p1 submits input
      (room as any).pendingInputs.set(0, new Map([
        ['p1', makeInput({ a: true })],
      ]));

      room.collectAndBroadcastInputs(0);

      // Should broadcast with p2 having neutral input
      const frameMsg = sockets.get('p1')!.sent.find((m: any) => m.type === 'frame_inputs');
      expect(frameMsg).toBeDefined();
      expect(frameMsg.inputs.p2).toEqual(neutralInput());
      expect(frameMsg.inputs.p1.a).toBe(true);
    });

    it('waits for disconnected player during reconnection window', () => {
      const { room, sockets } = setupPlayingRoom(['p1', 'p2']);

      // Mark p2 as disconnected WITH active timer (still in reconnection window)
      (room as any).disconnectedPlayers.add('p2');
      (room as any).disconnectTimers.set('p2', setTimeout(() => {}, 5000));

      // p1 submits input
      (room as any).pendingInputs.set(0, new Map([
        ['p1', makeInput({ a: true })],
      ]));

      room.collectAndBroadcastInputs(0);

      // Should NOT broadcast yet (waiting for p2)
      expect(sockets.get('p1')!.sent.find((m: any) => m.type === 'frame_inputs')).toBeUndefined();
    });
  });

  describe('frame timeout', () => {
    it('fills missing inputs after INPUT_COLLECT_TIMEOUT_MS and broadcasts', () => {
      const { room, sockets } = setupPlayingRoom(['p1', 'p2']);

      // p1 submits, p2 does not
      (room as any).pendingInputs.set(0, new Map([
        ['p1', makeInput({ a: true })],
      ]));

      // Schedule the timeout
      (room as any).scheduleFrameTimeout(0);

      // Advance time past the 50ms timeout
      vi.advanceTimersByTime(51);

      // Should have broadcast with p2 getting neutral input
      const frameMsg = sockets.get('p1')!.sent.find((m: any) => m.type === 'frame_inputs');
      expect(frameMsg).toBeDefined();
      expect(frameMsg.inputs.p1.a).toBe(true);
      expect(frameMsg.inputs.p2).toEqual(neutralInput());
    });

    it('uses last known input as fallback during timeout', () => {
      const { room, sockets } = setupPlayingRoom(['p1', 'p2']);

      // Set last known input for p2
      (room as any).lastKnownInputs.set('p2', makeInput({ up: true, right: true }));

      // p1 submits, p2 does not
      (room as any).pendingInputs.set(0, new Map([
        ['p1', makeInput()],
      ]));

      (room as any).scheduleFrameTimeout(0);
      vi.advanceTimersByTime(51);

      const frameMsg = sockets.get('p1')!.sent.find((m: any) => m.type === 'frame_inputs');
      expect(frameMsg).toBeDefined();
      expect(frameMsg.inputs.p2.up).toBe(true);
      expect(frameMsg.inputs.p2.right).toBe(true);
    });
  });

  describe('latency monitoring', () => {
    it('sends latency_warning when RTT exceeds 100ms', async () => {
      const { room, sockets } = setupPlayingRoom(['p1', 'p2']);
      const p1Ws = sockets.get('p1')!;

      // Simulate a ping from 150ms ago
      const now = Date.now();
      vi.setSystemTime(now);

      await room.webSocketMessage(p1Ws as any, JSON.stringify({
        type: 'ping',
        timestamp: now - 150,
      }));

      // p1 should get a pong
      const pong = p1Ws.sent.find((m: any) => m.type === 'pong');
      expect(pong).toBeDefined();

      // Both players should get a latency_warning
      const p2Warning = sockets.get('p2')!.sent.find((m: any) => m.type === 'latency_warning');
      expect(p2Warning).toBeDefined();
      expect(p2Warning.playerId).toBe('p1');
      expect(p2Warning.latencyMs).toBeGreaterThan(100);
    });

    it('does not send latency_warning when RTT is under 100ms', async () => {
      const { room, sockets } = setupPlayingRoom(['p1', 'p2']);
      const p1Ws = sockets.get('p1')!;

      const now = Date.now();
      vi.setSystemTime(now);

      await room.webSocketMessage(p1Ws as any, JSON.stringify({
        type: 'ping',
        timestamp: now - 50,
      }));

      const p2Warning = sockets.get('p2')!.sent.find((m: any) => m.type === 'latency_warning');
      expect(p2Warning).toBeUndefined();
    });

    it('updates player latencyMs on ping', async () => {
      const { room, sockets } = setupPlayingRoom(['p1']);
      const p1Ws = sockets.get('p1')!;

      const now = Date.now();
      vi.setSystemTime(now);

      await room.webSocketMessage(p1Ws as any, JSON.stringify({
        type: 'ping',
        timestamp: now - 75,
      }));

      const player = (room as any).players.get('p1');
      expect(player.info.latencyMs).toBe(75);
    });
  });

  describe('input delay compensation', () => {
    it('clamps inputDelay to 0-3 range in configure', async () => {
      const room = new GameRoom(mockState(), mockEnv());

      // Test clamping to max
      const req1 = new Request('http://localhost/configure', {
        method: 'POST',
        body: JSON.stringify({ romHash: 'test', inputDelay: 10 }),
      });
      await room.fetch(req1);
      expect((room as any).roomConfig.inputDelay).toBe(3);

      // Test clamping to min
      const req2 = new Request('http://localhost/configure', {
        method: 'POST',
        body: JSON.stringify({ inputDelay: -5 }),
      });
      await room.fetch(req2);
      expect((room as any).roomConfig.inputDelay).toBe(0);

      // Test valid value
      const req3 = new Request('http://localhost/configure', {
        method: 'POST',
        body: JSON.stringify({ inputDelay: 2 }),
      });
      await room.fetch(req3);
      expect((room as any).roomConfig.inputDelay).toBe(2);
    });

    it('accepts future frame inputs (client sends frame N + inputDelay)', async () => {
      const { room, sockets } = setupPlayingRoom(['p1']);
      const p1Ws = sockets.get('p1')!;

      // Client sends input for frame 2 (currentFrame=0, inputDelay=2)
      await room.webSocketMessage(p1Ws as any, JSON.stringify({
        type: 'input',
        frame: 2,
        input: makeInput({ a: true }),
      }));

      // Input should be stored for frame 2
      expect((room as any).pendingInputs.has(2)).toBe(true);
      expect((room as any).pendingInputs.get(2).get('p1').a).toBe(true);
    });
  });
});
