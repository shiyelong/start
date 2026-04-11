// =============================================================================
// Room Client — WebSocket connection management for multiplayer rooms
// =============================================================================
//
// Connects to a GameRoom Durable Object via WebSocket. Handles room creation,
// joining, input synchronization (lockstep), chat, host controls, latency
// tracking, and automatic reconnection with exponential backoff.

import type {
  InputFrame,
  RoomInfo,
  PlayerInfo,
  ChatMessage,
  RoomOptions,
  ClientMessage,
  ServerMessage,
  PlayerInputs,
  RoomState,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Initial reconnection delay in ms */
const RECONNECT_BASE_MS = 100;
/** Maximum number of reconnection attempts */
const RECONNECT_MAX_ATTEMPTS = 5;
/** Interval between ping messages in ms */
const PING_INTERVAL_MS = 2_000;

// ---------------------------------------------------------------------------
// Callback types
// ---------------------------------------------------------------------------

type CombinedInputCallback = (frame: number, inputs: PlayerInputs) => void;
type PlayerJoinedCallback = (player: PlayerInfo) => void;
type PlayerLeftCallback = (playerId: string) => void;
type GameStartCallback = () => void;
type ChatCallback = (msg: ChatMessage) => void;
type FrameUpdateCallback = (frameData: Uint8Array) => void;
type ErrorCallback = (code: string, message: string) => void;
type RoomStateCallback = (state: RoomState) => void;
type DisconnectCallback = () => void;
type ReconnectCallback = () => void;

// ---------------------------------------------------------------------------
// RoomClient
// ---------------------------------------------------------------------------

export class RoomClient {
  // ---- Connection state ----
  private ws: WebSocket | null = null;
  private playerId: string = '';
  private displayName: string = '';
  private roomCode: string = '';
  private isSpectator: boolean = false;
  private connected: boolean = false;

  // ---- Reconnection ----
  private reconnectAttempts: number = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect: boolean = false;
  private lastWsUrl: string = '';
  private lastJoinMode: 'player' | 'spectator' = 'player';
  private lastRomHash: string = '';

  // ---- Latency tracking ----
  private latencyMs: number = 0;
  private peerLatencies: Map<string, number> = new Map();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastPingTimestamp: number = 0;

  // ---- Callbacks ----
  private combinedInputCb: CombinedInputCallback | null = null;
  private playerJoinedCb: PlayerJoinedCallback | null = null;
  private playerLeftCb: PlayerLeftCallback | null = null;
  private gameStartCb: GameStartCallback | null = null;
  private chatCb: ChatCallback | null = null;
  private frameUpdateCb: FrameUpdateCallback | null = null;
  private errorCb: ErrorCallback | null = null;
  private roomStateCb: RoomStateCallback | null = null;
  private disconnectCb: DisconnectCallback | null = null;
  private reconnectCb: ReconnectCallback | null = null;

  // ---- Constructor ----

  constructor(playerId: string, displayName: string) {
    this.playerId = playerId;
    this.displayName = displayName;
  }

  // =========================================================================
  // Connection
  // =========================================================================

  /**
   * Create a new room by POSTing to the API, then connect via WebSocket.
   */
  async createRoom(
    romHash: string,
    romTitle: string,
    platform: string,
    maxPlayers: number,
    options: RoomOptions,
  ): Promise<RoomInfo> {
    const res = await fetch('/api/classic/room/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        romHash,
        romTitle,
        platform,
        maxPlayers,
        hostId: this.playerId,
        ...options,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: 'Failed to create room' } }));
      throw new Error((err as { error: { message: string } }).error.message);
    }

    const data = (await res.json()) as { roomCode: string; wsUrl?: string };
    this.roomCode = data.roomCode;

    const wsUrl = data.wsUrl ?? this.buildWsUrl(data.roomCode);
    await this.connectWebSocket(wsUrl, romHash, 'player');

    return this.buildRoomInfoFromState(data.roomCode, romHash, romTitle, platform, maxPlayers, options);
  }

  /**
   * Join an existing room by code.
   */
  async joinRoom(roomCode: string, romHash: string): Promise<RoomInfo> {
    this.roomCode = roomCode;
    const wsUrl = this.buildWsUrl(roomCode);
    await this.connectWebSocket(wsUrl, romHash, 'player');

    // Fetch room info via HTTP
    const res = await fetch(`/api/classic/room/${roomCode}`);
    if (!res.ok) {
      throw new Error('Failed to fetch room info');
    }
    return (await res.json()) as RoomInfo;
  }

  /**
   * Join a room as a spectator.
   */
  async joinAsSpectator(roomCode: string, romHash: string): Promise<void> {
    this.roomCode = roomCode;
    this.isSpectator = true;
    const wsUrl = this.buildWsUrl(roomCode);
    await this.connectWebSocket(wsUrl, romHash, 'spectator');
  }

  /**
   * Disconnect from the current room.
   */
  disconnect(): void {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    this.stopPing();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.connected = false;
    this.reconnectAttempts = 0;
  }

  // =========================================================================
  // Input sync (lockstep)
  // =========================================================================

  /**
   * Send local input for a given frame to the server.
   */
  sendInput(frame: number, input: InputFrame): void {
    this.send({ type: 'input', frame, input });
  }

  /**
   * Register callback for combined input frames from the server.
   */
  onCombinedInput(callback: CombinedInputCallback): void {
    this.combinedInputCb = callback;
  }

  // =========================================================================
  // Room event callbacks
  // =========================================================================

  onPlayerJoined(callback: PlayerJoinedCallback): void {
    this.playerJoinedCb = callback;
  }

  onPlayerLeft(callback: PlayerLeftCallback): void {
    this.playerLeftCb = callback;
  }

  onGameStart(callback: GameStartCallback): void {
    this.gameStartCb = callback;
  }

  onChat(callback: ChatCallback): void {
    this.chatCb = callback;
  }

  sendChat(message: string): void {
    this.send({ type: 'chat', message });
  }

  onFrameUpdate(callback: FrameUpdateCallback): void {
    this.frameUpdateCb = callback;
  }

  onError(callback: ErrorCallback): void {
    this.errorCb = callback;
  }

  onRoomState(callback: RoomStateCallback): void {
    this.roomStateCb = callback;
  }

  onDisconnect(callback: DisconnectCallback): void {
    this.disconnectCb = callback;
  }

  onReconnect(callback: ReconnectCallback): void {
    this.reconnectCb = callback;
  }

  // =========================================================================
  // Host controls
  // =========================================================================

  /**
   * Start the game (host only). Transitions room from lobby → playing.
   */
  startGame(): void {
    this.send({ type: 'start_game' });
  }

  /**
   * Kick a player from the room (host only).
   */
  kickPlayer(playerId: string): void {
    this.send({ type: 'kick', targetId: playerId });
  }

  // =========================================================================
  // Latency
  // =========================================================================

  /** Get local client latency (RTT) in ms. */
  getLatency(): number {
    return this.latencyMs;
  }

  /** Get latencies for all peers. */
  getPeerLatencies(): Map<string, number> {
    return new Map(this.peerLatencies);
  }

  // =========================================================================
  // Accessors
  // =========================================================================

  isConnected(): boolean {
    return this.connected;
  }

  getRoomCode(): string {
    return this.roomCode;
  }

  getPlayerId(): string {
    return this.playerId;
  }

  // =========================================================================
  // Private — WebSocket lifecycle
  // =========================================================================

  private buildWsUrl(roomCode: string): string {
    const proto = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = typeof window !== 'undefined' ? window.location.host : 'localhost';
    return `${proto}://${host}/api/classic/room/${roomCode}/websocket`;
  }

  private connectWebSocket(url: string, romHash: string, mode: 'player' | 'spectator'): Promise<void> {
    this.lastWsUrl = url;
    this.lastJoinMode = mode;
    this.lastRomHash = romHash;
    this.shouldReconnect = true;

    return new Promise<void>((resolve, reject) => {
      try {
        const ws = new WebSocket(url);
        this.ws = ws;

        ws.onopen = () => {
          this.connected = true;
          this.reconnectAttempts = 0;

          // Send join message
          const joinMsg: ClientMessage = {
            type: 'join',
            playerId: this.playerId,
            romHash,
            mode,
          };
          ws.send(JSON.stringify(joinMsg));

          this.startPing();
          resolve();
        };

        ws.onmessage = (event: MessageEvent) => {
          this.handleMessage(event.data as string);
        };

        ws.onclose = () => {
          this.connected = false;
          this.stopPing();
          this.disconnectCb?.();
          this.attemptReconnect();
        };

        ws.onerror = () => {
          // onclose will fire after onerror, so reconnection is handled there.
          // Only reject the initial connection promise if we haven't connected yet.
          if (!this.connected) {
            reject(new Error('WebSocket connection failed'));
          }
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  // =========================================================================
  // Private — Message handling
  // =========================================================================

  private handleMessage(raw: string): void {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(raw) as ServerMessage;
    } catch {
      return;
    }

    switch (msg.type) {
      case 'frame_inputs':
        this.combinedInputCb?.(msg.frame, msg.inputs);
        break;

      case 'player_joined':
        this.playerJoinedCb?.(msg.player);
        break;

      case 'player_left':
        this.peerLatencies.delete(msg.playerId);
        this.playerLeftCb?.(msg.playerId);
        break;

      case 'game_started':
        this.gameStartCb?.();
        break;

      case 'chat':
        this.chatCb?.({
          senderId: msg.senderId,
          senderName: msg.senderName,
          slot: msg.slot,
          message: msg.message,
          timestamp: msg.timestamp,
        });
        break;

      case 'pong':
        this.latencyMs = Date.now() - msg.timestamp;
        break;

      case 'latency_warning':
        this.peerLatencies.set(msg.playerId, msg.latencyMs);
        break;

      case 'room_state':
        this.roomStateCb?.(msg.state as unknown as RoomState);
        break;

      case 'error':
        this.errorCb?.(msg.code, msg.message);
        break;

      case 'player_disconnected':
      case 'player_reconnected':
      case 'spectator_count':
        // These are informational; consumers can extend handling via onRoomState
        break;

      default:
        break;
    }
  }

  // =========================================================================
  // Private — Ping / latency tracking
  // =========================================================================

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      this.lastPingTimestamp = Date.now();
      this.send({ type: 'ping', timestamp: this.lastPingTimestamp });
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  // =========================================================================
  // Private — Reconnection with exponential backoff
  // =========================================================================

  private attemptReconnect(): void {
    if (!this.shouldReconnect) return;
    if (this.reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
      this.shouldReconnect = false;
      return;
    }

    const delay = RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.connectWebSocket(this.lastWsUrl, this.lastRomHash, this.lastJoinMode)
        .then(() => {
          this.reconnectCb?.();
        })
        .catch(() => {
          // connectWebSocket's onclose handler will trigger another attempt
        });
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // =========================================================================
  // Private — Send helper
  // =========================================================================

  private send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  // =========================================================================
  // Private — Helpers
  // =========================================================================

  private buildRoomInfoFromState(
    roomCode: string,
    romHash: string,
    romTitle: string,
    platform: string,
    maxPlayers: number,
    options: RoomOptions,
  ): RoomInfo {
    return {
      roomCode,
      romHash,
      platform: platform as RoomInfo['platform'],
      romTitle,
      hostId: this.playerId,
      state: 'lobby',
      mode: options.mode,
      players: [
        {
          playerId: this.playerId,
          displayName: this.displayName,
          slot: 1,
          latencyMs: 0,
          isHost: true,
        },
      ],
      spectatorCount: 0,
      maxPlayers,
      isPublic: options.isPublic,
      tags: options.tags ?? [],
      description: options.description ?? '',
      createdAt: new Date().toISOString(),
    };
  }
}
