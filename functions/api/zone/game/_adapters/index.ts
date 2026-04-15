/**
 * Adult Game Aggregation Adapters
 *
 * Provides source adapters for adult game platforms.
 * All sources auto-tagged NC-17. Each adapter implements search/getDetail.
 *
 * Requirements: 34.1, 34.6, 34.8, 34.9, 34.10
 */

// ─── Shared Types ────────────────────────────────────────

export interface GameSearchParams {
  query?: string;
  type?: string;
  tags?: string[];
  style?: string;
  language?: string;
  playable?: boolean;
  sort?: 'hot' | 'rating' | 'newest' | 'random';
  page?: number;
  limit?: number;
}

export interface GameItem {
  id: string;
  title: string;
  type: string;
  tags: string[];
  style: string;
  language: string;
  playable: boolean;
  url: string;
  thumbnail?: string;
  rating: number;
  source: string;
}

// ─── Base Adapter ────────────────────────────────────────

abstract class BaseGameAdapter {
  abstract name: string;
  abstract baseUrl: string;
  rating = 'NC-17' as const;

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(this.baseUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  abstract search(params: GameSearchParams): Promise<GameItem[]>;
  abstract getDetail(id: string): Promise<GameItem | null>;
}

// ─── DLsite Adapter ──────────────────────────────────────

class DLsiteAdapter extends BaseGameAdapter {
  name = 'dlsite';
  baseUrl = 'https://www.dlsite.com';

  async search(params: GameSearchParams): Promise<GameItem[]> {
    // Stub: In production, scrape/API call via Cloudflare Workers proxy
    return [{
      id: 'dlsite-placeholder',
      title: 'DLsite Game',
      type: params.type || 'rpg',
      tags: ['japanese', 'doujin'],
      style: '2d-anime',
      language: 'ja',
      playable: false,
      url: `${this.baseUrl}/maniax/`,
      rating: 4.5,
      source: this.name,
    }];
  }

  async getDetail(id: string): Promise<GameItem | null> {
    return { id, title: 'DLsite Game', type: 'rpg', tags: ['japanese'], style: '2d-anime', language: 'ja', playable: false, url: this.baseUrl, rating: 4.5, source: this.name };
  }
}

// ─── DMM Games Adapter ───────────────────────────────────

class DMMGamesAdapter extends BaseGameAdapter {
  name = 'dmm';
  baseUrl = 'https://games.dmm.co.jp';

  async search(params: GameSearchParams): Promise<GameItem[]> {
    return [{
      id: 'dmm-placeholder',
      title: 'DMM Game',
      type: params.type || 'simulation',
      tags: ['japanese', 'browser'],
      style: '2d-anime',
      language: 'ja',
      playable: true,
      url: this.baseUrl,
      rating: 4.0,
      source: this.name,
    }];
  }

  async getDetail(id: string): Promise<GameItem | null> {
    return { id, title: 'DMM Game', type: 'simulation', tags: ['japanese'], style: '2d-anime', language: 'ja', playable: true, url: this.baseUrl, rating: 4.0, source: this.name };
  }
}

// ─── Nutaku Adapter ──────────────────────────────────────

class NutakuAdapter extends BaseGameAdapter {
  name = 'nutaku';
  baseUrl = 'https://www.nutaku.net';

  async search(params: GameSearchParams): Promise<GameItem[]> {
    return [{
      id: 'nutaku-placeholder',
      title: 'Nutaku Game',
      type: params.type || 'rpg',
      tags: ['browser', 'f2p'],
      style: '2d-anime',
      language: 'en',
      playable: true,
      url: this.baseUrl,
      rating: 4.0,
      source: this.name,
    }];
  }

  async getDetail(id: string): Promise<GameItem | null> {
    return { id, title: 'Nutaku Game', type: 'rpg', tags: ['browser', 'f2p'], style: '2d-anime', language: 'en', playable: true, url: this.baseUrl, rating: 4.0, source: this.name };
  }
}

// ─── Itch.io Adult Adapter ───────────────────────────────

class ItchAdultAdapter extends BaseGameAdapter {
  name = 'itch-adult';
  baseUrl = 'https://itch.io';

  async search(params: GameSearchParams): Promise<GameItem[]> {
    return [{
      id: 'itch-placeholder',
      title: 'Itch.io Adult Game',
      type: params.type || 'visual-novel',
      tags: ['indie', 'experimental'],
      style: 'various',
      language: 'en',
      playable: true,
      url: `${this.baseUrl}/games/tag-nsfw`,
      rating: 3.9,
      source: this.name,
    }];
  }

  async getDetail(id: string): Promise<GameItem | null> {
    return { id, title: 'Itch.io Adult Game', type: 'visual-novel', tags: ['indie'], style: 'various', language: 'en', playable: true, url: this.baseUrl, rating: 3.9, source: this.name };
  }
}

// ─── F95Zone Adapter ─────────────────────────────────────

class F95ZoneAdapter extends BaseGameAdapter {
  name = 'f95zone';
  baseUrl = 'https://f95zone.to';

  async search(params: GameSearchParams): Promise<GameItem[]> {
    return [{
      id: 'f95-placeholder',
      title: 'F95Zone Game',
      type: params.type || 'visual-novel',
      tags: ['community', 'indie'],
      style: 'various',
      language: 'en',
      playable: false,
      url: this.baseUrl,
      rating: 4.2,
      source: this.name,
    }];
  }

  async getDetail(id: string): Promise<GameItem | null> {
    return { id, title: 'F95Zone Game', type: 'visual-novel', tags: ['community'], style: 'various', language: 'en', playable: false, url: this.baseUrl, rating: 4.2, source: this.name };
  }
}

// ─── Lewdzone Adapter ────────────────────────────────────

class LewdzoneAdapter extends BaseGameAdapter {
  name = 'lewdzone';
  baseUrl = 'https://lewdzone.com';

  async search(params: GameSearchParams): Promise<GameItem[]> {
    return [{
      id: 'lewdzone-placeholder',
      title: 'Lewdzone Game',
      type: params.type || 'rpg',
      tags: ['download', 'collection'],
      style: 'various',
      language: 'en',
      playable: false,
      url: this.baseUrl,
      rating: 3.8,
      source: this.name,
    }];
  }

  async getDetail(id: string): Promise<GameItem | null> {
    return { id, title: 'Lewdzone Game', type: 'rpg', tags: ['download'], style: 'various', language: 'en', playable: false, url: this.baseUrl, rating: 3.8, source: this.name };
  }
}

// ─── Newgrounds Adult Adapter ────────────────────────────

class NewgroundsAdultAdapter extends BaseGameAdapter {
  name = 'newgrounds-adult';
  baseUrl = 'https://www.newgrounds.com';

  async search(params: GameSearchParams): Promise<GameItem[]> {
    return [{
      id: 'ng-placeholder',
      title: 'Newgrounds 18+ Game',
      type: params.type || 'flash',
      tags: ['classic', 'browser'],
      style: 'various',
      language: 'en',
      playable: true,
      url: `${this.baseUrl}/games`,
      rating: 3.7,
      source: this.name,
    }];
  }

  async getDetail(id: string): Promise<GameItem | null> {
    return { id, title: 'Newgrounds 18+ Game', type: 'flash', tags: ['classic'], style: 'various', language: 'en', playable: true, url: this.baseUrl, rating: 3.7, source: this.name };
  }
}

// ─── HTML5 Adult Games Adapter ───────────────────────────

class HTML5AdultAdapter extends BaseGameAdapter {
  name = 'html5-adult';
  baseUrl = 'https://html5-adult-games.example.com';

  async search(params: GameSearchParams): Promise<GameItem[]> {
    return [{
      id: 'html5-placeholder',
      title: 'HTML5 Adult Game',
      type: params.type || 'casual',
      tags: ['browser', 'html5'],
      style: '2d-anime',
      language: 'en',
      playable: true,
      url: this.baseUrl,
      rating: 3.5,
      source: this.name,
    }];
  }

  async getDetail(id: string): Promise<GameItem | null> {
    return { id, title: 'HTML5 Adult Game', type: 'casual', tags: ['browser'], style: '2d-anime', language: 'en', playable: true, url: this.baseUrl, rating: 3.5, source: this.name };
  }
}

// ─── WebGL Adult Games Adapter ───────────────────────────

class WebGLAdultAdapter extends BaseGameAdapter {
  name = 'webgl-adult';
  baseUrl = 'https://webgl-adult-games.example.com';

  async search(params: GameSearchParams): Promise<GameItem[]> {
    return [{
      id: 'webgl-placeholder',
      title: 'WebGL Adult Game',
      type: params.type || 'action',
      tags: ['browser', 'webgl', '3d'],
      style: '3d',
      language: 'en',
      playable: true,
      url: this.baseUrl,
      rating: 3.6,
      source: this.name,
    }];
  }

  async getDetail(id: string): Promise<GameItem | null> {
    return { id, title: 'WebGL Adult Game', type: 'action', tags: ['browser', '3d'], style: '3d', language: 'en', playable: true, url: this.baseUrl, rating: 3.6, source: this.name };
  }
}

// ─── Adapter Registry ────────────────────────────────────

export const adultGameAdapters = [
  new DLsiteAdapter(),
  new DMMGamesAdapter(),
  new NutakuAdapter(),
  new ItchAdultAdapter(),
  new F95ZoneAdapter(),
  new LewdzoneAdapter(),
  new NewgroundsAdultAdapter(),
  new HTML5AdultAdapter(),
  new WebGLAdultAdapter(),
];

/**
 * Aggregate search across all adult game adapters.
 * Runs all adapters concurrently with a 10s timeout per adapter.
 */
export async function searchAdultGames(params: GameSearchParams): Promise<GameItem[]> {
  const results = await Promise.allSettled(
    adultGameAdapters.map(adapter =>
      Promise.race([
        adapter.search(params),
        new Promise<GameItem[]>((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
      ])
    )
  );

  const items: GameItem[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    }
  }

  // Apply sorting
  if (params.sort === 'rating') items.sort((a, b) => b.rating - a.rating);
  else if (params.sort === 'random') items.sort(() => Math.random() - 0.5);

  // Apply pagination
  const page = params.page || 1;
  const limit = params.limit || 20;
  return items.slice((page - 1) * limit, page * limit);
}
