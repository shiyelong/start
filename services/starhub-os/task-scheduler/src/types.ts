// types.ts — 核心类型定义

// ── 枚举 ──────────────────────────────────────────────

/** 任务状态 */
export enum TaskStatus {
  Pending = 'pending',
  Processing = 'processing',
  Completed = 'completed',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

/** 任务类型 */
export enum TaskType {
  VideoPipeline = 'video_pipeline',
  ComicPipeline = 'comic_pipeline',
  NovelPipeline = 'novel_pipeline',
  AudioPipeline = 'audio_pipeline',
  DedupScan = 'dedup_scan',
  FaceVerify = 'face_verify',
  Tagger = 'tagger',
}

/** 步骤状态 */
export enum StepStatus {
  Pending = 'pending',
  Processing = 'processing',
  Completed = 'completed',
  Failed = 'failed',
  Skipped = 'skipped',
}

/** MPAA 分级 */
export enum MpaaRating {
  G = 'G',
  PG = 'PG',
  PG13 = 'PG-13',
  R = 'R',
  NC17 = 'NC-17',
}

// ── 接口 ──────────────────────────────────────────────

/** 核心任务 */
export interface Task {
  id: string;
  type: string;
  status: string;
  priority: number;
  source: string | null;
  source_url: string | null;
  file_path: string;
  content_id: string | null;
  content_type: string | null;
  mpaa_rating: string;
  current_step: number;
  total_steps: number | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  metadata: string | null;
}

/** 任务步骤 */
export interface TaskStep {
  id: string;
  task_id: string;
  step_number: number;
  step_name: string;
  status: string;
  error_message: string | null;
  retry_count: number;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  output_path: string | null;
  metadata: string | null;
}

/** GPU 互斥锁（单行表） */
export interface GpuLock {
  id: number;
  locked_by: string | null;
  service: string | null;
  locked_at: string | null;
  expires_at: string | null;
}

/** 内容注册表 */
export interface ContentRegistryEntry {
  id: string;
  type: string;
  title: string | null;
  mpaa_rating: string;
  status: string;
  duration_sec: number | null;
  resolution: string | null;
  audio_tracks: string | null;
  subtitle_tracks: string | null;
  page_count: number | null;
  versions: string | null;
  word_count: number | null;
  chapter_count: number | null;
  modes: string | null;
  artist: string | null;
  formats: string | null;
  file_path: string;
  thumbnail_path: string | null;
  source: string | null;
  source_url: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

// ── 查询参数 ──────────────────────────────────────────

/** listTasks 过滤条件 */
export interface ListTasksFilter {
  status?: string;
  type?: string;
  limit?: number;
  offset?: number;
}
