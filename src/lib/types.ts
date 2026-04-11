// =============================================================================
// Shared Type Definitions for FC Arcade Online
// =============================================================================

// --- Console Platforms ---

export type ConsolePlatform =
  | 'NES'
  | 'SNES'
  | 'Game_Boy'
  | 'Game_Boy_Color'
  | 'Game_Boy_Advance'
  | 'Genesis'
  | 'Master_System'
  | 'Arcade'
  | 'Neo_Geo'
  | 'PC_Engine'
  | 'Atari_2600';

// --- Input ---

export interface InputFrame {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  a: boolean;
  b: boolean;
  x: boolean;
  y: boolean;
  l: boolean;
  r: boolean;
  start: boolean;
  select: boolean;
  turbo: Record<string, boolean>;
}

export interface TimestampedInput {
  frame: number;
  input: InputFrame;
  timestamp: number;
}

// --- ROM ---

export interface RomMetadata {
  hash: string;
  userId: string;
  title: string;
  platform: ConsolePlatform;
  playerCount: number;
  fileSize: number;
  coverArtUrl?: string;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RomEntry {
  hash: string;
  data: ArrayBuffer;
  platform: ConsolePlatform;
  title: string;
  addedAt: number;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  detectedPlatform?: ConsolePlatform;
  hash?: string;
  sizeBytes: number;
}

export interface MetadataFilters {
  platform?: ConsolePlatform;
  query?: string;
  playerCount?: number;
}

// --- Emulator Core ---

export interface ButtonMap {
  up: string;
  down: string;
  left: string;
  right: string;
  a: string;
  b: string;
  x: string;
  y: string;
  l: string;
  r: string;
  start: string;
  select: string;
}

export interface CoreConfig {
  coreId: string;
  coreName: string;
  extensions: string[];
  platform: ConsolePlatform;
  wasmUrl: string;
  jsUrl: string;
  defaultButtonMap: ButtonMap;
  audioChannels?: string[];
}

// --- Video & Audio ---

export type VideoFilter = 'crt' | 'lcd' | 'smooth' | 'none';

export type ColorPalette = 'original' | 'vivid' | 'grayscale';

export interface VideoFilterConfig {
  filter: VideoFilter;
  palette: ColorPalette;
  integerScaling: boolean;
}

export interface AudioPrefs {
  masterVolume: number;
  channelMutes: Record<string, boolean>;
  latencyMs: number;
}

// --- Save State ---

export interface SaveStateData {
  romHash: string;
  platform: ConsolePlatform;
  slot: number;
  state: ArrayBuffer;
  thumbnail: Blob;
  savedAt: number;
}

// --- Replay ---

export interface ReplayFile {
  id: string;
  romHash: string;
  platform: ConsolePlatform;
  initialState: ArrayBuffer;
  inputs: TimestampedInput[];
  duration: number;
  createdAt: string;
}

// --- Room / Multiplayer ---

export type RoomState = 'lobby' | 'playing' | 'finished';

export interface RoomOptions {
  isPublic: boolean;
  tags?: string[];
  description?: string;
  mode: 'multiplayer' | 'race' | 'spectator';
}

export interface RoomInfo {
  roomCode: string;
  romHash: string;
  platform: ConsolePlatform;
  romTitle: string;
  hostId: string;
  state: RoomState;
  mode: 'multiplayer' | 'race' | 'spectator';
  players: PlayerInfo[];
  spectatorCount: number;
  maxPlayers: number;
  isPublic: boolean;
  tags: string[];
  description: string;
  createdAt: string;
}

export interface PlayerInfo {
  playerId: string;
  displayName: string;
  slot: number;
  latencyMs: number;
  isHost: boolean;
}

export interface PlayerInputs {
  [playerId: string]: InputFrame;
}

export interface ChatMessage {
  senderId: string;
  senderName: string;
  slot: string;
  message: string;
  timestamp: number;
}

export interface RoomConfig {
  romHash: string;
  platform: ConsolePlatform;
  romTitle: string;
  maxPlayers: number;
  mode: 'multiplayer' | 'race' | 'spectator';
  isPublic: boolean;
  tags: string[];
  description: string;
  inputDelay: number;
}

// --- Player Profile ---

export interface PlayerProfile {
  userId: string;
  displayName: string;
  totalGamesPlayed: number;
  totalTimeSeconds: number;
  multiplayerWins: number;
  createdAt: string;
  updatedAt: string;
}

export interface GameSession {
  id: string;
  userId: string;
  romHash: string;
  platform: ConsolePlatform;
  durationSeconds: number;
  mode: 'single' | 'multiplayer' | 'race' | 'spectator';
  result?: 'win' | 'loss' | 'draw';
  createdAt: string;
}

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  iconUrl?: string;
  conditionType: string;
  conditionValue: number;
}

export interface PlayerAchievement {
  userId: string;
  achievementId: string;
  earnedAt: string;
}

// --- Cheat Codes ---

export interface CheatEntry {
  id: string;
  romHash: string;
  platform: ConsolePlatform;
  code: string;
  format: 'gamegenie' | 'actionreplay' | 'proactionreplay';
  description: string;
  submittedBy: string;
  upvotes: number;
  createdAt: string;
}

// --- Tournament ---

export interface Tournament {
  id: string;
  name: string;
  romHash: string;
  platform: ConsolePlatform;
  maxParticipants: 4 | 8 | 16 | 32;
  matchFormat: 'bo1' | 'bo3';
  status: 'registration' | 'active' | 'completed';
  createdBy: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface TournamentParticipant {
  tournamentId: string;
  userId: string;
  seed?: number;
  eliminatedRound?: number;
  registeredAt: string;
}

export interface TournamentMatch {
  id: string;
  tournamentId: string;
  round: number;
  matchIndex: number;
  player1Id?: string;
  player2Id?: string;
  winnerId?: string;
  roomCode?: string;
  status: 'pending' | 'active' | 'completed' | 'forfeit';
  scheduledAt?: string;
  completedAt?: string;
}

// --- Settings ---

export interface VirtualControlsLayout {
  dpadPosition: { x: number; y: number };
  buttonsPosition: { x: number; y: number };
}

export interface UserSettings {
  buttonMaps: Partial<Record<ConsolePlatform, ButtonMap>>;
  videoFilters: Partial<Record<ConsolePlatform, VideoFilterConfig>>;
  audioPrefs: Partial<Record<ConsolePlatform, AudioPrefs>>;
  virtualControlsLayout: VirtualControlsLayout;
  virtualControlsOpacity: number;
  virtualControlsSize: 'small' | 'medium' | 'large';
}

// --- Responsive Layout ---

export type DeviceClass = 'mobile' | 'tablet' | 'desktop';
export type Orientation = 'portrait' | 'landscape';

export interface LayoutConfig {
  canvasScale: number;
  controlsPosition: 'bottom' | 'sides' | 'hidden';
  chatPosition: 'overlay' | 'side' | 'hidden';
  toolbarPosition: 'top' | 'bottom';
}

// --- API Error ---

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  status: number;
}

// --- WebSocket Message Protocol ---

// Client → Durable Object
export type ClientMessage =
  | { type: 'join'; playerId: string; romHash: string; mode: 'player' | 'spectator' }
  | { type: 'input'; frame: number; input: InputFrame }
  | { type: 'chat'; message: string }
  | { type: 'start_game' }
  | { type: 'kick'; targetId: string }
  | { type: 'ping'; timestamp: number }
  | { type: 'race_frame'; frameData: Uint8Array };

// Durable Object → Client
export type ServerMessage =
  | { type: 'room_state'; state: RoomState }
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
  | { type: 'race_frames'; frames: Record<string, Uint8Array> }
  | { type: 'error'; code: string; message: string };

// --- WebSocket Error Codes ---

export const WS_ERRORS = {
  ROOM_FULL: 'ROOM_FULL',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROM_MISMATCH: 'ROM_MISMATCH',
  NOT_HOST: 'NOT_HOST',
  GAME_ALREADY_STARTED: 'GAME_ALREADY_STARTED',
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  RATE_LIMITED: 'RATE_LIMITED',
} as const;

export type WsErrorCode = (typeof WS_ERRORS)[keyof typeof WS_ERRORS];

// --- Cloudflare Workers Environment ---
// These types reference @cloudflare/workers-types which are available in the
// workers/ directory context. We define them as opaque interfaces here so the
// frontend code can reference the shape without pulling in the full CF types.

export interface Env {
  DB: unknown; // D1Database at runtime in Workers
  KV: unknown; // KVNamespace at runtime in Workers
  ROMS: unknown; // R2Bucket at runtime in Workers
  CORES: unknown; // R2Bucket at runtime in Workers
  REPLAYS: unknown; // R2Bucket at runtime in Workers
  ASSETS: unknown; // R2Bucket at runtime in Workers
  GAME_ROOM: unknown; // DurableObjectNamespace at runtime in Workers
  JWT_SECRET: string;
}

// --- Supported Extensions ---

export const SUPPORTED_EXTENSIONS = [
  '.nes',
  '.sfc',
  '.smc',
  '.gb',
  '.gbc',
  '.gba',
  '.md',
  '.bin',
  '.gen',
  '.sms',
  '.zip',
  '.pce',
  '.a26',
] as const;

export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

// --- Max File Size ---

export const MAX_ROM_SIZE_BYTES = 67_108_864; // 64 MB
