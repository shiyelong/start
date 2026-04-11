-- StarHub D1 Database Schema
-- Compatible with SQLite (Cloudflare D1) and PostgreSQL
-- 15 tables total

-- 1. users
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nickname TEXT,
  avatar TEXT,
  bio TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  verify_count INTEGER NOT NULL DEFAULT 0,
  reputation INTEGER NOT NULL DEFAULT 0,
  like_count INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. verify_items
CREATE TABLE IF NOT EXISTS verify_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  sub_type TEXT NOT NULL DEFAULT 'all',
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unverified',
  info TEXT DEFAULT '{}',
  tags TEXT DEFAULT '[]',
  resolved_fields TEXT DEFAULT '{}',
  submitted_by INTEGER REFERENCES users(id),
  verify_count INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. verify_records
CREATE TABLE IF NOT EXISTS verify_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES verify_items(id),
  verifier_id INTEGER NOT NULL REFERENCES users(id),
  verifier_name TEXT NOT NULL,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT NOT NULL,
  reason TEXT NOT NULL,
  likes INTEGER NOT NULL DEFAULT 0,
  dislikes INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. verify_votes
CREATE TABLE IF NOT EXISTS verify_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_id INTEGER NOT NULL REFERENCES verify_records(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  vote_type TEXT NOT NULL CHECK(vote_type IN ('like', 'dislike')),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(record_id, user_id)
);

-- 5. posts
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'discuss',
  author_id INTEGER NOT NULL REFERENCES users(id),
  author_name TEXT NOT NULL,
  likes INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. comments
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id),
  author_id INTEGER NOT NULL REFERENCES users(id),
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  likes INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7. post_likes
CREATE TABLE IF NOT EXISTS post_likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(post_id, user_id)
);

-- 8. game_scores
CREATE TABLE IF NOT EXISTS game_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  game_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  played_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 9. game_saves
CREATE TABLE IF NOT EXISTS game_saves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  game_id TEXT NOT NULL,
  save_data TEXT NOT NULL DEFAULT '{}',
  slot INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, game_id, slot)
);

-- 10. game_achievements
CREATE TABLE IF NOT EXISTS game_achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  game_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL,
  unlocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, game_id, achievement_id)
);

-- 11. chat_messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  username TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 12. live_rooms
CREATE TABLE IF NOT EXISTS live_rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  streamer_id INTEGER NOT NULL REFERENCES users(id),
  streamer_name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  tags TEXT DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'live',
  viewer_count INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 13. live_messages
CREATE TABLE IF NOT EXISTS live_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL REFERENCES live_rooms(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  username TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 14. ai_usage
CREATE TABLE IF NOT EXISTS ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  tokens_used INTEGER NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 15. comment_likes
CREATE TABLE IF NOT EXISTS comment_likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id INTEGER NOT NULL REFERENCES comments(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(comment_id, user_id)
);

-- ============================================================
-- Indexes for common query patterns
-- ============================================================

-- users
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- verify_items
CREATE INDEX IF NOT EXISTS idx_verify_items_type ON verify_items(type);
CREATE INDEX IF NOT EXISTS idx_verify_items_status ON verify_items(status);
CREATE INDEX IF NOT EXISTS idx_verify_items_submitted_by ON verify_items(submitted_by);
CREATE INDEX IF NOT EXISTS idx_verify_items_created_at ON verify_items(created_at);

-- verify_records
CREATE INDEX IF NOT EXISTS idx_verify_records_item_id ON verify_records(item_id);
CREATE INDEX IF NOT EXISTS idx_verify_records_verifier_id ON verify_records(verifier_id);

-- verify_votes
CREATE INDEX IF NOT EXISTS idx_verify_votes_record_id ON verify_votes(record_id);
CREATE INDEX IF NOT EXISTS idx_verify_votes_user_id ON verify_votes(user_id);

-- posts
CREATE INDEX IF NOT EXISTS idx_posts_author_id ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at);

-- comments
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_author_id ON comments(author_id);

-- post_likes
CREATE INDEX IF NOT EXISTS idx_post_likes_post_id ON post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_user_id ON post_likes(user_id);

-- game_scores
CREATE INDEX IF NOT EXISTS idx_game_scores_user_id ON game_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_game_scores_game_id ON game_scores(game_id);
CREATE INDEX IF NOT EXISTS idx_game_scores_played_at ON game_scores(played_at);
CREATE INDEX IF NOT EXISTS idx_game_scores_game_score ON game_scores(game_id, score);

-- game_saves
CREATE INDEX IF NOT EXISTS idx_game_saves_user_id ON game_saves(user_id);
CREATE INDEX IF NOT EXISTS idx_game_saves_game_id ON game_saves(game_id);

-- game_achievements
CREATE INDEX IF NOT EXISTS idx_game_achievements_user_id ON game_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_game_achievements_game_id ON game_achievements(game_id);

-- chat_messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_id ON chat_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);

-- live_rooms
CREATE INDEX IF NOT EXISTS idx_live_rooms_streamer_id ON live_rooms(streamer_id);
CREATE INDEX IF NOT EXISTS idx_live_rooms_status ON live_rooms(status);
CREATE INDEX IF NOT EXISTS idx_live_rooms_category ON live_rooms(category);

-- live_messages
CREATE INDEX IF NOT EXISTS idx_live_messages_room_id ON live_messages(room_id);
CREATE INDEX IF NOT EXISTS idx_live_messages_user_id ON live_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_live_messages_created_at ON live_messages(created_at);

-- ai_usage
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_id ON ai_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON ai_usage(created_at);

-- comment_likes
CREATE INDEX IF NOT EXISTS idx_comment_likes_comment_id ON comment_likes(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_likes_user_id ON comment_likes(user_id);

-- ============================================================
-- FC Arcade Online: Classic Console ROM Multiplayer Platform
-- ============================================================

-- ROM metadata
CREATE TABLE IF NOT EXISTS rom_metadata (
  hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  platform TEXT NOT NULL,
  player_count INTEGER NOT NULL DEFAULT 1,
  file_size INTEGER NOT NULL,
  cover_art_url TEXT,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rom_user ON rom_metadata(user_id);
CREATE INDEX IF NOT EXISTS idx_rom_platform ON rom_metadata(platform);
CREATE INDEX IF NOT EXISTS idx_rom_title ON rom_metadata(title);

-- Player profiles
CREATE TABLE IF NOT EXISTS player_profile (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  total_games_played INTEGER NOT NULL DEFAULT 0,
  total_time_seconds INTEGER NOT NULL DEFAULT 0,
  multiplayer_wins INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Game sessions
CREATE TABLE IF NOT EXISTS game_session (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  rom_hash TEXT NOT NULL,
  platform TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  mode TEXT NOT NULL,
  result TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES player_profile(user_id),
  FOREIGN KEY (rom_hash) REFERENCES rom_metadata(hash)
);
CREATE INDEX IF NOT EXISTS idx_session_user ON game_session(user_id);
CREATE INDEX IF NOT EXISTS idx_session_rom ON game_session(rom_hash);
CREATE INDEX IF NOT EXISTS idx_session_date ON game_session(created_at);

-- Achievements
CREATE TABLE IF NOT EXISTS achievement_definition (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon_url TEXT,
  condition_type TEXT NOT NULL,
  condition_value INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS player_achievement (
  user_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL,
  earned_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, achievement_id),
  FOREIGN KEY (user_id) REFERENCES player_profile(user_id),
  FOREIGN KEY (achievement_id) REFERENCES achievement_definition(id)
);

-- Cheat codes
CREATE TABLE IF NOT EXISTS cheat_code (
  id TEXT PRIMARY KEY,
  rom_hash TEXT NOT NULL,
  platform TEXT NOT NULL,
  code TEXT NOT NULL,
  format TEXT NOT NULL,
  description TEXT NOT NULL,
  submitted_by TEXT NOT NULL,
  upvotes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cheat_rom ON cheat_code(rom_hash);

-- Tournaments
CREATE TABLE IF NOT EXISTS tournament (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  rom_hash TEXT NOT NULL,
  platform TEXT NOT NULL,
  max_participants INTEGER NOT NULL,
  match_format TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'registration',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS tournament_participant (
  tournament_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  seed INTEGER,
  eliminated_round INTEGER,
  registered_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tournament_id, user_id),
  FOREIGN KEY (tournament_id) REFERENCES tournament(id),
  FOREIGN KEY (user_id) REFERENCES player_profile(user_id)
);

CREATE TABLE IF NOT EXISTS tournament_match (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  round INTEGER NOT NULL,
  match_index INTEGER NOT NULL,
  player1_id TEXT,
  player2_id TEXT,
  winner_id TEXT,
  room_code TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  scheduled_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (tournament_id) REFERENCES tournament(id)
);
CREATE INDEX IF NOT EXISTS idx_match_tournament ON tournament_match(tournament_id);

-- Replay metadata
CREATE TABLE IF NOT EXISTS replay (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  rom_hash TEXT NOT NULL,
  platform TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  r2_key TEXT,
  share_code TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_replay_user ON replay(user_id);
CREATE INDEX IF NOT EXISTS idx_replay_rom ON replay(rom_hash);
