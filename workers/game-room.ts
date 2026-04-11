/// <reference types="@cloudflare/workers-types" />

import type { WorkerEnv } from './env';

// ---- Types (inline for Workers isolation from Next.js tsconfig) ----

interface InputFrame {
  up: boolean; down: boolean; left: boolean; right: boolean;
  a: boolean; b: boolean; x: boolean; y: boolean;
  l: boolean; r: boolean;
  start: boolean; select: boolean;
  turbo: Record<string, boolean>;
}

interface PlayerInfo {
  playerId: string;
  displayName: string;
  slot: number;
  latencyMs: number;
  isHost: boolean;
}

interface RoomConfig {
  romHash: string;
  romTitle: string;
  maxPlayers: number;
  mode: 'multiplayer' | 'race' | 'spectator';
  isPublic: boolean;
  tags: string[];
  description: string;
  inputDelay: number;
}

type RoomPhase = 'lobby' | 'playing' | 'finished';

type ClientMessage =
  | { type: 'join'; playerId: string; displayName?: string; romHash: string; mode: 'player' | 'spectator' }
  | { type: 'input'; frame: number; input: InputFrame }
  | { type: 'chat'; message: string }
  | { type: 'start_game' }
  | { type: 'kick'; targetId: string }
  | { type: 'ping'; timestamp: number };

type ServerMessage =
  | { type: 'room_state'; state: RoomStateSnapshot }
  | { type: 'player_joined'; player: PlayerInfo; slot: number }
  | { type: 'player_left'; playerId: string }
  | { type: 'frame_inputs'; frame: number; inputs: Record<string, InputFrame> }
  | { type: 'game_started' }
  | { type: 'chat'; senderId: string; senderName: string; slot: string; message: string; timestamp: number }
  | { type: 'pong'; timestamp: number; serverTime: number }
  | { type: 'latency_warning'; playerId: string; latencyMs: number }
  | { type: 'player_disconnected'; playerId: string; reconnectDeadline: number }
  | { type: 'player_reconnected'; playerId: string }
  | { type: 'spectator_count'; count: number }
  | { type: 'error'; code: string; message: string };

interface RoomStateSnapshot {
  roomCode: string;
  phase: RoomPhase;
  hostId: string;
  players: PlayerInfo[];
  spectatorCount: number;
  romHash: string;
  romTitle: string;
  maxPlayers: number;
  mode: string;
  isPublic: boolean;
  tags: string[];
  description: string;
}

// ---- Constants ----

const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const MAX_PLAYERS = 4;
const INACTIVITY_TIMEOUT_MS = 60_000; // 60 seconds
const DISCONNECT_REMOVAL_MS = 3_000;  // 3 seconds in lobby
const MAX_CHAT_LENGTH = 200;
const PLAY_DISCONNECT_TIMEOUT_MS = 5_000; // 5 seconds reconnection window during play
const INPUT_COLLECT_TIMEOUT_MS = 50;      // 50ms timeout for missing inputs per frame
const LATENCY_WARNING_THRESHOLD_MS = 100; // RTT > 100ms triggers warning
const MAX_INPUT_DELAY = 3;                // Maximum configurable input delay frames

// ---- Room code generation ----

export function generateRoomCode(): string {
  const values = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(values);
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_CHARS[values[i] % ROOM_CODE_CHARS.length];
  }
  return code;
}

// ---- Neutral input (no buttons pressed) ----

function neutralInput(): InputFrame {
  return {
    up: false, down: false, left: false, right: false,
    a: false, b: false, x: false, y: false,
    l: false, r: false,
    start: false, select: false,
    turbo: {},
  };
}

// ---- Helper: find next available controller slot (P1-P4) ----

function nextAvailableSlot(usedSlots: Set<number>): number | null {
  for (let s = 1; s <= MAX_PLAYERS; s++) {
    if (!usedSlots.has(s)) return s;
  }
  return null;
}

// ---- GameRoom Durable Object ----

export class GameRoom implements DurableObject {
  private state: DurableObjectState;
  private env: WorkerEnv;

  // Player tracking: playerId → { ws, info }
  private players: Map<string, { ws: WebSocket; info: PlayerInfo }> = new Map();
  // Spectator tracking
  private spectators: Set<WebSocket> = new Set();
  // Spectator id mapping for ordering (earliest-joined first)
  private spectatorIds: Map<WebSocket, string> = new Map();

  // Room state
  private roomPhase: RoomPhase = 'lobby';
  private roomCode: string = '';
  private hostId: string = '';
  private roomConfig: RoomConfig = {
    romHash: '',
    romTitle: '',
    maxPlayers: 4,
    mode: 'multiplayer',
    isPublic: false,
    tags: [],
    description: '',
    inputDelay: 2,
  };

  // Disconnect timers (lobby removal after 3s)
  private disconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  // Track last activity for inactivity alarm
  private lastActivity: number = Date.now();

  // ---- Lockstep input synchronization state ----
  // Frame counter for the current emulation frame being collected
  private currentFrame: number = 0;
  // Pending inputs: frame number → (playerId → InputFrame)
  private pendingInputs: Map<number, Map<string, InputFrame>> = new Map();
  // Last known input per player (used as fallback for missing inputs)
  private lastKnownInputs: Map<string, InputFrame> = new Map();
  // Per-frame collection timeout handles
  private frameTimeouts: Map<number, ReturnType<typeof setTimeout>> = new Map();
  // Latency tracking per player: playerId → latest RTT in ms
  private playerLatency: Map<string, number> = new Map();
  // Set of players currently disconnected (within reconnection window)
  private disconnectedPlayers: Set<string> = new Set();

  constructor(state: DurableObjectState, env: WorkerEnv) {
    this.state = state;
    this.env = env;
  }

  // ---- Main fetch handler ----

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/websocket') {
      return this.handleWebSocketUpgrade(request);
    }

    if (url.pathname === '/info') {
      return this.handleInfoRequest();
    }

    if (url.pathname === '/configure' && request.method === 'POST') {
      return this.handleConfigure(request);
    }

    return new Response('Not found', { status: 404 });
  }

  // ---- Configure room (called once when room is created) ----

  private async handleConfigure(request: Request): Promise<Response> {
    try {
      const body = (await request.json()) as Partial<RoomConfig> & { hostId?: string };
      if (body.romHash) this.roomConfig.romHash = body.romHash;
      if (body.romTitle) this.roomConfig.romTitle = body.romTitle;
      if (body.maxPlayers) this.roomConfig.maxPlayers = Math.min(body.maxPlayers, MAX_PLAYERS);
      if (body.mode) this.roomConfig.mode = body.mode;
      if (body.isPublic !== undefined) this.roomConfig.isPublic = body.isPublic;
      if (body.tags) this.roomConfig.tags = body.tags;
      if (body.description) this.roomConfig.description = body.description;
      if (body.inputDelay !== undefined) this.roomConfig.inputDelay = Math.max(0, Math.min(body.inputDelay, MAX_INPUT_DELAY));
      if (body.hostId) this.hostId = body.hostId;

      // Generate room code if not yet set
      if (!this.roomCode) {
        this.roomCode = generateRoomCode();
      }

      this.touchActivity();

      return Response.json({ roomCode: this.roomCode, config: this.roomConfig });
    } catch {
      return new Response('Invalid request body', { status: 400 });
    }
  }

  // ---- Room info (HTTP GET) ----

  private handleInfoRequest(): Response {
    return Response.json(this.buildRoomStateSnapshot());
  }

  // ---- WebSocket upgrade ----

  private handleWebSocketUpgrade(request: Request): Response {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    this.state.acceptWebSocket(server);

    this.touchActivity();

    return new Response(null, { status: 101, webSocket: client });
  }

  // ---- Hibernation-compatible WebSocket event handlers ----

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    this.touchActivity();

    let msg: ClientMessage;
    try {
      msg = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message));
    } catch {
      this.sendTo(ws, { type: 'error', code: 'INVALID_MESSAGE', message: 'Invalid JSON' });
      return;
    }

    switch (msg.type) {
      case 'join':
        this.handleJoin(ws, msg);
        break;
      case 'input':
        this.handleInput(ws, msg);
        break;
      case 'chat':
        this.handleChat(ws, msg);
        break;
      case 'start_game':
        this.handleStartGame(ws);
        break;
      case 'kick':
        this.handleKick(ws, msg);
        break;
      case 'ping':
        this.handlePing(ws, msg);
        break;
      default:
        this.sendTo(ws, { type: 'error', code: 'INVALID_MESSAGE', message: 'Unknown message type' });
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    this.handleDisconnect(ws);
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    this.handleDisconnect(ws);
  }

  // ---- Message handlers ----

  private handleJoin(ws: WebSocket, msg: Extract<ClientMessage, { type: 'join' }>): void {
    const { playerId, romHash, mode, displayName } = msg;

    // Validate ROM hash matches room config (if configured)
    if (this.roomConfig.romHash && romHash !== this.roomConfig.romHash) {
      this.sendTo(ws, { type: 'error', code: 'ROM_MISMATCH', message: 'ROM hash does not match room' });
      return;
    }

    // Set room code if first join and not yet configured
    if (!this.roomCode) {
      this.roomCode = generateRoomCode();
      this.roomConfig.romHash = romHash;
    }

    // Handle reconnection: if player was disconnecting, cancel the timer
    if (this.disconnectTimers.has(playerId)) {
      clearTimeout(this.disconnectTimers.get(playerId)!);
      this.disconnectTimers.delete(playerId);

      const existing = this.players.get(playerId);
      if (existing) {
        // Reconnect: update WebSocket reference, clear disconnected status
        existing.ws = ws;
        this.disconnectedPlayers.delete(playerId);
        this.sendTo(ws, { type: 'room_state', state: this.buildRoomStateSnapshot() });
        this.broadcast({ type: 'player_reconnected', playerId });

        // If playing, try to advance frames now that this player can send inputs again
        if (this.roomPhase === 'playing') {
          this.collectAndBroadcastInputs(this.currentFrame);
        }
        return;
      }
    }

    if (mode === 'spectator') {
      this.spectators.add(ws);
      this.spectatorIds.set(ws, playerId);
      this.sendTo(ws, { type: 'room_state', state: this.buildRoomStateSnapshot() });
      this.broadcastSpectatorCount();
      return;
    }

    // Player mode
    if (this.players.has(playerId)) {
      this.sendTo(ws, { type: 'error', code: 'ALREADY_JOINED', message: 'Player already in room' });
      return;
    }

    if (this.players.size >= this.roomConfig.maxPlayers) {
      this.sendTo(ws, { type: 'error', code: 'ROOM_FULL', message: 'Room is full' });
      return;
    }

    if (this.roomPhase !== 'lobby') {
      this.sendTo(ws, { type: 'error', code: 'GAME_ALREADY_STARTED', message: 'Game already in progress' });
      return;
    }

    // Assign controller slot
    const usedSlots = new Set<number>();
    for (const [, p] of this.players) {
      usedSlots.add(p.info.slot);
    }
    const slot = nextAvailableSlot(usedSlots);
    if (slot === null) {
      this.sendTo(ws, { type: 'error', code: 'ROOM_FULL', message: 'No controller slots available' });
      return;
    }

    // First player becomes host
    const isHost = this.players.size === 0 && !this.hostId;
    if (isHost) {
      this.hostId = playerId;
    }

    const playerInfo: PlayerInfo = {
      playerId,
      displayName: displayName || playerId,
      slot,
      latencyMs: 0,
      isHost: playerId === this.hostId,
    };

    this.players.set(playerId, { ws, info: playerInfo });

    // Notify the joining player of room state
    this.sendTo(ws, { type: 'room_state', state: this.buildRoomStateSnapshot() });

    // Notify all others
    this.broadcast({ type: 'player_joined', player: playerInfo, slot }, playerId);
  }

  private handleInput(ws: WebSocket, msg: Extract<ClientMessage, { type: 'input' }>): void {
    // Only accept input from players (not spectators) during playing phase
    if (this.roomPhase !== 'playing') return;

    const playerId = this.getPlayerIdByWs(ws);
    if (!playerId) return; // Spectators can't send input

    const { frame, input } = msg;

    // Clamp input delay: client sends input for frame N + inputDelay
    // We accept any frame >= currentFrame
    if (frame < this.currentFrame) return; // Stale input, ignore

    // Store the input
    if (!this.pendingInputs.has(frame)) {
      this.pendingInputs.set(frame, new Map());
    }
    this.pendingInputs.get(frame)!.set(playerId, input);

    // Track last known input for fallback
    this.lastKnownInputs.set(playerId, input);

    // Try to collect and broadcast for the current frame
    this.collectAndBroadcastInputs(this.currentFrame);
  }

  private handleChat(ws: WebSocket, msg: Extract<ClientMessage, { type: 'chat' }>): void {
    let { message } = msg;

    // Truncate to MAX_CHAT_LENGTH
    if (message.length > MAX_CHAT_LENGTH) {
      message = message.slice(0, MAX_CHAT_LENGTH);
    }

    // Determine sender info
    const playerId = this.getPlayerIdByWs(ws);
    const spectatorId = this.spectatorIds.get(ws);
    const senderId = playerId || spectatorId || 'unknown';

    let senderName = senderId;
    let slotLabel = 'Spectator';

    if (playerId) {
      const player = this.players.get(playerId);
      if (player) {
        senderName = player.info.displayName;
        slotLabel = `P${player.info.slot}`;
      }
    }

    const chatMsg: ServerMessage = {
      type: 'chat',
      senderId,
      senderName,
      slot: slotLabel,
      message,
      timestamp: Date.now(),
    };

    this.broadcastAll(chatMsg);
  }

  private handleStartGame(ws: WebSocket): void {
    const playerId = this.getPlayerIdByWs(ws);
    if (!playerId || playerId !== this.hostId) {
      this.sendTo(ws, { type: 'error', code: 'NOT_HOST', message: 'Only the host can start the game' });
      return;
    }

    if (this.roomPhase !== 'lobby') {
      this.sendTo(ws, { type: 'error', code: 'GAME_ALREADY_STARTED', message: 'Game already started' });
      return;
    }

    this.roomPhase = 'playing';
    this.currentFrame = 0;
    this.pendingInputs.clear();
    this.lastKnownInputs.clear();
    this.disconnectedPlayers.clear();
    this.broadcastAll({ type: 'game_started' });

    // Start the collection timeout for frame 0
    this.scheduleFrameTimeout(0);
  }

  private handleKick(ws: WebSocket, msg: Extract<ClientMessage, { type: 'kick' }>): void {
    const playerId = this.getPlayerIdByWs(ws);
    if (!playerId || playerId !== this.hostId) {
      this.sendTo(ws, { type: 'error', code: 'NOT_HOST', message: 'Only the host can kick players' });
      return;
    }

    const target = this.players.get(msg.targetId);
    if (!target) {
      this.sendTo(ws, { type: 'error', code: 'PLAYER_NOT_FOUND', message: 'Player not found' });
      return;
    }

    // Remove the player
    this.removePlayer(msg.targetId);
    try {
      target.ws.close(4000, 'Kicked by host');
    } catch {
      // WebSocket may already be closed
    }
  }

  private handlePing(ws: WebSocket, msg: Extract<ClientMessage, { type: 'ping' }>): void {
    const now = Date.now();
    this.sendTo(ws, {
      type: 'pong',
      timestamp: msg.timestamp,
      serverTime: now,
    });

    // Measure RTT: client timestamp is when the ping was sent
    const rtt = now - msg.timestamp;
    const playerId = this.getPlayerIdByWs(ws);
    if (playerId) {
      this.playerLatency.set(playerId, rtt);

      // Update latencyMs on player info
      const player = this.players.get(playerId);
      if (player) {
        player.info.latencyMs = rtt;
      }

      // Send latency warning if RTT exceeds threshold
      if (rtt > LATENCY_WARNING_THRESHOLD_MS) {
        this.broadcastAll({
          type: 'latency_warning',
          playerId,
          latencyMs: rtt,
        });
      }
    }
  }

  // ---- Disconnect handling ----

  private handleDisconnect(ws: WebSocket): void {
    // Check if it's a spectator
    if (this.spectators.has(ws)) {
      this.spectators.delete(ws);
      this.spectatorIds.delete(ws);
      this.broadcastSpectatorCount();
      this.checkEmpty();
      return;
    }

    // Find the player
    const playerId = this.getPlayerIdByWs(ws);
    if (!playerId) return;

    if (this.roomPhase === 'lobby') {
      // In lobby: remove after 3 seconds
      const timer = setTimeout(() => {
        this.disconnectTimers.delete(playerId);
        this.removePlayer(playerId);
      }, DISCONNECT_REMOVAL_MS);
      this.disconnectTimers.set(playerId, timer);
    } else {
      // During play: mark as disconnected, broadcast, allow 5s reconnection
      this.disconnectedPlayers.add(playerId);
      this.broadcast({
        type: 'player_disconnected',
        playerId,
        reconnectDeadline: Date.now() + PLAY_DISCONNECT_TIMEOUT_MS,
      });

      // After 5 seconds, if not reconnected, resume with neutral inputs
      // (player stays in the room but their inputs become neutral)
      const timer = setTimeout(() => {
        this.disconnectTimers.delete(playerId);
        // Player remains disconnected — collectAndBroadcastInputs will use neutral inputs
        // Try to advance any stalled frame now that we accept neutral for this player
        if (this.roomPhase === 'playing') {
          this.collectAndBroadcastInputs(this.currentFrame);
        }
      }, PLAY_DISCONNECT_TIMEOUT_MS);
      this.disconnectTimers.set(playerId, timer);
    }
  }

  private removePlayer(playerId: string): void {
    this.players.delete(playerId);
    this.broadcast({ type: 'player_left', playerId });

    // If host left, assign new host
    if (playerId === this.hostId) {
      const firstPlayer = this.players.entries().next();
      if (!firstPlayer.done) {
        const [newHostId, newHost] = firstPlayer.value;
        this.hostId = newHostId;
        newHost.info.isHost = true;
      }
    }

    this.checkEmpty();
  }

  // ---- Alarm: room cleanup after inactivity ----

  async alarm(): Promise<void> {
    const elapsed = Date.now() - this.lastActivity;
    if (elapsed >= INACTIVITY_TIMEOUT_MS) {
      // Close all connections and clean up
      for (const [, { ws }] of this.players) {
        try { ws.close(1000, 'Room closed due to inactivity'); } catch { /* ignore */ }
      }
      for (const ws of this.spectators) {
        try { ws.close(1000, 'Room closed due to inactivity'); } catch { /* ignore */ }
      }
      this.players.clear();
      this.spectators.clear();
      this.spectatorIds.clear();
      this.roomPhase = 'finished';
    } else {
      // Re-schedule alarm for remaining time
      await this.state.storage.setAlarm(Date.now() + (INACTIVITY_TIMEOUT_MS - elapsed));
    }
  }

  // ---- Lockstep input collection and broadcast ----

  /**
   * Collect inputs from all active players for the given frame.
   * When all inputs are present (or substituted), broadcast the combined
   * frame inputs to all players and spectators, then advance the frame counter.
   */
  collectAndBroadcastInputs(frame: number): void {
    if (frame !== this.currentFrame) return;
    if (this.roomPhase !== 'playing') return;

    const frameInputs = this.pendingInputs.get(frame);
    const activePlayerIds = this.getActivePlayerIds();

    // Check if we have inputs from all active (connected) players
    let allCollected = true;
    for (const pid of activePlayerIds) {
      if (!frameInputs?.has(pid)) {
        // If player is disconnected and past the reconnection window, use fallback
        if (this.disconnectedPlayers.has(pid) && !this.disconnectTimers.has(pid)) {
          // Reconnection window expired — fill with neutral/last-known input
          if (!frameInputs) {
            this.pendingInputs.set(frame, new Map());
          }
          const fallback = this.lastKnownInputs.get(pid) ?? neutralInput();
          this.pendingInputs.get(frame)!.set(pid, fallback);
        } else {
          allCollected = false;
        }
      }
    }

    if (!allCollected) return;

    // All inputs collected — build combined inputs record
    const combinedInputs: Record<string, InputFrame> = {};
    const collected = this.pendingInputs.get(frame)!;
    for (const pid of activePlayerIds) {
      combinedInputs[pid] = collected.get(pid) ?? neutralInput();
    }

    // Broadcast to all players and spectators
    const msg: ServerMessage = {
      type: 'frame_inputs',
      frame,
      inputs: combinedInputs,
    };
    this.broadcastAll(msg);

    // Clean up this frame's pending data and timeout
    this.pendingInputs.delete(frame);
    const timeout = this.frameTimeouts.get(frame);
    if (timeout) {
      clearTimeout(timeout);
      this.frameTimeouts.delete(frame);
    }

    // Advance to next frame
    this.currentFrame = frame + 1;

    // Schedule timeout for the next frame
    this.scheduleFrameTimeout(this.currentFrame);

    // Check if next frame already has all inputs (pipelined inputs)
    this.collectAndBroadcastInputs(this.currentFrame);
  }

  /**
   * Schedule a timeout for a frame. If inputs aren't all collected within
   * INPUT_COLLECT_TIMEOUT_MS, fill missing inputs with last-known or neutral.
   */
  private scheduleFrameTimeout(frame: number): void {
    if (this.frameTimeouts.has(frame)) return;

    const timeout = setTimeout(() => {
      this.frameTimeouts.delete(frame);
      if (frame !== this.currentFrame || this.roomPhase !== 'playing') return;

      // Timeout reached — fill missing inputs with fallback
      const activePlayerIds = this.getActivePlayerIds();
      if (!this.pendingInputs.has(frame)) {
        this.pendingInputs.set(frame, new Map());
      }
      const frameInputs = this.pendingInputs.get(frame)!;

      for (const pid of activePlayerIds) {
        if (!frameInputs.has(pid)) {
          frameInputs.set(pid, this.lastKnownInputs.get(pid) ?? neutralInput());
        }
      }

      // Now try to broadcast
      this.collectAndBroadcastInputs(frame);
    }, INPUT_COLLECT_TIMEOUT_MS);

    this.frameTimeouts.set(frame, timeout);
  }

  /**
   * Get the list of player IDs that are considered "active" for input collection.
   * This includes all players in the room (even disconnected ones within the
   * reconnection window — their inputs will be filled by timeout).
   */
  private getActivePlayerIds(): string[] {
    return Array.from(this.players.keys());
  }

  // ---- Helpers ----

  private touchActivity(): void {
    this.lastActivity = Date.now();
    // Schedule alarm for inactivity cleanup
    this.state.storage.setAlarm(Date.now() + INACTIVITY_TIMEOUT_MS).catch(() => {});
  }

  private checkEmpty(): void {
    if (this.players.size === 0 && this.spectators.size === 0) {
      // Schedule cleanup alarm
      this.touchActivity();
    }
  }

  private getPlayerIdByWs(ws: WebSocket): string | null {
    for (const [id, p] of this.players) {
      if (p.ws === ws) return id;
    }
    return null;
  }

  private sendTo(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // WebSocket may be closed
    }
  }

  /** Broadcast to all players except `excludeId` */
  private broadcast(msg: ServerMessage, excludeId?: string): void {
    for (const [id, { ws }] of this.players) {
      if (id !== excludeId) {
        this.sendTo(ws, msg);
      }
    }
  }

  /** Broadcast to all players AND spectators */
  private broadcastAll(msg: ServerMessage): void {
    for (const [, { ws }] of this.players) {
      this.sendTo(ws, msg);
    }
    for (const ws of this.spectators) {
      this.sendTo(ws, msg);
    }
  }

  private broadcastSpectatorCount(): void {
    this.broadcastAll({ type: 'spectator_count', count: this.spectators.size });
  }

  private buildRoomStateSnapshot(): RoomStateSnapshot {
    const players: PlayerInfo[] = [];
    for (const [, p] of this.players) {
      players.push({ ...p.info });
    }
    return {
      roomCode: this.roomCode,
      phase: this.roomPhase,
      hostId: this.hostId,
      players,
      spectatorCount: this.spectators.size,
      romHash: this.roomConfig.romHash,
      romTitle: this.roomConfig.romTitle,
      maxPlayers: this.roomConfig.maxPlayers,
      mode: this.roomConfig.mode,
      isPublic: this.roomConfig.isPublic,
      tags: this.roomConfig.tags,
      description: this.roomConfig.description,
    };
  }
}
