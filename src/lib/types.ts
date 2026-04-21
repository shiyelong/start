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
  ASSETS: unknown; // R2Bucket — renamed to R2_ASSETS in wrangler.toml (ASSETS is reserved in Pages)
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


// =============================================================================
// Shared Type Definitions for StarHub Entertainment Platform
// =============================================================================

// --- MPAA Content Rating ---

/** MPAA content rating levels */
export type ContentRating = 'G' | 'PG' | 'PG-13' | 'R' | 'NC-17';

/** Ordered rating levels for comparison (lower index = less restrictive) */
export const RATING_ORDER: readonly ContentRating[] = [
  'G',
  'PG',
  'PG-13',
  'R',
  'NC-17',
] as const;

// --- Source Types ---

/** Aggregation source content type */
export type SourceType =
  | 'video'
  | 'music'
  | 'comic'
  | 'novel'
  | 'anime'
  | 'live'
  | 'podcast';

/** Source health status */
export type SourceHealth = 'online' | 'offline' | 'degraded';

/** Source configuration stored in D1 */
export interface SourceConfig {
  id: string;
  name: string;
  type: SourceType;
  enabled: boolean;
  rating: ContentRating;
  priority: number;
  searchUrl: string;
  parseRules: string;
  timeout: number;
  health: SourceHealth;
  avgResponseTime: number;
  successRate: number;
  failCount: number;
  lastChecked: string;
}

// --- Aggregated Content ---

/** Universal aggregated search result item */
export interface AggregatedItem {
  id: string;
  title: string;
  cover: string;
  source: string;
  sourceId: string;
  rating: ContentRating;
  type: SourceType;
  url: string;
  metadata: Record<string, unknown>;
  tags?: string[];
}

// --- Search ---

/** Aggregated search request parameters */
export interface SearchRequest {
  query: string;
  type?: SourceType;
  rating?: ContentRating;
  tags?: string[];
  region?: string[];
  page?: number;
  pageSize?: number;
  sortBy?: 'relevance' | 'latest' | 'popular' | 'rating';
}

/** Source status summary within a search response */
export interface SearchSourceStatus {
  name: string;
  count: number;
  health: SourceHealth;
}

/** Aggregated search response */
export interface SearchResponse {
  items: AggregatedItem[];
  total: number;
  page: number;
  pageSize: number;
  sources: SearchSourceStatus[];
}

// --- User Mode (Age Gate) ---

/** User age-gate mode */
export type UserMode = 'child' | 'teen' | 'mature' | 'adult' | 'elder';

/** Maximum allowed content rating per user mode */
export const MODE_MAX_RATING: Record<UserMode, ContentRating> = {
  child: 'G',
  teen: 'PG-13',
  mature: 'R',
  adult: 'NC-17',
  elder: 'PG',
};

// --- API Client Types ---

/** Standard API error response shape */
export interface APIErrorResponse {
  error: string;
  message?: string;
  retryAfter?: number;
}

/** Options for the fetchAPI helper */
export interface FetchAPIOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Skip automatic JSON parsing of the response */
  rawResponse?: boolean;
}

// =============================================================================
// 刮削引擎 & NAS 缓存共享类型
// =============================================================================

// --- 刮削内容类型 ---

/** 刮削引擎支持的内容类型 */
export type ScrapeContentType =
  | 'video'
  | 'comic'
  | 'novel'
  | 'music'
  | 'anime'
  | 'live-recording';

/** 刮削任务状态 */
export type ScrapeTaskStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'blocked';

// --- 刮削规则 ---

/** 刮削规则配置（存储在 D1 scrape_rules 表） */
export interface ScrapeRule {
  id: string;
  sourceId: string;
  contentType: ScrapeContentType;
  enabled: boolean;
  /** 刮削间隔（秒） */
  interval: number;
  depth: 'first-page' | 'top-n' | 'full-site';
  /** depth=top-n 时的最大页数 */
  maxPages: number;
  keywords: string[];
  tags: string[];
  /** 最低评分阈值 */
  minRating: number;
  /** 质量偏好，如 '1080p>720p>480p' */
  qualityPreference: string;
  /** 最大并发下载数 */
  maxConcurrent: number;
  /** 每日最大下载量（MB） */
  dailyLimit: number;
  /** 每次刮削最大项数 */
  maxItemsPerRun: number;
  /** 上次刮削时间 ISO */
  lastScrapedAt: string;
  /** 下次计划刮削时间 ISO */
  nextScheduledAt: string;
}

// --- 刮削任务 ---

/** 刮削任务（存储在 D1 scrape_tasks 表） */
export interface ScrapeTask {
  id: string;
  ruleId: string;
  sourceId: string;
  contentType: ScrapeContentType;
  status: ScrapeTaskStatus;
  /** 进度 0-100 */
  progress: number;
  itemsFound: number;
  itemsDownloaded: number;
  bytesDownloaded: number;
  errors: string[];
  startedAt: string;
  completedAt?: string;
}

// --- 刮削统计 ---

/** 按内容类型的刮削统计 */
export interface ScrapeStats {
  totalItems: number;
  totalBytes: number;
  /** 成功率 0-100 */
  successRate: number;
  lastScrapedAt: string;
  activeTaskCount: number;
}

/** 成人内容刮削状态 */
export interface AdultScrapeStatus {
  contentType: ScrapeContentType;
  itemCount: number;
  storageUsedMB: number;
  storageQuotaMB: number;
  lastScrapedAt: string;
  scrapeStatus: 'active' | 'paused' | 'blocked';
  sourceCount: number;
  healthySources: number;
}

/** NAS 存储使用情况 */
export interface StorageUsage {
  totalUsedMB: number;
  totalQuotaMB: number;
  byContentType: Record<ScrapeContentType, { usedMB: number; quotaMB: number }>;
}

// --- NAS 缓存状态 ---

/** NAS 缓存状态（管理员仪表盘 GET /api/admin/cache/status 响应） */
export interface NASCacheStatus {
  /** 缓存文件总大小（字节） */
  totalSize: number;
  /** 缓存文件总数 */
  itemCount: number;
  /** 缓存命中率 0-100 */
  hitRate: number;
  /** NAS 连接状态 */
  connectionStatus: 'connected' | 'disconnected' | 'degraded';
  /** 按内容类型的缓存分布 */
  byContentType: Record<string, { count: number; sizeBytes: number }>;
}

// =============================================================================
// 分级标签颜色 & 导航配置 & TTS 引擎 & 缓存源头共享类型
// =============================================================================

// --- 分级标签颜色 ---

/** MPAA 分级标签颜色映射（G=绿色, PG=蓝色, PG-13=黄色, R=橙色, NC-17=红色） */
export const RATING_COLORS: Record<ContentRating, string> = {
  'G': '#22c55e',
  'PG': '#3b82f6',
  'PG-13': '#eab308',
  'R': '#f97316',
  'NC-17': '#ef4444',
};

// --- 导航配置 ---

/** 各用户模式的导航配置 */
export interface NavConfig {
  mode: UserMode;
  /** 可见的导航分区 */
  visibleSections: string[];
  /** 隐藏的分级 */
  hiddenRatings: ContentRating[];
  /** 搜索关键词黑名单 */
  searchBlacklist: string[];
  /** UI 风格 */
  uiStyle: 'child' | 'teen' | 'standard' | 'adult' | 'elder';
}

// --- TTS 有声小说引擎类型 ---

/** TTS 语音配置 */
export interface TTSVoiceConfig {
  gender: 'male' | 'female';
  speed: number;
  style: string;
  language: 'zh' | 'en' | 'ja';
}

/** TTS 服务提供商 */
export type TTSProvider = 'openai' | 'edge-tts' | 'azure';

/** TTS 生成任务状态 */
export type TTSTaskStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cached';

/** TTS 生成任务 */
export interface TTSTask {
  id: string;
  novelId: string;
  chapterId: string;
  voice: TTSVoiceConfig;
  provider: TTSProvider;
  status: TTSTaskStatus;
  /** 生成完成后的音频 URL（NAS 代理 URL） */
  audioUrl?: string;
  /** 章节内容哈希 + 语音配置哈希 */
  cacheKey: string;
  /** 音频时长（秒） */
  audioDuration?: number;
  /** 文件大小（字节） */
  fileSize?: number;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

// --- 缓存源头标识 ---

/** 缓存源头标识（用于 X-Cache-Source 响应头） */
export type CacheSourceHeader = 'nas' | 'origin';
