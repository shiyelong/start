import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RoomClient } from './room-client';

// ---------------------------------------------------------------------------
// Minimal WebSocket mock
// ---------------------------------------------------------------------------

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];

  constructor(public url: string) {
    // Simulate async open
    setTimeout(() => this.onopen?.(), 0);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close(_code?: number, _reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
  }

  // Test helpers
  simulateMessage(msg: object) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }

  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }
}

// Capture instances
let wsInstances: MockWebSocket[] = [];

beforeEach(() => {
  wsInstances = [];
  vi.useFakeTimers();
  // @ts-expect-error — mock global WebSocket
  globalThis.WebSocket = class extends MockWebSocket {
    constructor(url: string) {
      super(url);
      wsInstances.push(this);
    }
  };
  // @ts-expect-error — mock OPEN constant
  globalThis.WebSocket.OPEN = MockWebSocket.OPEN;

  // Mock fetch
  globalThis.fetch = vi.fn();

  // Mock window.location for URL building
  Object.defineProperty(globalThis, 'window', {
    value: { location: { protocol: 'https:', host: 'example.com' } },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function latestWs(): MockWebSocket {
  return wsInstances[wsInstances.length - 1];
}

async function createConnectedClient(): Promise<RoomClient> {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ roomCode: 'ABC123' }),
  });

  const client = new RoomClient('player-1', 'Alice');
  const promise = client.createRoom('hash1', 'Super Mario', 'NES', 2, {
    isPublic: true,
    mode: 'multiplayer',
  });

  // Let the WebSocket open
  await vi.advanceTimersByTimeAsync(1);
  await promise;
  return client;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RoomClient', () => {
  describe('createRoom', () => {
    it('should POST to create endpoint and connect WebSocket', async () => {
      const client = await createConnectedClient();

      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/classic/room/create',
        expect.objectContaining({ method: 'POST' }),
      );

      expect(client.isConnected()).toBe(true);
      expect(client.getRoomCode()).toBe('ABC123');

      // Should have sent a join message
      const ws = latestWs();
      const joinMsg = JSON.parse(ws.sent[0]);
      expect(joinMsg.type).toBe('join');
      expect(joinMsg.playerId).toBe('player-1');
      expect(joinMsg.mode).toBe('player');
    });

    it('should throw on API failure', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: 'Room limit reached' } }),
      });

      const client = new RoomClient('p1', 'Bob');
      await expect(
        client.createRoom('h', 'T', 'NES', 2, { isPublic: false, mode: 'multiplayer' }),
      ).rejects.toThrow('Room limit reached');
    });
  });

  describe('joinRoom', () => {
    it('should connect WebSocket and fetch room info', async () => {
      const roomInfo = { roomCode: 'XYZ789', players: [] };
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => roomInfo,
      });

      const client = new RoomClient('p2', 'Carol');
      const promise = client.joinRoom('XYZ789', 'romhash');
      await vi.advanceTimersByTimeAsync(1);
      const info = await promise;

      expect(info.roomCode).toBe('XYZ789');
      expect(client.isConnected()).toBe(true);
    });
  });

  describe('joinAsSpectator', () => {
    it('should connect as spectator mode', async () => {
      const client = new RoomClient('s1', 'Spectator');
      const promise = client.joinAsSpectator('ROOM01', 'romhash');
      await vi.advanceTimersByTimeAsync(1);
      await promise;

      const ws = latestWs();
      const joinMsg = JSON.parse(ws.sent[0]);
      expect(joinMsg.mode).toBe('spectator');
    });
  });

  describe('sendInput', () => {
    it('should send input message over WebSocket', async () => {
      const client = await createConnectedClient();
      const input = {
        up: true, down: false, left: false, right: false,
        a: true, b: false, x: false, y: false,
        l: false, r: false, start: false, select: false,
        turbo: {},
      };

      client.sendInput(42, input);

      const ws = latestWs();
      // sent[0] is join, sent[1] is the first ping, or the input
      const inputMsg = JSON.parse(ws.sent[ws.sent.length - 1]);
      expect(inputMsg.type).toBe('input');
      expect(inputMsg.frame).toBe(42);
      expect(inputMsg.input.up).toBe(true);
      expect(inputMsg.input.a).toBe(true);
    });
  });

  describe('onCombinedInput', () => {
    it('should invoke callback on frame_inputs message', async () => {
      const client = await createConnectedClient();
      const cb = vi.fn();
      client.onCombinedInput(cb);

      const ws = latestWs();
      ws.simulateMessage({
        type: 'frame_inputs',
        frame: 10,
        inputs: { 'player-1': { up: true } },
      });

      expect(cb).toHaveBeenCalledWith(10, { 'player-1': { up: true } });
    });
  });

  describe('room event callbacks', () => {
    it('should fire onPlayerJoined', async () => {
      const client = await createConnectedClient();
      const cb = vi.fn();
      client.onPlayerJoined(cb);

      latestWs().simulateMessage({
        type: 'player_joined',
        player: { playerId: 'p2', displayName: 'Bob', slot: 2, latencyMs: 0, isHost: false },
        slot: 2,
      });

      expect(cb).toHaveBeenCalledWith(
        expect.objectContaining({ playerId: 'p2', slot: 2 }),
      );
    });

    it('should fire onPlayerLeft', async () => {
      const client = await createConnectedClient();
      const cb = vi.fn();
      client.onPlayerLeft(cb);

      latestWs().simulateMessage({ type: 'player_left', playerId: 'p2' });
      expect(cb).toHaveBeenCalledWith('p2');
    });

    it('should fire onGameStart', async () => {
      const client = await createConnectedClient();
      const cb = vi.fn();
      client.onGameStart(cb);

      latestWs().simulateMessage({ type: 'game_started' });
      expect(cb).toHaveBeenCalled();
    });

    it('should fire onChat', async () => {
      const client = await createConnectedClient();
      const cb = vi.fn();
      client.onChat(cb);

      latestWs().simulateMessage({
        type: 'chat',
        senderId: 'p2',
        senderName: 'Bob',
        slot: 'P2',
        message: 'Hello!',
        timestamp: 1234567890,
      });

      expect(cb).toHaveBeenCalledWith(
        expect.objectContaining({ senderId: 'p2', message: 'Hello!' }),
      );
    });
  });

  describe('host controls', () => {
    it('startGame sends start_game message', async () => {
      const client = await createConnectedClient();
      client.startGame();

      const ws = latestWs();
      const msg = JSON.parse(ws.sent[ws.sent.length - 1]);
      expect(msg.type).toBe('start_game');
    });

    it('kickPlayer sends kick message', async () => {
      const client = await createConnectedClient();
      client.kickPlayer('p2');

      const ws = latestWs();
      const msg = JSON.parse(ws.sent[ws.sent.length - 1]);
      expect(msg.type).toBe('kick');
      expect(msg.targetId).toBe('p2');
    });
  });

  describe('sendChat', () => {
    it('sends chat message', async () => {
      const client = await createConnectedClient();
      client.sendChat('GG!');

      const ws = latestWs();
      const msg = JSON.parse(ws.sent[ws.sent.length - 1]);
      expect(msg.type).toBe('chat');
      expect(msg.message).toBe('GG!');
    });
  });

  describe('latency tracking', () => {
    it('should update latency on pong', async () => {
      const client = await createConnectedClient();
      expect(client.getLatency()).toBe(0);

      // Simulate a pong with the timestamp we "sent"
      const now = Date.now();
      latestWs().simulateMessage({ type: 'pong', timestamp: now - 50, serverTime: now });

      // Latency = Date.now() - msg.timestamp
      expect(client.getLatency()).toBeGreaterThanOrEqual(0);
    });

    it('should track peer latencies from latency_warning', async () => {
      const client = await createConnectedClient();

      latestWs().simulateMessage({ type: 'latency_warning', playerId: 'p2', latencyMs: 150 });

      const peers = client.getPeerLatencies();
      expect(peers.get('p2')).toBe(150);
    });

    it('should remove peer latency on player_left', async () => {
      const client = await createConnectedClient();

      latestWs().simulateMessage({ type: 'latency_warning', playerId: 'p2', latencyMs: 150 });
      latestWs().simulateMessage({ type: 'player_left', playerId: 'p2' });

      expect(client.getPeerLatencies().has('p2')).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('should close WebSocket and reset state', async () => {
      const client = await createConnectedClient();
      expect(client.isConnected()).toBe(true);

      client.disconnect();
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('reconnection with exponential backoff', () => {
    it('should attempt reconnection on unexpected close', async () => {
      const client = await createConnectedClient();
      const reconnectCb = vi.fn();
      client.onReconnect(reconnectCb);

      // Simulate unexpected close
      const ws1 = latestWs();
      ws1.simulateClose();

      expect(client.isConnected()).toBe(false);

      // First reconnect after 100ms
      await vi.advanceTimersByTimeAsync(100);
      expect(wsInstances.length).toBe(2);

      // Let the new WS open
      await vi.advanceTimersByTimeAsync(1);
      expect(client.isConnected()).toBe(true);
      expect(reconnectCb).toHaveBeenCalled();
    });

    it('should use exponential backoff delays (100, 200, 400, ...)', async () => {
      const client = await createConnectedClient();

      // Replace WS mock with one that does NOT auto-open
      // This prevents reconnectAttempts from resetting on success
      let noAutoOpen = true;
      // @ts-expect-error — mock global WebSocket
      globalThis.WebSocket = class {
        static OPEN = 1;
        static CLOSED = 3;
        readyState = 1;
        onopen: (() => void) | null = null;
        onmessage: ((e: { data: string }) => void) | null = null;
        onclose: (() => void) | null = null;
        onerror: (() => void) | null = null;
        sent: string[] = [];
        url: string;
        constructor(url: string) {
          this.url = url;
          wsInstances.push(this as unknown as MockWebSocket);
          if (!noAutoOpen) {
            setTimeout(() => this.onopen?.(), 0);
          }
        }
        send(data: string) { this.sent.push(data); }
        close() { this.readyState = 3; }
      };
      // @ts-expect-error
      globalThis.WebSocket.OPEN = 1;

      // Close the initial WS — triggers attempt 0 (delay 100ms)
      latestWs().simulateClose();
      const c1 = wsInstances.length;

      await vi.advanceTimersByTimeAsync(99);
      expect(wsInstances.length).toBe(c1);
      await vi.advanceTimersByTimeAsync(2);
      expect(wsInstances.length).toBe(c1 + 1);

      // The new WS never opens. Simulate error → close to trigger attempt 1 (delay 200ms)
      const ws2 = latestWs();
      ws2.onerror?.();
      ws2.readyState = 3 as number;
      ws2.onclose?.();
      const c2 = wsInstances.length;

      await vi.advanceTimersByTimeAsync(199);
      expect(wsInstances.length).toBe(c2);
      await vi.advanceTimersByTimeAsync(2);
      expect(wsInstances.length).toBe(c2 + 1);

      // Attempt 2 (delay 400ms)
      const ws3 = latestWs();
      ws3.onerror?.();
      ws3.readyState = 3 as number;
      ws3.onclose?.();
      const c3 = wsInstances.length;

      await vi.advanceTimersByTimeAsync(399);
      expect(wsInstances.length).toBe(c3);
      await vi.advanceTimersByTimeAsync(2);
      expect(wsInstances.length).toBe(c3 + 1);
    });

    it('should stop reconnecting after max attempts', async () => {
      const client = await createConnectedClient();

      // Replace WS mock with one that does NOT auto-open
      // @ts-expect-error — mock global WebSocket
      globalThis.WebSocket = class {
        static OPEN = 1;
        static CLOSED = 3;
        readyState = 1;
        onopen: (() => void) | null = null;
        onmessage: ((e: { data: string }) => void) | null = null;
        onclose: (() => void) | null = null;
        onerror: (() => void) | null = null;
        sent: string[] = [];
        url: string;
        constructor(url: string) {
          this.url = url;
          wsInstances.push(this as unknown as MockWebSocket);
        }
        send(data: string) { this.sent.push(data); }
        close() { this.readyState = 3; }
      };
      // @ts-expect-error
      globalThis.WebSocket.OPEN = 1;

      // Close the initial connected WS
      latestWs().simulateClose();

      // Exhaust all 5 reconnection attempts (each fails immediately)
      for (let i = 0; i < RECONNECT_MAX_ATTEMPTS; i++) {
        const delay = 100 * Math.pow(2, i);
        await vi.advanceTimersByTimeAsync(delay + 1);
        // New WS was created, simulate failure
        const ws = latestWs();
        ws.onerror?.();
        (ws as unknown as { readyState: number }).readyState = 3;
        ws.onclose?.();
      }

      const countBefore = wsInstances.length;
      // Wait a long time — no more reconnection attempts
      await vi.advanceTimersByTimeAsync(100_000);
      expect(wsInstances.length).toBe(countBefore);
    });

    it('should not reconnect after explicit disconnect', async () => {
      const client = await createConnectedClient();
      client.disconnect();

      const countBefore = wsInstances.length;
      await vi.advanceTimersByTimeAsync(10_000);
      expect(wsInstances.length).toBe(countBefore);
    });
  });

  describe('error handling', () => {
    it('should invoke error callback on error message', async () => {
      const client = await createConnectedClient();
      const cb = vi.fn();
      client.onError(cb);

      latestWs().simulateMessage({ type: 'error', code: 'ROOM_FULL', message: 'Room is full' });
      expect(cb).toHaveBeenCalledWith('ROOM_FULL', 'Room is full');
    });
  });
});

const RECONNECT_MAX_ATTEMPTS = 5;
