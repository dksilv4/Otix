# ruff: noqa: E501
"""consolidated schema — replaces all prior migrations.

Idempotent: all CREATE/ALTER use IF NOT EXISTS / IF EXISTS so it is
safe to apply regardless of the current schema state.

Revision ID: aaaaaaaa0001
Revises: None
Create Date: 2026-07-06
"""
from __future__ import annotations
from alembic import op

revision = "aaaaaaaa0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.execute("""CREATE TABLE IF NOT EXISTS albums (
  media_item_id VARCHAR(16) NOT NULL,
  release_type VARCHAR(20) NOT NULL,
  format VARCHAR(50),
  catalog_number VARCHAR(100),
  barcode VARCHAR(50),
  track_count INTEGER NOT NULL,
  disc_count INTEGER NOT NULL,
  duration_ms INTEGER,
  spotify_url VARCHAR(500),
  spotify_popularity INTEGER,
  preview_url VARCHAR(500),
  audio_features JSONB,
  PRIMARY KEY (media_item_id)
)""")

    op.execute("""CREATE TABLE IF NOT EXISTS auth_action_tokens (
  id VARCHAR(16) NOT NULL,
  user_id VARCHAR(16) NOT NULL,
  purpose VARCHAR(20) NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE INDEX IF NOT EXISTS ix_auth_action_tokens_token_hash ON auth_action_tokens (token_hash)""")

    op.execute("""CREATE INDEX IF NOT EXISTS ix_auth_action_tokens_user_purpose ON auth_action_tokens (user_id, purpose)""")

    op.execute("""CREATE TABLE IF NOT EXISTS blueprint_likes (
  id VARCHAR(16) NOT NULL,
  user_id VARCHAR(16) NOT NULL,
  blueprint_id VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE INDEX IF NOT EXISTS idx_blueprint_likes_blueprint_id ON blueprint_likes (blueprint_id)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS uq_blueprint_like ON blueprint_likes (user_id, blueprint_id)""")

    op.execute("""CREATE TABLE IF NOT EXISTS blueprints (
  id VARCHAR(16) NOT NULL,
  user_id VARCHAR(16) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  blueprint_string TEXT NOT NULL,
  parsed_data JSON NOT NULL,
  tags JSON NOT NULL,
  downloads INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE INDEX IF NOT EXISTS idx_blueprints_created_at ON blueprints (created_at)""")

    op.execute("""CREATE INDEX IF NOT EXISTS idx_blueprints_user_id ON blueprints (user_id)""")

    op.execute("""CREATE TABLE IF NOT EXISTS collection_items (
  collection_id VARCHAR(16) NOT NULL,
  media_item_id VARCHAR(16) NOT NULL,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (collection_id, media_item_id)
)""")

    op.execute("""CREATE TABLE IF NOT EXISTS collections (
  id VARCHAR(16) NOT NULL,
  name VARCHAR(1000) NOT NULL,
  overview TEXT,
  poster_url VARCHAR(2000),
  backdrop_url VARCHAR(2000),
  content_hash VARCHAR(64),
  franchise_id VARCHAR(16),
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE TABLE IF NOT EXISTS companies (
  id VARCHAR(16) NOT NULL,
  name VARCHAR(500) NOT NULL,
  slug VARCHAR(500) NOT NULL,
  logo_url VARCHAR(2000),
  origin_country VARCHAR(10),
  embedding vector(1024),
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS companies_slug_key ON companies (slug)""")

    op.execute("""CREATE INDEX IF NOT EXISTS ix_companies_embedding_hnsw ON companies USING hnsw (embedding vector_cosine_ops)""")

    op.execute("""CREATE TABLE IF NOT EXISTS company_ratings (
  user_id VARCHAR(16) NOT NULL,
  company_id VARCHAR(16) NOT NULL,
  score INTEGER NOT NULL,
  PRIMARY KEY (user_id, company_id)
)""")

    op.execute("""CREATE TABLE IF NOT EXISTS episodes (
  id VARCHAR(16) NOT NULL,
  season_id VARCHAR(16) NOT NULL,
  episode_number INTEGER NOT NULL,
  name VARCHAR(1000),
  overview TEXT,
  runtime INTEGER,
  air_date DATE,
  still_url VARCHAR(2000),
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE INDEX IF NOT EXISTS idx_episodes_season ON episodes (season_id)""")

    op.execute("""CREATE TABLE IF NOT EXISTS exercises (
  id VARCHAR(16) NOT NULL,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(50),
  aliases JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS exercises_name_key ON exercises (name)""")

    op.execute("""CREATE TABLE IF NOT EXISTS external_ids (
  id VARCHAR(16) NOT NULL,
  provider VARCHAR(30) NOT NULL,
  external_id VARCHAR(100) NOT NULL,
  entity_type VARCHAR(30),
  entity_id VARCHAR(16),
  media_item_id VARCHAR(16),
  media_type VARCHAR(10),
  is_adult BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  content_hash VARCHAR(64),
  hash_match_count INTEGER NOT NULL,
  confirmed_count INTEGER NOT NULL,
  confirmed_by VARCHAR(30) ARRAY NOT NULL,
  last_confirmed_at TIMESTAMPTZ,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE INDEX IF NOT EXISTS ix_external_id_entity ON external_ids (entity_type, entity_id)""")

    op.execute("""CREATE INDEX IF NOT EXISTS ix_external_ids_stubs ON external_ids (provider, media_item_id, is_adult, created_at)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS uq_external_id_provider_ext ON external_ids (provider, external_id, entity_type)""")

    op.execute("""CREATE TABLE IF NOT EXISTS external_ratings (
  id VARCHAR(16) NOT NULL,
  media_item_id VARCHAR(16),
  episode_id VARCHAR(16),
  provider VARCHAR(20) NOT NULL,
  score DOUBLE PRECISION NOT NULL,
  max_score DOUBLE PRECISION NOT NULL,
  vote_count INTEGER,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE INDEX IF NOT EXISTS idx_external_ratings_item ON external_ratings (media_item_id)""")

    op.execute("""CREATE INDEX IF NOT EXISTS idx_external_ratings_provider ON external_ratings (provider)""")

    op.execute("""CREATE TABLE IF NOT EXISTS follow_requests (
  id VARCHAR(16) NOT NULL,
  requester_id VARCHAR(16) NOT NULL,
  target_id VARCHAR(16) NOT NULL,
  status VARCHAR(20) NOT NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE INDEX IF NOT EXISTS ix_follow_requests_requester ON follow_requests (requester_id)""")

    op.execute("""CREATE INDEX IF NOT EXISTS ix_follow_requests_target_status ON follow_requests (target_id, status)""")

    op.execute("""CREATE TABLE IF NOT EXISTS follows (
  follower_id VARCHAR(16) NOT NULL,
  followed_id VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (follower_id, followed_id)
)""")

    op.execute("""CREATE INDEX IF NOT EXISTS ix_follows_followed ON follows (followed_id)""")

    op.execute("""CREATE INDEX IF NOT EXISTS ix_follows_follower ON follows (follower_id)""")

    op.execute("""CREATE TABLE IF NOT EXISTS franchise_items (
  franchise_id VARCHAR(16) NOT NULL,
  media_item_id VARCHAR(16) NOT NULL,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (franchise_id, media_item_id)
)""")

    op.execute("""CREATE TABLE IF NOT EXISTS franchises (
  id VARCHAR(16) NOT NULL,
  name VARCHAR(1000) NOT NULL,
  slug VARCHAR(1000) NOT NULL,
  overview TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE TABLE IF NOT EXISTS friend_requests (
  id VARCHAR(16) NOT NULL,
  sender_id VARCHAR(16) NOT NULL,
  receiver_id VARCHAR(16) NOT NULL,
  status VARCHAR NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS friend_requests_sender_id_receiver_id_key ON friend_requests (sender_id, receiver_id)""")

    op.execute("""CREATE TABLE IF NOT EXISTS game_content_items (
  id VARCHAR(16) NOT NULL,
  media_item_id VARCHAR(16) NOT NULL,
  content_type VARCHAR(30) NOT NULL,
  url VARCHAR(2000),
  description TEXT,
  created_at TIMESTAMPTZ,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE TABLE IF NOT EXISTS game_modes (
  id VARCHAR(16) NOT NULL,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS game_modes_slug_key ON game_modes (slug)""")

    op.execute("""CREATE TABLE IF NOT EXISTS game_save_official_paths (
  id VARCHAR(16) NOT NULL,
  game_id VARCHAR(16) NOT NULL,
  platform VARCHAR(50) NOT NULL,
  path_pattern VARCHAR(2000) NOT NULL,
  is_verified BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS uq_game_platform_official_path ON game_save_official_paths (game_id, platform)""")

    op.execute("""CREATE TABLE IF NOT EXISTS game_save_path_suggestions (
  id VARCHAR(16) NOT NULL,
  game_id VARCHAR(16) NOT NULL,
  user_id VARCHAR(16) NOT NULL,
  platform VARCHAR(50) NOT NULL,
  path_pattern VARCHAR(2000) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS uq_user_game_platform_suggestion ON game_save_path_suggestions (user_id, game_id, platform)""")

    op.execute("""CREATE TABLE IF NOT EXISTS games (
  media_item_id VARCHAR(16) NOT NULL,
  release_status VARCHAR(50),
  website VARCHAR(2000),
  current_players INTEGER,
  price_json JSONB,
  recommendations INTEGER,
  review_summary VARCHAR(200),
  is_free BOOLEAN NOT NULL,
  has_multiplayer BOOLEAN NOT NULL,
  franchise_id VARCHAR(16),
  time_to_beat JSONB,
  PRIMARY KEY (media_item_id)
)""")

    op.execute("""CREATE TABLE IF NOT EXISTS genres (
  id VARCHAR(16) NOT NULL,
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(200) NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS genres_name_key ON genres (name)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS genres_slug_key ON genres (slug)""")

    op.execute("""CREATE TABLE IF NOT EXISTS involved_companies (
  id VARCHAR(16) NOT NULL,
  media_item_id VARCHAR(16) NOT NULL,
  company_id VARCHAR(16) NOT NULL,
  developer BOOLEAN NOT NULL,
  publisher BOOLEAN NOT NULL,
  porting BOOLEAN NOT NULL,
  supporting BOOLEAN NOT NULL,
  production BOOLEAN NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE INDEX IF NOT EXISTS idx_involved_companies_item ON involved_companies (media_item_id)""")

    op.execute("""CREATE INDEX IF NOT EXISTS ix_involved_companies_company_id ON involved_companies (company_id)""")

    op.execute("""CREATE INDEX IF NOT EXISTS ix_involved_companies_media_item_id ON involved_companies (media_item_id)""")

    op.execute("""CREATE TABLE IF NOT EXISTS karma_transactions (
  id VARCHAR(16) NOT NULL,
  user_id VARCHAR(16) NOT NULL,
  amount INTEGER NOT NULL,
  reason VARCHAR(50) NOT NULL,
  reference_id VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE INDEX IF NOT EXISTS ix_karma_transactions_user ON karma_transactions (user_id)""")

    op.execute("""CREATE TABLE IF NOT EXISTS keywords (
  id VARCHAR(16) NOT NULL,
  name VARCHAR(200) NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS keywords_name_key ON keywords (name)""")

    op.execute("""CREATE TABLE IF NOT EXISTS list_item_rank_history (
  id VARCHAR(16) NOT NULL,
  list_id VARCHAR(16) NOT NULL,
  media_item_id VARCHAR(16) NOT NULL,
  user_id VARCHAR(16),
  old_sort_order INTEGER NOT NULL,
  new_sort_order INTEGER NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE TABLE IF NOT EXISTS match_proposals (
  id VARCHAR(16) NOT NULL,
  source VARCHAR(50) NOT NULL,
  source_game_id VARCHAR(200) NOT NULL,
  source_title VARCHAR(1000) NOT NULL,
  developer VARCHAR(500),
  release_year INTEGER,
  poster_url VARCHAR(2000),
  otix_media_id VARCHAR(16) NOT NULL,
  otix_title VARCHAR(1000) NOT NULL,
  otix_confidence DOUBLE PRECISION NOT NULL,
  match_type VARCHAR(50) NOT NULL,
  proposed_by VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL,
  reviewed_by VARCHAR(50),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS uq_match_proposal_source_game ON match_proposals (source, source_game_id)""")

    op.execute("""CREATE TABLE IF NOT EXISTS match_skips (
  id VARCHAR(16) NOT NULL,
  provider VARCHAR(30) NOT NULL,
  external_id VARCHAR(100) NOT NULL,
  skipped_at TIMESTAMPTZ NOT NULL,
  user_id VARCHAR(16),
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE INDEX IF NOT EXISTS ix_match_skip_provider_ext ON match_skips (provider, external_id)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS uq_match_skip_provider_ext ON match_skips (provider, external_id)""")

    op.execute("""CREATE TABLE IF NOT EXISTS media_assets (
  id VARCHAR(16) NOT NULL,
  media_item_id VARCHAR(16) NOT NULL,
  asset_type VARCHAR(20) NOT NULL,
  url VARCHAR(2000) NOT NULL,
  width INTEGER,
  height INTEGER,
  lang VARCHAR(10),
  style VARCHAR(20),
  score INTEGER,
  provider VARCHAR(20),
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS media_assets_url_key ON media_assets (url)""")

    op.execute("""CREATE TABLE IF NOT EXISTS media_credits (
  id VARCHAR(16) NOT NULL,
  media_item_id VARCHAR(16) NOT NULL,
  person_id VARCHAR(16) NOT NULL,
  role VARCHAR(50) NOT NULL,
  character_name VARCHAR(500),
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE INDEX IF NOT EXISTS idx_media_credits_item ON media_credits (media_item_id)""")

    op.execute("""CREATE TABLE IF NOT EXISTS media_edit_proposals (
  id VARCHAR(16) NOT NULL,
  media_item_id VARCHAR(16) NOT NULL,
  proposer_user_id VARCHAR(16),
  approver_user_id VARCHAR(16),
  status VARCHAR(20) NOT NULL,
  changes JSONB NOT NULL,
  image_overrides JSONB,
  rejection_reason TEXT,
  original_values JSONB,
  upvote_count INTEGER NOT NULL,
  downvote_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE TABLE IF NOT EXISTS media_game_modes (
  id VARCHAR(16) NOT NULL,
  media_item_id VARCHAR(16) NOT NULL,
  game_mode_id VARCHAR(16) NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS uq_media_game_mode ON media_game_modes (media_item_id, game_mode_id)""")

    op.execute("""CREATE TABLE IF NOT EXISTS media_genres (
  media_item_id VARCHAR(16) NOT NULL,
  genre_id VARCHAR(16) NOT NULL,
  PRIMARY KEY (media_item_id, genre_id)
)""")

    op.execute("""CREATE TABLE IF NOT EXISTS media_image_overrides (
  id VARCHAR(16) NOT NULL,
  media_item_id VARCHAR(16) NOT NULL,
  image_type VARCHAR(20) NOT NULL,
  language_code VARCHAR(10) NOT NULL,
  url VARCHAR(2000) NOT NULL,
  is_active BOOLEAN NOT NULL,
  created_by_user_id VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE INDEX IF NOT EXISTS ix_image_overrides_media ON media_image_overrides (media_item_id)""")

    op.execute("""CREATE INDEX IF NOT EXISTS ix_image_overrides_media_type_lang ON media_image_overrides (media_item_id, image_type, language_code)""")

    op.execute("""CREATE TABLE IF NOT EXISTS media_item_ratings (
  user_id VARCHAR(16) NOT NULL,
  media_item_id VARCHAR(16) NOT NULL,
  score INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, media_item_id)
)""")

    op.execute("""CREATE INDEX IF NOT EXISTS ix_media_item_ratings_media ON media_item_ratings (media_item_id)""")

    op.execute("""CREATE INDEX IF NOT EXISTS ix_media_item_ratings_user ON media_item_ratings (user_id)""")

    op.execute("""CREATE TABLE IF NOT EXISTS media_items (
  id VARCHAR(16) NOT NULL,
  media_type VARCHAR(10) NOT NULL,
  title VARCHAR(1000) NOT NULL,
  overview TEXT,
  slug VARCHAR(1000) NOT NULL,
  poster_url VARCHAR(2000),
  textless_poster_url VARCHAR(2000),
  backdrop_url VARCHAR(2000),
  logo_url VARCHAR(2000),
  release_date DATE,
  popularity DOUBLE PRECISION NOT NULL,
  original_language VARCHAR(10),
  completeness_score DOUBLE PRECISION NOT NULL,
  synced_at TIMESTAMPTZ,
  next_sync_at TIMESTAMPTZ,
  search_vector TSVECTOR,
  embedding vector(1024),
  avg_rating DOUBLE PRECISION,
  rating_count INTEGER NOT NULL,
  like_count INTEGER NOT NULL,
  watchlist_count INTEGER NOT NULL,
  watched_count INTEGER NOT NULL,
  played_count INTEGER NOT NULL,
  started_count INTEGER NOT NULL,
  listened_count INTEGER NOT NULL,
  view_count INTEGER NOT NULL,
  is_adult BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  icon_url VARCHAR(2000),
  overall_rating DOUBLE PRECISION,
  overall_rating_source VARCHAR(20),
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE INDEX IF NOT EXISTS idx_media_items_search_vector ON media_items USING gin (search_vector)""")

    op.execute("""CREATE INDEX IF NOT EXISTS ix_media_items_search_vector ON media_items USING gin (search_vector)""")

    op.execute("""CREATE INDEX IF NOT EXISTS ix_media_items_title_trgm ON media_items USING gin (title gin_trgm_ops)""")

    op.execute("""CREATE TABLE IF NOT EXISTS media_keywords (
  media_item_id VARCHAR(16) NOT NULL,
  keyword_id VARCHAR(16) NOT NULL,
  PRIMARY KEY (media_item_id, keyword_id)
)""")

    op.execute("""CREATE TABLE IF NOT EXISTS media_list_collaborators (
  id VARCHAR(16) NOT NULL,
  list_id VARCHAR(16) NOT NULL,
  user_id VARCHAR(16) NOT NULL,
  permission VARCHAR(10) NOT NULL,
  status VARCHAR(10) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS uq_list_collaborator ON media_list_collaborators (list_id, user_id)""")

    op.execute("""CREATE TABLE IF NOT EXISTS media_list_likes (
  id VARCHAR(16) NOT NULL,
  list_id VARCHAR(16) NOT NULL,
  user_id VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS uq_list_like ON media_list_likes (list_id, user_id)""")

    op.execute("""CREATE TABLE IF NOT EXISTS media_platforms (
  id VARCHAR(16) NOT NULL,
  media_item_id VARCHAR(16) NOT NULL,
  platform_id VARCHAR(16) NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS uq_media_platform ON media_platforms (media_item_id, platform_id)""")

    op.execute("""CREATE TABLE IF NOT EXISTS media_releases (
  id VARCHAR(16) NOT NULL,
  media_item_id VARCHAR(16) NOT NULL,
  country_code VARCHAR(2) NOT NULL,
  release_date DATE,
  certification VARCHAR(20),
  release_type VARCHAR(20),
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE INDEX IF NOT EXISTS idx_media_releases_item ON media_releases (media_item_id)""")

    op.execute("""CREATE TABLE IF NOT EXISTS media_videos (
  id VARCHAR(16) NOT NULL,
  media_item_id VARCHAR(16) NOT NULL,
  video_type VARCHAR(50),
  url VARCHAR(2000) NOT NULL,
  provider VARCHAR(20),
  provider_id VARCHAR(100),
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE TABLE IF NOT EXISTS media_watch_providers (
  id VARCHAR(16) NOT NULL,
  media_item_id VARCHAR(16) NOT NULL,
  watch_provider_id VARCHAR(16) NOT NULL,
  country_code VARCHAR(2) NOT NULL,
  offering_type VARCHAR(20) NOT NULL,
  url VARCHAR(2000),
  display_priority INTEGER NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS uq_media_watch_provider ON media_watch_providers (media_item_id, watch_provider_id, country_code, offering_type)""")

    op.execute("""CREATE TABLE IF NOT EXISTS movies (
  media_item_id VARCHAR(16) NOT NULL,
  runtime INTEGER,
  budget BIGINT,
  revenue BIGINT,
  tagline VARCHAR(1000),
  is_anime BOOLEAN NOT NULL,
  collection_id VARCHAR(16),
  PRIMARY KEY (media_item_id)
)""")

    op.execute("""CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(16) NOT NULL,
  user_id VARCHAR(16) NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT,
  metadata_json JSON NOT NULL,
  is_read BOOLEAN NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE INDEX IF NOT EXISTS ix_notifications_user_created ON notifications (user_id, created_at)""")

    op.execute("""CREATE INDEX IF NOT EXISTS ix_notifications_user_unread ON notifications (user_id, is_read)""")

    op.execute("""CREATE TABLE IF NOT EXISTS people (
  id VARCHAR(16) NOT NULL,
  name VARCHAR(500) NOT NULL,
  youtube_channel_title VARCHAR(500),
  spotify_follower_count INTEGER,
  spotify_popularity INTEGER,
  spotify_genres JSONB,
  spotify_image_url VARCHAR(2000),
  photo_url VARCHAR(2000),
  logo_url VARCHAR(2000),
  biography TEXT,
  birthday DATE,
  deathday DATE,
  place_of_birth VARCHAR(500),
  synced_at TIMESTAMPTZ,
  next_sync_at TIMESTAMPTZ,
  spotify_related_crawled_at TIMESTAMPTZ,
  content_hash VARCHAR(64),
  hash_match_count INTEGER NOT NULL,
  embedding vector(1024),
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE INDEX IF NOT EXISTS ix_people_embedding_hnsw ON people USING hnsw (embedding vector_cosine_ops)""")

    op.execute("""CREATE TABLE IF NOT EXISTS person_assets (
  id VARCHAR(16) NOT NULL,
  person_id VARCHAR(16) NOT NULL,
  url VARCHAR(2000) NOT NULL,
  width INTEGER,
  height INTEGER,
  provider VARCHAR(20),
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS person_assets_url_key ON person_assets (url)""")

    op.execute("""CREATE TABLE IF NOT EXISTS person_ratings (
  user_id VARCHAR(16) NOT NULL,
  person_id VARCHAR(16) NOT NULL,
  score INTEGER NOT NULL,
  PRIMARY KEY (user_id, person_id)
)""")

    op.execute("""CREATE TABLE IF NOT EXISTS platforms (
  id VARCHAR(16) NOT NULL,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  logo_image_id VARCHAR(100),
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS platforms_slug_key ON platforms (slug)""")

    op.execute("""CREATE TABLE IF NOT EXISTS proposal_votes (
  user_id VARCHAR(16) NOT NULL,
  proposal_id VARCHAR(16) NOT NULL,
  vote_type VARCHAR NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, proposal_id)
)""")

    op.execute("""CREATE TABLE IF NOT EXISTS proposals (
  id VARCHAR(16) NOT NULL,
  proposal_type VARCHAR(50) NOT NULL,
  target_type VARCHAR(50) NOT NULL,
  target_id VARCHAR(16) NOT NULL,
  proposer_id VARCHAR(16),
  reviewer_id VARCHAR(16),
  status VARCHAR(20) NOT NULL,
  payload JSONB NOT NULL,
  rejection_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  upvote_count INTEGER NOT NULL,
  downvote_count INTEGER NOT NULL,
  snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE INDEX IF NOT EXISTS ix_proposals_target ON proposals (target_type, target_id)""")

    op.execute("""CREATE INDEX IF NOT EXISTS ix_proposals_type_status ON proposals (proposal_type, status)""")

    op.execute("""CREATE TABLE IF NOT EXISTS provider_state (
  provider VARCHAR(20) NOT NULL,
  last_sync_at TIMESTAMPTZ,
  cursor_value VARCHAR(500),
  rate_limit_remaining INTEGER,
  rate_limit_reset TIMESTAMPTZ,
  PRIMARY KEY (provider)
)""")

    op.execute("""CREATE TABLE IF NOT EXISTS push_subscriptions (
  id VARCHAR(16) NOT NULL,
  user_id VARCHAR(16) NOT NULL,
  endpoint VARCHAR(512) NOT NULL,
  p256dh_key VARCHAR(128) NOT NULL,
  auth_key VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE TABLE IF NOT EXISTS refresh_tokens (
  id VARCHAR(16) NOT NULL,
  user_id VARCHAR(16) NOT NULL,
  jti VARCHAR(36) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS refresh_tokens_jti_key ON refresh_tokens (jti)""")

    op.execute("""CREATE TABLE IF NOT EXISTS review_votes (
  user_id VARCHAR(16) NOT NULL,
  review_user_id VARCHAR(16) NOT NULL,
  review_media_item_id VARCHAR(16) NOT NULL,
  vote_type VARCHAR NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, review_user_id, review_media_item_id)
)""")

    op.execute("""CREATE TABLE IF NOT EXISTS reviews (
  user_id VARCHAR(16) NOT NULL,
  media_item_id VARCHAR(16) NOT NULL,
  title VARCHAR(200),
  content TEXT,
  is_spoiler BOOLEAN NOT NULL,
  is_private BOOLEAN NOT NULL,
  cooldown_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, media_item_id)
)""")

    op.execute("""CREATE TABLE IF NOT EXISTS search_logs (
  id VARCHAR(16) NOT NULL,
  query VARCHAR(500) NOT NULL,
  media_type VARCHAR(10),
  sort_by VARCHAR(20),
  page INTEGER NOT NULL,
  page_size INTEGER NOT NULL,
  result_count INTEGER,
  items_returned INTEGER NOT NULL,
  tracks_returned INTEGER NOT NULL,
  backfill_triggered BOOLEAN NOT NULL,
  cache_hit BOOLEAN NOT NULL,
  query_embedding_available BOOLEAN,
  user_id VARCHAR(16),
  is_bot BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE INDEX IF NOT EXISTS ix_search_logs_user_id ON search_logs (user_id)""")

    op.execute("""CREATE TABLE IF NOT EXISTS seasons (
  id VARCHAR(16) NOT NULL,
  show_id VARCHAR(16) NOT NULL,
  season_number INTEGER NOT NULL,
  name VARCHAR(1000),
  overview TEXT,
  poster_url VARCHAR(2000),
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE TABLE IF NOT EXISTS shows (
  media_item_id VARCHAR(16) NOT NULL,
  status VARCHAR(50),
  first_air_date DATE,
  last_air_date DATE,
  is_anime BOOLEAN NOT NULL,
  number_of_seasons INTEGER,
  number_of_episodes INTEGER,
  PRIMARY KEY (media_item_id)
)""")

    op.execute("""CREATE TABLE IF NOT EXISTS spotify_playlist_subscriptions (
  id VARCHAR(16) NOT NULL,
  user_id VARCHAR(16) NOT NULL,
  playlist_id VARCHAR(255) NOT NULL,
  playlist_name VARCHAR(512),
  playlist_owner VARCHAR(255),
  playlist_snapshot VARCHAR(255),
  auto_sync BOOLEAN NOT NULL,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE INDEX IF NOT EXISTS ix_spotify_playlist_sub_user ON spotify_playlist_subscriptions (user_id)""")

    op.execute("""CREATE TABLE IF NOT EXISTS sync_jobs (
  id VARCHAR(16) NOT NULL,
  provider VARCHAR(20) NOT NULL,
  entity_type VARCHAR(20) NOT NULL,
  external_id VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL,
  priority INTEGER NOT NULL,
  phase VARCHAR(20) NOT NULL,
  parent_id VARCHAR(16),
  error_message TEXT,
  retry_count INTEGER NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE TABLE IF NOT EXISTS tmdb_deleted_ids (
  id VARCHAR(16) NOT NULL,
  tmdb_id INTEGER NOT NULL,
  media_type VARCHAR(10) NOT NULL,
  media_item_id VARCHAR(16),
  title VARCHAR(1000),
  detection_date TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS uq_tmdb_deleted_id ON tmdb_deleted_ids (tmdb_id, media_type)""")

    op.execute("""CREATE TABLE IF NOT EXISTS track_ratings (
  user_id VARCHAR(16) NOT NULL,
  track_id VARCHAR(16) NOT NULL,
  score INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, track_id)
)""")

    op.execute("""CREATE TABLE IF NOT EXISTS tracks (
  id VARCHAR(16) NOT NULL,
  album_id VARCHAR(16) NOT NULL,
  track_number INTEGER NOT NULL,
  disc_number INTEGER NOT NULL,
  title VARCHAR(500) NOT NULL,
  duration_ms INTEGER,
  preview_url VARCHAR(500),
  audio_features JSONB,
  lyrics TEXT,
  avg_rating DOUBLE PRECISION,
  rating_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE TABLE IF NOT EXISTS user_badges (
  id VARCHAR(16) NOT NULL,
  user_id VARCHAR(16) NOT NULL,
  badge_key VARCHAR NOT NULL,
  claimed BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE INDEX IF NOT EXISTS ix_user_badges_user ON user_badges (user_id)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS uq_user_badge ON user_badges (user_id, badge_key)""")

    op.execute("""CREATE TABLE IF NOT EXISTS user_company_follows (
  user_id VARCHAR(16) NOT NULL,
  company_id VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, company_id)
)""")

    op.execute("""CREATE TABLE IF NOT EXISTS user_episode_interactions (
  user_id VARCHAR(16) NOT NULL,
  episode_id VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, episode_id)
)""")

    op.execute("""CREATE TABLE IF NOT EXISTS user_list (
  id VARCHAR(16) NOT NULL,
  user_id VARCHAR(16) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  is_public BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE TABLE IF NOT EXISTS user_list_item (
  id VARCHAR(16) NOT NULL,
  list_id VARCHAR(16) NOT NULL,
  media_item_id VARCHAR(16) NOT NULL,
  sort_order INTEGER NOT NULL,
  added_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS user_list_item_list_id_media_item_id_key ON user_list_item (list_id, media_item_id)""")

    op.execute("""CREATE TABLE IF NOT EXISTS user_local_games (
  id VARCHAR(16) NOT NULL,
  user_id VARCHAR(16) NOT NULL,
  title VARCHAR(1000) NOT NULL,
  platform VARCHAR(50) NOT NULL,
  media_item_id VARCHAR(16),
  match_suggestion_media_id VARCHAR(16),
  last_seen_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS uq_user_local_game ON user_local_games (user_id, title, platform)""")

    op.execute("""CREATE TABLE IF NOT EXISTS user_media_interactions (
  user_id VARCHAR(16) NOT NULL,
  media_item_id VARCHAR(16) NOT NULL,
  interaction_type VARCHAR(20) NOT NULL,
  metadata JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, media_item_id, interaction_type)
)""")

    op.execute("""CREATE TABLE IF NOT EXISTS user_mood_checkins (
  id VARCHAR(16) NOT NULL,
  user_id VARCHAR(16) NOT NULL,
  checkin_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL,
  mood VARCHAR(20),
  feeling VARCHAR(32),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE INDEX IF NOT EXISTS ix_user_mood_checkins_user_date ON user_mood_checkins (user_id, checkin_date)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS uq_user_mood_checkins_user_date ON user_mood_checkins (user_id, checkin_date)""")

    op.execute("""CREATE TABLE IF NOT EXISTS user_person_follows (
  user_id VARCHAR(16) NOT NULL,
  person_id VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, person_id)
)""")

    op.execute("""CREATE TABLE IF NOT EXISTS user_plex_items (
  id VARCHAR(16) NOT NULL,
  user_id VARCHAR(16) NOT NULL,
  server_id VARCHAR(16) NOT NULL,
  library_id VARCHAR(16),
  media_item_id VARCHAR(16),
  rating_key VARCHAR(128) NOT NULL,
  guid VARCHAR(512),
  media_type VARCHAR(20) NOT NULL,
  title VARCHAR(1000) NOT NULL,
  year INTEGER,
  thumb_url VARCHAR(2048),
  viewed BOOLEAN NOT NULL,
  view_count INTEGER NOT NULL,
  view_offset INTEGER,
  duration INTEGER,
  last_viewed_at TIMESTAMPTZ,
  guids JSONB,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS uq_user_plex_item ON user_plex_items (server_id, rating_key)""")

    op.execute("""CREATE TABLE IF NOT EXISTS user_plex_libraries (
  id VARCHAR(16) NOT NULL,
  user_id VARCHAR(16) NOT NULL,
  server_id VARCHAR(16) NOT NULL,
  section_key VARCHAR(64) NOT NULL,
  title VARCHAR(500) NOT NULL,
  library_type VARCHAR(20) NOT NULL,
  selected BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS uq_user_plex_library ON user_plex_libraries (server_id, section_key)""")

    op.execute("""CREATE TABLE IF NOT EXISTS user_plex_servers (
  id VARCHAR(16) NOT NULL,
  user_id VARCHAR(16) NOT NULL,
  machine_identifier VARCHAR(128) NOT NULL,
  name VARCHAR(500) NOT NULL,
  product VARCHAR(100),
  platform VARCHAR(100),
  base_url VARCHAR(2048),
  fallback_url VARCHAR(2048),
  access_token TEXT,
  owned BOOLEAN NOT NULL,
  selected BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS uq_user_plex_server ON user_plex_servers (user_id, machine_identifier)""")

    op.execute("""CREATE TABLE IF NOT EXISTS user_ratings (
  rater_id VARCHAR(16) NOT NULL,
  rated_user_id VARCHAR(16) NOT NULL,
  score INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (rater_id, rated_user_id)
)""")

    op.execute("""CREATE TABLE IF NOT EXISTS user_sessions (
  id VARCHAR(16) NOT NULL,
  user_id VARCHAR(16) NOT NULL,
  session_key VARCHAR(36) NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoked_reason VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE INDEX IF NOT EXISTS ix_user_sessions_user_active ON user_sessions (user_id, revoked_at)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS user_sessions_session_key_key ON user_sessions (session_key)""")

    op.execute("""CREATE TABLE IF NOT EXISTS user_steam_games (
  id VARCHAR(16) NOT NULL,
  user_id VARCHAR(16) NOT NULL,
  media_item_id VARCHAR(16),
  steam_app_id INTEGER NOT NULL,
  name VARCHAR(500) NOT NULL,
  playtime_forever INTEGER NOT NULL,
  playtime_2weeks INTEGER NOT NULL,
  img_icon_url VARCHAR(256),
  img_logo_url VARCHAR(256),
  rtime_last_played INTEGER,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS uq_user_steam_game ON user_steam_games (user_id, steam_app_id)""")

    op.execute("""CREATE TABLE IF NOT EXISTS user_steam_wishlist (
  id VARCHAR(16) NOT NULL,
  user_id VARCHAR(16) NOT NULL,
  media_item_id VARCHAR(16),
  steam_app_id INTEGER NOT NULL,
  name VARCHAR(500) NOT NULL,
  priority INTEGER NOT NULL,
  added_date INTEGER,
  is_free BOOLEAN NOT NULL,
  img_icon_url VARCHAR(256),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS uq_user_steam_wishlist ON user_steam_wishlist (user_id, steam_app_id)""")

    op.execute("""CREATE TABLE IF NOT EXISTS user_streaks (
  user_id VARCHAR(16) NOT NULL,
  current_login_streak INTEGER NOT NULL,
  longest_login_streak INTEGER NOT NULL,
  current_review_streak INTEGER NOT NULL,
  longest_review_streak INTEGER NOT NULL,
  current_workout_streak INTEGER NOT NULL,
  longest_workout_streak INTEGER NOT NULL,
  last_activity_date DATE,
  last_review_week DATE,
  last_workout_date DATE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id)
)""")

    op.execute("""CREATE TABLE IF NOT EXISTS user_youtube_liked_videos (
  id INTEGER NOT NULL,
  user_id VARCHAR(16) NOT NULL,
  video_id VARCHAR(50) NOT NULL,
  title TEXT NOT NULL,
  channel_id VARCHAR(50) NOT NULL,
  channel_title TEXT NOT NULL,
  description TEXT NOT NULL,
  thumbnail_url TEXT,
  published_at VARCHAR(50) NOT NULL,
  matched_media_item_id VARCHAR(16),
  matched_title TEXT,
  matched_artist TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE INDEX IF NOT EXISTS ix_user_youtube_liked_videos_user_id ON user_youtube_liked_videos (user_id)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS uq_user_youtube_video ON user_youtube_liked_videos (user_id, video_id)""")

    op.execute("""CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(16) NOT NULL,
  email VARCHAR(320) NOT NULL,
  username VARCHAR(150) NOT NULL,
  hashed_password VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL,
  is_admin BOOLEAN NOT NULL,
  is_verified BOOLEAN NOT NULL,
  two_factor_enabled BOOLEAN NOT NULL,
  two_factor_secret VARCHAR(32),
  last_login_at TIMESTAMPTZ,
  global_logout_marker TIMESTAMPTZ,
  avatar_url VARCHAR(2048),
  bio TEXT,
  background_url VARCHAR(2048),
  steam_id VARCHAR(17),
  plex_id VARCHAR(64),
  plex_username VARCHAR(150),
  plex_email VARCHAR(320),
  plex_thumb VARCHAR(2048),
  plex_auth_token TEXT,
  plex_watch_history_enabled BOOLEAN NOT NULL,
  tmdb_session_id VARCHAR(64),
  tmdb_account_id BIGINT,
  tmdb_username VARCHAR(150),
  tmdb_avatar_hash VARCHAR(64),
  tmdb_rating_sync_direction VARCHAR(16) NOT NULL,
  tmdb_rating_last_synced_at TIMESTAMPTZ,
  spotify_id VARCHAR(64),
  spotify_username VARCHAR(150),
  spotify_email VARCHAR(320),
  spotify_avatar_url VARCHAR(2048),
  spotify_access_token TEXT,
  spotify_refresh_token TEXT,
  spotify_token_expires_at TIMESTAMPTZ,
  google_id VARCHAR(64),
  google_email VARCHAR(320),
  google_name VARCHAR(150),
  google_avatar_url VARCHAR(2048),
  google_access_token TEXT,
  google_refresh_token TEXT,
  google_token_expires_at TIMESTAMPTZ,
  integration_visibility JSON NOT NULL,
  total_xp BIGINT NOT NULL,
  daily_mood_checkins_enabled BOOLEAN NOT NULL,
  avg_user_rating DOUBLE PRECISION,
  user_rating_count INTEGER NOT NULL,
  profile_sections JSON NOT NULL,
  profile_card_sections JSON NOT NULL,
  hall_of_fame_media_ids JSON NOT NULL,
  onboarding_completed BOOLEAN NOT NULL,
  preferred_media_types JSONB NOT NULL,
  preferred_genres JSONB NOT NULL,
  preferred_languages JSONB NOT NULL,
  discover_emphases JSON NOT NULL,
  date_of_birth DATE,
  show_adult_content BOOLEAN NOT NULL,
  country VARCHAR(100),
  is_private BOOLEAN NOT NULL,
  is_bot BOOLEAN NOT NULL,
  notification_preferences JSON NOT NULL,
  karma BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  embedding vector(1024),
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE INDEX IF NOT EXISTS ix_users_embedding_hnsw ON users USING hnsw (embedding vector_cosine_ops)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (email)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_key ON users (google_id)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS users_plex_id_key ON users (plex_id)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS users_spotify_id_key ON users (spotify_id)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS users_steam_id_key ON users (steam_id)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS users_tmdb_account_id_key ON users (tmdb_account_id)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS users_tmdb_session_id_key ON users (tmdb_session_id)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON users (username)""")

    op.execute("""CREATE TABLE IF NOT EXISTS watch_providers (
  id VARCHAR(16) NOT NULL,
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(200) NOT NULL,
  logo_url VARCHAR(2000),
  display_priority INTEGER NOT NULL,
  PRIMARY KEY (id)
)""")

    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS uq_watch_provider_slug ON watch_providers (slug)""")

    op.execute("""CREATE TABLE IF NOT EXISTS workout_exercises (
  workout_id VARCHAR(16) NOT NULL,
  exercise_id VARCHAR(16) NOT NULL,
  sort_order INTEGER NOT NULL,
  sets JSONB NOT NULL,
  PRIMARY KEY (workout_id, exercise_id, sort_order)
)""")

    op.execute("""CREATE TABLE IF NOT EXISTS workouts (
  id VARCHAR(16) NOT NULL,
  user_id VARCHAR(16) NOT NULL,
  raw_input TEXT,
  notes TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id)
)""")

    # -- HNSW index on media_items.embedding --
    op.execute("""CREATE INDEX IF NOT EXISTS ix_media_items_embedding_hnsw
ON media_items USING hnsw (embedding vector_cosine_ops)""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'albums_media_item_id_fkey') THEN
        ALTER TABLE albums ADD CONSTRAINT albums_media_item_id_fkey
          FOREIGN KEY (media_item_id) REFERENCES media_items (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auth_action_tokens_user_id_fkey') THEN
        ALTER TABLE auth_action_tokens ADD CONSTRAINT auth_action_tokens_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blueprint_likes_blueprint_id_fkey') THEN
        ALTER TABLE blueprint_likes ADD CONSTRAINT blueprint_likes_blueprint_id_fkey
          FOREIGN KEY (blueprint_id) REFERENCES blueprints (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blueprint_likes_user_id_fkey') THEN
        ALTER TABLE blueprint_likes ADD CONSTRAINT blueprint_likes_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blueprints_user_id_fkey') THEN
        ALTER TABLE blueprints ADD CONSTRAINT blueprints_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'collection_items_collection_id_fkey') THEN
        ALTER TABLE collection_items ADD CONSTRAINT collection_items_collection_id_fkey
          FOREIGN KEY (collection_id) REFERENCES collections (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'collection_items_media_item_id_fkey') THEN
        ALTER TABLE collection_items ADD CONSTRAINT collection_items_media_item_id_fkey
          FOREIGN KEY (media_item_id) REFERENCES media_items (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'collections_franchise_id_fkey') THEN
        ALTER TABLE collections ADD CONSTRAINT collections_franchise_id_fkey
          FOREIGN KEY (franchise_id) REFERENCES franchises (id) ON DELETE SET NULL;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_ratings_company_id_fkey') THEN
        ALTER TABLE company_ratings ADD CONSTRAINT company_ratings_company_id_fkey
          FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_ratings_user_id_fkey') THEN
        ALTER TABLE company_ratings ADD CONSTRAINT company_ratings_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'episodes_season_id_fkey') THEN
        ALTER TABLE episodes ADD CONSTRAINT episodes_season_id_fkey
          FOREIGN KEY (season_id) REFERENCES seasons (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'external_ids_media_item_id_fkey') THEN
        ALTER TABLE external_ids ADD CONSTRAINT external_ids_media_item_id_fkey
          FOREIGN KEY (media_item_id) REFERENCES media_items (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'external_ratings_episode_id_fkey') THEN
        ALTER TABLE external_ratings ADD CONSTRAINT external_ratings_episode_id_fkey
          FOREIGN KEY (episode_id) REFERENCES episodes (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'external_ratings_media_item_id_fkey') THEN
        ALTER TABLE external_ratings ADD CONSTRAINT external_ratings_media_item_id_fkey
          FOREIGN KEY (media_item_id) REFERENCES media_items (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'follow_requests_requester_id_fkey') THEN
        ALTER TABLE follow_requests ADD CONSTRAINT follow_requests_requester_id_fkey
          FOREIGN KEY (requester_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'follow_requests_target_id_fkey') THEN
        ALTER TABLE follow_requests ADD CONSTRAINT follow_requests_target_id_fkey
          FOREIGN KEY (target_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'follows_followed_id_fkey') THEN
        ALTER TABLE follows ADD CONSTRAINT follows_followed_id_fkey
          FOREIGN KEY (followed_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'follows_follower_id_fkey') THEN
        ALTER TABLE follows ADD CONSTRAINT follows_follower_id_fkey
          FOREIGN KEY (follower_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'franchise_items_franchise_id_fkey') THEN
        ALTER TABLE franchise_items ADD CONSTRAINT franchise_items_franchise_id_fkey
          FOREIGN KEY (franchise_id) REFERENCES franchises (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'franchise_items_media_item_id_fkey') THEN
        ALTER TABLE franchise_items ADD CONSTRAINT franchise_items_media_item_id_fkey
          FOREIGN KEY (media_item_id) REFERENCES media_items (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'friend_requests_receiver_id_fkey') THEN
        ALTER TABLE friend_requests ADD CONSTRAINT friend_requests_receiver_id_fkey
          FOREIGN KEY (receiver_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'friend_requests_sender_id_fkey') THEN
        ALTER TABLE friend_requests ADD CONSTRAINT friend_requests_sender_id_fkey
          FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_content_items_media_item_id_fkey') THEN
        ALTER TABLE game_content_items ADD CONSTRAINT game_content_items_media_item_id_fkey
          FOREIGN KEY (media_item_id) REFERENCES media_items (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_save_official_paths_game_id_fkey') THEN
        ALTER TABLE game_save_official_paths ADD CONSTRAINT game_save_official_paths_game_id_fkey
          FOREIGN KEY (game_id) REFERENCES media_items (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_save_path_suggestions_game_id_fkey') THEN
        ALTER TABLE game_save_path_suggestions ADD CONSTRAINT game_save_path_suggestions_game_id_fkey
          FOREIGN KEY (game_id) REFERENCES media_items (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_save_path_suggestions_user_id_fkey') THEN
        ALTER TABLE game_save_path_suggestions ADD CONSTRAINT game_save_path_suggestions_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'games_franchise_id_fkey') THEN
        ALTER TABLE games ADD CONSTRAINT games_franchise_id_fkey
          FOREIGN KEY (franchise_id) REFERENCES franchises (id) ON DELETE SET NULL;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'games_media_item_id_fkey') THEN
        ALTER TABLE games ADD CONSTRAINT games_media_item_id_fkey
          FOREIGN KEY (media_item_id) REFERENCES media_items (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'involved_companies_company_id_fkey') THEN
        ALTER TABLE involved_companies ADD CONSTRAINT involved_companies_company_id_fkey
          FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'involved_companies_media_item_id_fkey') THEN
        ALTER TABLE involved_companies ADD CONSTRAINT involved_companies_media_item_id_fkey
          FOREIGN KEY (media_item_id) REFERENCES media_items (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'karma_transactions_user_id_fkey') THEN
        ALTER TABLE karma_transactions ADD CONSTRAINT karma_transactions_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'list_item_rank_history_list_id_fkey') THEN
        ALTER TABLE list_item_rank_history ADD CONSTRAINT list_item_rank_history_list_id_fkey
          FOREIGN KEY (list_id) REFERENCES user_list (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'list_item_rank_history_media_item_id_fkey') THEN
        ALTER TABLE list_item_rank_history ADD CONSTRAINT list_item_rank_history_media_item_id_fkey
          FOREIGN KEY (media_item_id) REFERENCES media_items (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'list_item_rank_history_user_id_fkey') THEN
        ALTER TABLE list_item_rank_history ADD CONSTRAINT list_item_rank_history_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'match_skips_user_id_fkey') THEN
        ALTER TABLE match_skips ADD CONSTRAINT match_skips_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_assets_media_item_id_fkey') THEN
        ALTER TABLE media_assets ADD CONSTRAINT media_assets_media_item_id_fkey
          FOREIGN KEY (media_item_id) REFERENCES media_items (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_credits_media_item_id_fkey') THEN
        ALTER TABLE media_credits ADD CONSTRAINT media_credits_media_item_id_fkey
          FOREIGN KEY (media_item_id) REFERENCES media_items (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_credits_person_id_fkey') THEN
        ALTER TABLE media_credits ADD CONSTRAINT media_credits_person_id_fkey
          FOREIGN KEY (person_id) REFERENCES people (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_edit_proposals_approver_user_id_fkey') THEN
        ALTER TABLE media_edit_proposals ADD CONSTRAINT media_edit_proposals_approver_user_id_fkey
          FOREIGN KEY (approver_user_id) REFERENCES users (id) ON DELETE SET NULL;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_edit_proposals_media_item_id_fkey') THEN
        ALTER TABLE media_edit_proposals ADD CONSTRAINT media_edit_proposals_media_item_id_fkey
          FOREIGN KEY (media_item_id) REFERENCES media_items (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_edit_proposals_proposer_user_id_fkey') THEN
        ALTER TABLE media_edit_proposals ADD CONSTRAINT media_edit_proposals_proposer_user_id_fkey
          FOREIGN KEY (proposer_user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_game_modes_game_mode_id_fkey') THEN
        ALTER TABLE media_game_modes ADD CONSTRAINT media_game_modes_game_mode_id_fkey
          FOREIGN KEY (game_mode_id) REFERENCES game_modes (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_game_modes_media_item_id_fkey') THEN
        ALTER TABLE media_game_modes ADD CONSTRAINT media_game_modes_media_item_id_fkey
          FOREIGN KEY (media_item_id) REFERENCES media_items (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_genres_genre_id_fkey') THEN
        ALTER TABLE media_genres ADD CONSTRAINT media_genres_genre_id_fkey
          FOREIGN KEY (genre_id) REFERENCES genres (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_genres_media_item_id_fkey') THEN
        ALTER TABLE media_genres ADD CONSTRAINT media_genres_media_item_id_fkey
          FOREIGN KEY (media_item_id) REFERENCES media_items (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_image_overrides_created_by_user_id_fkey') THEN
        ALTER TABLE media_image_overrides ADD CONSTRAINT media_image_overrides_created_by_user_id_fkey
          FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_image_overrides_media_item_id_fkey') THEN
        ALTER TABLE media_image_overrides ADD CONSTRAINT media_image_overrides_media_item_id_fkey
          FOREIGN KEY (media_item_id) REFERENCES media_items (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_item_ratings_media_item_id_fkey') THEN
        ALTER TABLE media_item_ratings ADD CONSTRAINT media_item_ratings_media_item_id_fkey
          FOREIGN KEY (media_item_id) REFERENCES media_items (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_item_ratings_user_id_fkey') THEN
        ALTER TABLE media_item_ratings ADD CONSTRAINT media_item_ratings_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_keywords_keyword_id_fkey') THEN
        ALTER TABLE media_keywords ADD CONSTRAINT media_keywords_keyword_id_fkey
          FOREIGN KEY (keyword_id) REFERENCES keywords (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_keywords_media_item_id_fkey') THEN
        ALTER TABLE media_keywords ADD CONSTRAINT media_keywords_media_item_id_fkey
          FOREIGN KEY (media_item_id) REFERENCES media_items (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_list_collaborators_list_id_fkey') THEN
        ALTER TABLE media_list_collaborators ADD CONSTRAINT media_list_collaborators_list_id_fkey
          FOREIGN KEY (list_id) REFERENCES user_list (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_list_collaborators_user_id_fkey') THEN
        ALTER TABLE media_list_collaborators ADD CONSTRAINT media_list_collaborators_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_list_likes_list_id_fkey') THEN
        ALTER TABLE media_list_likes ADD CONSTRAINT media_list_likes_list_id_fkey
          FOREIGN KEY (list_id) REFERENCES user_list (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_list_likes_user_id_fkey') THEN
        ALTER TABLE media_list_likes ADD CONSTRAINT media_list_likes_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_platforms_media_item_id_fkey') THEN
        ALTER TABLE media_platforms ADD CONSTRAINT media_platforms_media_item_id_fkey
          FOREIGN KEY (media_item_id) REFERENCES media_items (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_platforms_platform_id_fkey') THEN
        ALTER TABLE media_platforms ADD CONSTRAINT media_platforms_platform_id_fkey
          FOREIGN KEY (platform_id) REFERENCES platforms (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_releases_media_item_id_fkey') THEN
        ALTER TABLE media_releases ADD CONSTRAINT media_releases_media_item_id_fkey
          FOREIGN KEY (media_item_id) REFERENCES media_items (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_videos_media_item_id_fkey') THEN
        ALTER TABLE media_videos ADD CONSTRAINT media_videos_media_item_id_fkey
          FOREIGN KEY (media_item_id) REFERENCES media_items (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_watch_providers_media_item_id_fkey') THEN
        ALTER TABLE media_watch_providers ADD CONSTRAINT media_watch_providers_media_item_id_fkey
          FOREIGN KEY (media_item_id) REFERENCES media_items (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_watch_providers_watch_provider_id_fkey') THEN
        ALTER TABLE media_watch_providers ADD CONSTRAINT media_watch_providers_watch_provider_id_fkey
          FOREIGN KEY (watch_provider_id) REFERENCES watch_providers (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'movies_collection_id_fkey') THEN
        ALTER TABLE movies ADD CONSTRAINT movies_collection_id_fkey
          FOREIGN KEY (collection_id) REFERENCES collections (id);
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'movies_media_item_id_fkey') THEN
        ALTER TABLE movies ADD CONSTRAINT movies_media_item_id_fkey
          FOREIGN KEY (media_item_id) REFERENCES media_items (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_user_id_fkey') THEN
        ALTER TABLE notifications ADD CONSTRAINT notifications_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'person_assets_person_id_fkey') THEN
        ALTER TABLE person_assets ADD CONSTRAINT person_assets_person_id_fkey
          FOREIGN KEY (person_id) REFERENCES people (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'person_ratings_person_id_fkey') THEN
        ALTER TABLE person_ratings ADD CONSTRAINT person_ratings_person_id_fkey
          FOREIGN KEY (person_id) REFERENCES people (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'person_ratings_user_id_fkey') THEN
        ALTER TABLE person_ratings ADD CONSTRAINT person_ratings_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proposal_votes_proposal_id_fkey') THEN
        ALTER TABLE proposal_votes ADD CONSTRAINT proposal_votes_proposal_id_fkey
          FOREIGN KEY (proposal_id) REFERENCES proposals (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proposal_votes_user_id_fkey') THEN
        ALTER TABLE proposal_votes ADD CONSTRAINT proposal_votes_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proposals_proposer_id_fkey') THEN
        ALTER TABLE proposals ADD CONSTRAINT proposals_proposer_id_fkey
          FOREIGN KEY (proposer_id) REFERENCES users (id) ON DELETE SET NULL;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proposals_reviewer_id_fkey') THEN
        ALTER TABLE proposals ADD CONSTRAINT proposals_reviewer_id_fkey
          FOREIGN KEY (reviewer_id) REFERENCES users (id) ON DELETE SET NULL;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_user_id_fkey') THEN
        ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refresh_tokens_user_id_fkey') THEN
        ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_tokens_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'review_votes_user_id_fkey') THEN
        ALTER TABLE review_votes ADD CONSTRAINT review_votes_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_media_item_id_fkey') THEN
        ALTER TABLE reviews ADD CONSTRAINT reviews_media_item_id_fkey
          FOREIGN KEY (media_item_id) REFERENCES media_items (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_user_id_fkey') THEN
        ALTER TABLE reviews ADD CONSTRAINT reviews_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'search_logs_user_id_fkey') THEN
        ALTER TABLE search_logs ADD CONSTRAINT search_logs_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seasons_show_id_fkey') THEN
        ALTER TABLE seasons ADD CONSTRAINT seasons_show_id_fkey
          FOREIGN KEY (show_id) REFERENCES shows (media_item_id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shows_media_item_id_fkey') THEN
        ALTER TABLE shows ADD CONSTRAINT shows_media_item_id_fkey
          FOREIGN KEY (media_item_id) REFERENCES media_items (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'spotify_playlist_subscriptions_user_id_fkey') THEN
        ALTER TABLE spotify_playlist_subscriptions ADD CONSTRAINT spotify_playlist_subscriptions_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sync_jobs_parent_id_fkey') THEN
        ALTER TABLE sync_jobs ADD CONSTRAINT sync_jobs_parent_id_fkey
          FOREIGN KEY (parent_id) REFERENCES sync_jobs (id);
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tmdb_deleted_ids_media_item_id_fkey') THEN
        ALTER TABLE tmdb_deleted_ids ADD CONSTRAINT tmdb_deleted_ids_media_item_id_fkey
          FOREIGN KEY (media_item_id) REFERENCES media_items (id) ON DELETE SET NULL;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'track_ratings_track_id_fkey') THEN
        ALTER TABLE track_ratings ADD CONSTRAINT track_ratings_track_id_fkey
          FOREIGN KEY (track_id) REFERENCES tracks (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'track_ratings_user_id_fkey') THEN
        ALTER TABLE track_ratings ADD CONSTRAINT track_ratings_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tracks_album_id_fkey') THEN
        ALTER TABLE tracks ADD CONSTRAINT tracks_album_id_fkey
          FOREIGN KEY (album_id) REFERENCES albums (media_item_id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_badges_user_id_fkey') THEN
        ALTER TABLE user_badges ADD CONSTRAINT user_badges_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_company_follows_company_id_fkey') THEN
        ALTER TABLE user_company_follows ADD CONSTRAINT user_company_follows_company_id_fkey
          FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_company_follows_user_id_fkey') THEN
        ALTER TABLE user_company_follows ADD CONSTRAINT user_company_follows_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_episode_interactions_episode_id_fkey') THEN
        ALTER TABLE user_episode_interactions ADD CONSTRAINT user_episode_interactions_episode_id_fkey
          FOREIGN KEY (episode_id) REFERENCES episodes (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_episode_interactions_user_id_fkey') THEN
        ALTER TABLE user_episode_interactions ADD CONSTRAINT user_episode_interactions_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_list_user_id_fkey') THEN
        ALTER TABLE user_list ADD CONSTRAINT user_list_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_list_item_list_id_fkey') THEN
        ALTER TABLE user_list_item ADD CONSTRAINT user_list_item_list_id_fkey
          FOREIGN KEY (list_id) REFERENCES user_list (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_list_item_media_item_id_fkey') THEN
        ALTER TABLE user_list_item ADD CONSTRAINT user_list_item_media_item_id_fkey
          FOREIGN KEY (media_item_id) REFERENCES media_items (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_local_games_match_suggestion_media_id_fkey') THEN
        ALTER TABLE user_local_games ADD CONSTRAINT user_local_games_match_suggestion_media_id_fkey
          FOREIGN KEY (match_suggestion_media_id) REFERENCES media_items (id) ON DELETE SET NULL;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_local_games_media_item_id_fkey') THEN
        ALTER TABLE user_local_games ADD CONSTRAINT user_local_games_media_item_id_fkey
          FOREIGN KEY (media_item_id) REFERENCES media_items (id) ON DELETE SET NULL;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_local_games_user_id_fkey') THEN
        ALTER TABLE user_local_games ADD CONSTRAINT user_local_games_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_media_interactions_media_item_id_fkey') THEN
        ALTER TABLE user_media_interactions ADD CONSTRAINT user_media_interactions_media_item_id_fkey
          FOREIGN KEY (media_item_id) REFERENCES media_items (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_media_interactions_user_id_fkey') THEN
        ALTER TABLE user_media_interactions ADD CONSTRAINT user_media_interactions_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_mood_checkins_user_id_fkey') THEN
        ALTER TABLE user_mood_checkins ADD CONSTRAINT user_mood_checkins_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_person_follows_person_id_fkey') THEN
        ALTER TABLE user_person_follows ADD CONSTRAINT user_person_follows_person_id_fkey
          FOREIGN KEY (person_id) REFERENCES people (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_person_follows_user_id_fkey') THEN
        ALTER TABLE user_person_follows ADD CONSTRAINT user_person_follows_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_plex_items_library_id_fkey') THEN
        ALTER TABLE user_plex_items ADD CONSTRAINT user_plex_items_library_id_fkey
          FOREIGN KEY (library_id) REFERENCES user_plex_libraries (id) ON DELETE SET NULL;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_plex_items_media_item_id_fkey') THEN
        ALTER TABLE user_plex_items ADD CONSTRAINT user_plex_items_media_item_id_fkey
          FOREIGN KEY (media_item_id) REFERENCES media_items (id) ON DELETE SET NULL;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_plex_items_server_id_fkey') THEN
        ALTER TABLE user_plex_items ADD CONSTRAINT user_plex_items_server_id_fkey
          FOREIGN KEY (server_id) REFERENCES user_plex_servers (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_plex_items_user_id_fkey') THEN
        ALTER TABLE user_plex_items ADD CONSTRAINT user_plex_items_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_plex_libraries_server_id_fkey') THEN
        ALTER TABLE user_plex_libraries ADD CONSTRAINT user_plex_libraries_server_id_fkey
          FOREIGN KEY (server_id) REFERENCES user_plex_servers (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_plex_libraries_user_id_fkey') THEN
        ALTER TABLE user_plex_libraries ADD CONSTRAINT user_plex_libraries_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_plex_servers_user_id_fkey') THEN
        ALTER TABLE user_plex_servers ADD CONSTRAINT user_plex_servers_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_ratings_rated_user_id_fkey') THEN
        ALTER TABLE user_ratings ADD CONSTRAINT user_ratings_rated_user_id_fkey
          FOREIGN KEY (rated_user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_ratings_rater_id_fkey') THEN
        ALTER TABLE user_ratings ADD CONSTRAINT user_ratings_rater_id_fkey
          FOREIGN KEY (rater_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_sessions_user_id_fkey') THEN
        ALTER TABLE user_sessions ADD CONSTRAINT user_sessions_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_steam_games_media_item_id_fkey') THEN
        ALTER TABLE user_steam_games ADD CONSTRAINT user_steam_games_media_item_id_fkey
          FOREIGN KEY (media_item_id) REFERENCES media_items (id) ON DELETE SET NULL;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_steam_games_user_id_fkey') THEN
        ALTER TABLE user_steam_games ADD CONSTRAINT user_steam_games_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_steam_wishlist_media_item_id_fkey') THEN
        ALTER TABLE user_steam_wishlist ADD CONSTRAINT user_steam_wishlist_media_item_id_fkey
          FOREIGN KEY (media_item_id) REFERENCES media_items (id) ON DELETE SET NULL;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_steam_wishlist_user_id_fkey') THEN
        ALTER TABLE user_steam_wishlist ADD CONSTRAINT user_steam_wishlist_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_streaks_user_id_fkey') THEN
        ALTER TABLE user_streaks ADD CONSTRAINT user_streaks_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_youtube_liked_videos_matched_media_item_id_fkey') THEN
        ALTER TABLE user_youtube_liked_videos ADD CONSTRAINT user_youtube_liked_videos_matched_media_item_id_fkey
          FOREIGN KEY (matched_media_item_id) REFERENCES media_items (id) ON DELETE SET NULL;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_youtube_liked_videos_user_id_fkey') THEN
        ALTER TABLE user_youtube_liked_videos ADD CONSTRAINT user_youtube_liked_videos_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workout_exercises_exercise_id_fkey') THEN
        ALTER TABLE workout_exercises ADD CONSTRAINT workout_exercises_exercise_id_fkey
          FOREIGN KEY (exercise_id) REFERENCES exercises (id);
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workout_exercises_workout_id_fkey') THEN
        ALTER TABLE workout_exercises ADD CONSTRAINT workout_exercises_workout_id_fkey
          FOREIGN KEY (workout_id) REFERENCES workouts (id) ON DELETE CASCADE;
      END IF;
    END $$""")

    op.execute("""DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workouts_user_id_fkey') THEN
        ALTER TABLE workouts ADD CONSTRAINT workouts_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
      END IF;
    END $$""")


def downgrade() -> None:
    pass