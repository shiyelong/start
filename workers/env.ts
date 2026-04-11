/// <reference types="@cloudflare/workers-types" />

/**
 * Cloudflare Workers environment bindings.
 * This file uses the actual Cloudflare Workers types for use in worker code.
 */
export interface WorkerEnv {
  DB: D1Database;
  KV: KVNamespace;
  ROMS: R2Bucket;
  CORES: R2Bucket;
  REPLAYS: R2Bucket;
  R2_ASSETS: R2Bucket;
  GAME_ROOM: DurableObjectNamespace;
  JWT_SECRET: string;
}
