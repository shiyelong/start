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

-- ============================================================
-- 新增表 — 星聚娱乐平台整合 (Platform Entertainment Hub)
-- 24 张新表，涵盖聚合源、用户数据、成人服务、管理后台等模块
-- ============================================================

-- 1. 聚合源配置表
CREATE TABLE IF NOT EXISTS source_config (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,              -- video/music/comic/novel/anime/live/podcast
  enabled INTEGER NOT NULL DEFAULT 1,
  rating TEXT NOT NULL DEFAULT 'PG', -- MPAA 分级
  priority INTEGER NOT NULL DEFAULT 50,
  search_url TEXT NOT NULL,
  parse_rules TEXT NOT NULL DEFAULT '{}',
  timeout INTEGER NOT NULL DEFAULT 10000,
  health TEXT NOT NULL DEFAULT 'online',
  avg_response_time INTEGER NOT NULL DEFAULT 0,
  success_rate INTEGER NOT NULL DEFAULT 100,
  fail_count INTEGER NOT NULL DEFAULT 0,
  last_checked TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_source_type ON source_config(type);
CREATE INDEX IF NOT EXISTS idx_source_enabled ON source_config(enabled);
CREATE INDEX IF NOT EXISTS idx_source_health ON source_config(health);

-- 2. 播放历史表
CREATE TABLE IF NOT EXISTS playback_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  content_type TEXT NOT NULL,      -- video/music/anime/podcast
  content_id TEXT NOT NULL,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  cover TEXT,
  rating TEXT NOT NULL DEFAULT 'PG',
  progress INTEGER NOT NULL DEFAULT 0,  -- 播放进度（秒）
  duration INTEGER NOT NULL DEFAULT 0,
  watched_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_history_user ON playback_history(user_id);
CREATE INDEX IF NOT EXISTS idx_history_type ON playback_history(content_type);
CREATE INDEX IF NOT EXISTS idx_history_watched ON playback_history(watched_at);

-- 3. 收藏表
CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  content_type TEXT NOT NULL,
  content_id TEXT NOT NULL,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  cover TEXT,
  rating TEXT NOT NULL DEFAULT 'PG',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, content_type, content_id)
);
CREATE INDEX IF NOT EXISTS idx_fav_user ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_fav_type ON favorites(content_type);

-- 4. 书签表（漫画/小说阅读进度）
CREATE TABLE IF NOT EXISTS bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  content_type TEXT NOT NULL,      -- comic/novel
  content_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,  -- 漫画=页码, 小说=字符位置
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, content_type, content_id)
);
CREATE INDEX IF NOT EXISTS idx_bookmark_user ON bookmarks(user_id);

-- 5. 播放列表表
CREATE TABLE IF NOT EXISTS playlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'music',  -- music/video
  track_ids TEXT NOT NULL DEFAULT '[]', -- JSON 数组
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_playlist_user ON playlists(user_id);

-- 6. 追番/追剧表
CREATE TABLE IF NOT EXISTS following (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  content_type TEXT NOT NULL,      -- anime/live
  content_id TEXT NOT NULL,
  title TEXT NOT NULL,
  cover TEXT,
  last_episode TEXT,               -- 最新集数
  notified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, content_type, content_id)
);
CREATE INDEX IF NOT EXISTS idx_following_user ON following(user_id);

-- 7. 弹幕表
CREATE TABLE IF NOT EXISTS danmaku (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  time_offset REAL NOT NULL,       -- 弹幕出现时间（秒）
  text TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#FFFFFF',
  position TEXT NOT NULL DEFAULT 'scroll', -- scroll/top/bottom
  size TEXT NOT NULL DEFAULT 'normal',     -- small/normal/large
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_danmaku_video ON danmaku(video_id);
CREATE INDEX IF NOT EXISTS idx_danmaku_time ON danmaku(video_id, time_offset);

-- 8. 通知表
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,              -- episode_update/streamer_live/message/system/comment_reply
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,                       -- 跳转链接
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notify_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notify_unread ON notifications(user_id, is_read);

-- 9. 用户设置表
CREATE TABLE IF NOT EXISTS user_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  age_gate_mode TEXT NOT NULL DEFAULT 'adult',
  age_gate_pin TEXT,               -- 加密存储的 6 位 PIN
  daily_limit INTEGER NOT NULL DEFAULT 0,  -- 0=无限制
  notification_prefs TEXT NOT NULL DEFAULT '{}',
  theme TEXT NOT NULL DEFAULT 'dark',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 10. 成人服务者表
CREATE TABLE IF NOT EXISTS service_providers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  nickname TEXT NOT NULL,
  nationality TEXT,
  country TEXT NOT NULL,
  region TEXT,
  city TEXT,
  ethnicity TEXT,
  height INTEGER,                  -- cm
  weight INTEGER,                  -- kg
  body_type TEXT,
  measurements TEXT,               -- 三围 JSON
  age_range TEXT,
  languages TEXT DEFAULT '[]',     -- JSON 数组
  service_types TEXT DEFAULT '[]', -- JSON 数组
  skills TEXT,
  price_range TEXT,
  availability TEXT,
  location_type TEXT,              -- home/store/both
  photos TEXT DEFAULT '[]',        -- R2 URL JSON 数组
  status TEXT NOT NULL DEFAULT 'pending', -- pending/verified/warning/fraud
  video_verified INTEGER NOT NULL DEFAULT 0,
  video_verified_at TEXT,
  video_url TEXT,                   -- R2 存储的验证视频 URL
  face_match_score REAL,            -- AI 人脸比对分数
  health_verified INTEGER NOT NULL DEFAULT 0,
  health_report_url TEXT,           -- R2 存储的健康报告照片 URL
  health_expires_at TEXT,           -- 健康证明过期时间（30天）
  verification_level TEXT NOT NULL DEFAULT 'none', -- none/video/health/community/full
  verify_count INTEGER NOT NULL DEFAULT 0,
  avg_rating REAL NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  reputation INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sp_country ON service_providers(country);
CREATE INDEX IF NOT EXISTS idx_sp_city ON service_providers(city);
CREATE INDEX IF NOT EXISTS idx_sp_status ON service_providers(status);
CREATE INDEX IF NOT EXISTS idx_sp_ethnicity ON service_providers(ethnicity);

-- 11. 服务点评表
CREATE TABLE IF NOT EXISTS service_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id INTEGER NOT NULL REFERENCES service_providers(id),
  reviewer_id INTEGER NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  text TEXT,
  tags TEXT DEFAULT '[]',          -- JSON 数组
  is_anonymous INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_review_provider ON service_reviews(provider_id);

-- 12. 验证报告表
CREATE TABLE IF NOT EXISTS verification_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id INTEGER NOT NULL REFERENCES service_providers(id),
  verifier_id INTEGER NOT NULL REFERENCES users(id),
  photo_match INTEGER NOT NULL,    -- 1-5 照片一致性
  description_accuracy INTEGER NOT NULL, -- 1-5 描述准确度
  safety_rating INTEGER NOT NULL,  -- 1-5 安全性
  comments TEXT,
  is_positive INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vr_provider ON verification_reports(provider_id);

-- 13. 招聘信息表
CREATE TABLE IF NOT EXISTS job_listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employer_id INTEGER NOT NULL REFERENCES users(id),
  business_name TEXT NOT NULL,
  country TEXT NOT NULL,
  region TEXT,
  city TEXT,
  venue_type TEXT,
  job_description TEXT NOT NULL,
  requirements TEXT,
  salary_range TEXT,
  benefits TEXT,
  work_hours TEXT,
  appearance_reqs TEXT,
  skill_reqs TEXT DEFAULT '[]',
  language_reqs TEXT DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending', -- pending/verified/warning
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_job_country ON job_listings(country);
CREATE INDEX IF NOT EXISTS idx_job_city ON job_listings(city);
CREATE INDEX IF NOT EXISTS idx_job_status ON job_listings(status);

-- 14. 黑名单表
CREATE TABLE IF NOT EXISTS blacklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT NOT NULL,       -- provider/employer/consumer
  target_id INTEGER NOT NULL,
  nickname TEXT NOT NULL,
  region TEXT,
  fraud_type TEXT NOT NULL,
  description TEXT NOT NULL,
  report_count INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bl_type ON blacklist(target_type);

-- 15. 私信表
CREATE TABLE IF NOT EXISTS private_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL REFERENCES users(id),
  receiver_id INTEGER NOT NULL REFERENCES users(id),
  content_encrypted TEXT NOT NULL,  -- 端到端加密内容
  message_type TEXT NOT NULL DEFAULT 'text', -- text/image/voice
  is_read INTEGER NOT NULL DEFAULT 0,
  auto_delete_at TEXT,             -- 阅后即焚时间
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pm_sender ON private_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_pm_receiver ON private_messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_pm_unread ON private_messages(receiver_id, is_read);

-- 16. 约会档案表
CREATE TABLE IF NOT EXISTS dating_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  nickname TEXT NOT NULL,
  nationality TEXT,
  city TEXT,
  age_range TEXT,
  gender TEXT,
  orientation TEXT,
  ethnicity TEXT,
  height INTEGER,
  body_type TEXT,
  interests TEXT DEFAULT '[]',     -- JSON 数组
  bio TEXT,
  photos TEXT DEFAULT '[]',        -- R2 URL JSON 数组
  reputation INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dating_city ON dating_profiles(city);
CREATE INDEX IF NOT EXISTS idx_dating_gender ON dating_profiles(gender);

-- 17. 约会匹配表
CREATE TABLE IF NOT EXISTS dating_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_a INTEGER NOT NULL REFERENCES users(id),
  user_b INTEGER NOT NULL REFERENCES users(id),
  user_a_liked INTEGER NOT NULL DEFAULT 0,
  user_b_liked INTEGER NOT NULL DEFAULT 0,
  matched INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_a, user_b)
);
CREATE INDEX IF NOT EXISTS idx_match_a ON dating_matches(user_a);
CREATE INDEX IF NOT EXISTS idx_match_b ON dating_matches(user_b);

-- 18. 成人论坛帖子表
CREATE TABLE IF NOT EXISTS adult_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section TEXT NOT NULL,           -- exchange/experience/resource/dating/worker/safety
  author_id INTEGER NOT NULL REFERENCES users(id),
  anonymous_id TEXT NOT NULL,      -- 随机匿名 ID
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  images TEXT DEFAULT '[]',        -- R2 URL JSON 数组
  tags TEXT DEFAULT '[]',
  likes INTEGER NOT NULL DEFAULT 0,
  reply_count INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ap_section ON adult_posts(section);
CREATE INDEX IF NOT EXISTS idx_ap_author ON adult_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_ap_created ON adult_posts(created_at);

-- 19. 管理员表
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'content', -- super/content/source/community
  last_login TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 20. 管理员操作日志表
CREATE TABLE IF NOT EXISTS admin_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL REFERENCES admins(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_alog_admin ON admin_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_alog_action ON admin_logs(action);
CREATE INDEX IF NOT EXISTS idx_alog_created ON admin_logs(created_at);

-- 21. NAS 缓存索引表
CREATE TABLE IF NOT EXISTS cache_index (
  id TEXT PRIMARY KEY,             -- 内容哈希
  content_type TEXT NOT NULL,
  original_url TEXT NOT NULL,
  encrypted_path TEXT NOT NULL,    -- NAS 上的加密文件路径
  file_size INTEGER NOT NULL,
  access_count INTEGER NOT NULL DEFAULT 0,
  last_accessed TEXT NOT NULL DEFAULT (datetime('now')),
  cached_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cache_type ON cache_index(content_type);
CREATE INDEX IF NOT EXISTS idx_cache_accessed ON cache_index(last_accessed);
CREATE INDEX IF NOT EXISTS idx_cache_count ON cache_index(access_count);

-- 22. Telegram 频道配置表
CREATE TABLE IF NOT EXISTS telegram_channels (
  id TEXT PRIMARY KEY,             -- Telegram 频道 ID
  name TEXT NOT NULL,
  content_type TEXT NOT NULL,      -- video/image/mixed
  rating TEXT NOT NULL DEFAULT 'PG',
  enabled INTEGER NOT NULL DEFAULT 1,
  last_fetched TEXT,
  fetch_interval INTEGER NOT NULL DEFAULT 1800, -- 秒
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 23. AI 聊天会话表
CREATE TABLE IF NOT EXISTS ai_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT,                      -- 会话标题（取第一条消息摘要）
  model TEXT NOT NULL DEFAULT 'auto',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_conv_user ON ai_conversations(user_id);

-- 24. AI 聊天消息表
CREATE TABLE IF NOT EXISTS ai_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES ai_conversations(id),
  role TEXT NOT NULL,              -- user/assistant/system
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_msg_conv ON ai_messages(conversation_id);
