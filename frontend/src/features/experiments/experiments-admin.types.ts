export type CriterionStatus = 'done' | 'partial' | 'missing'
export type IntegrationStatus = 'integrated' | 'partial' | 'planned' | 'none'
export type MediaTypeSupport = 'full' | 'partial' | 'none'

interface ReadinessCriterion {
  label: string
  status: CriterionStatus
  note?: string
}

interface CrossIntegration {
  targetFeature: string
  status: IntegrationStatus
  note?: string
}

interface MediaTypeCoverage {
  mediaType: 'movie' | 'show' | 'music' | 'game'
  status: MediaTypeSupport
  note?: string
}

interface ExperimentAdminMeta {
  key: string
  readinessCriteria: ReadinessCriterion[]
  integrations: CrossIntegration[]
  mediaTypeSupport: MediaTypeCoverage[]
}

export const MEDIA_TYPES = ['movie', 'show', 'music', 'game'] as const
export const MEDIA_TYPE_LABELS: Record<string, string> = {
  movie: 'Movies',
  show: 'Shows',
  music: 'Music',
  game: 'Games',
}

export const MEDIA_TYPE_SUPPORT_ICON: Record<MediaTypeSupport, { className: string; label: string }> = {
  full: { className: 'text-green-500', label: 'Full' },
  partial: { className: 'text-amber-500', label: 'Partial' },
  none: { className: 'text-muted-foreground/15', label: 'None' },
}

// ── Pipeline efficiency ──

export interface PipelineStage {
  label: string
  status: CriterionStatus
  note?: string
  schedule?: string
}

interface PipelineProvider {
  name: string
  status: CriterionStatus
  schedule: string
  note?: string
}

interface PipelineEfficiency {
  mediaType: 'movie' | 'show' | 'music' | 'game'
  seedingMethod: string
  seedingSchedule: string
  seedingStatus: CriterionStatus
  seedingNote?: string
  providers: PipelineProvider[]
  flow: PipelineStage[]
  gaps: string[]
}

export function getEfficiencyScore(pipeline: PipelineEfficiency): number {
  let score = 0
  let total = 0

  // seeding counts for 25%
  const seedingWeight = 25
  if (pipeline.seedingStatus === 'done') score += seedingWeight
  else if (pipeline.seedingStatus === 'partial') score += seedingWeight * 0.5
  total += seedingWeight

  // each provider counts proportionally
  const providerWeight = 75
  if (pipeline.providers.length > 0) {
    const perProvider = providerWeight / pipeline.providers.length
    for (const p of pipeline.providers) {
      if (p.status === 'done') score += perProvider
      else if (p.status === 'partial') score += perProvider * 0.5
    }
  }
  total += providerWeight

  // gaps penalty: each gap subtracts from the provider score proportionally
  const maxGaps = pipeline.providers.length + 2
  if (maxGaps > 0 && pipeline.gaps.length > 0) {
    const penalty = Math.min(pipeline.gaps.length / maxGaps, 1) * 10
    score = Math.max(0, score - penalty)
  }

  return Math.round(Math.min(100, (score / total) * 100))
}

export const PIPELINE_EFFICIENCY: Record<string, PipelineEfficiency> = {
  movie: {
    mediaType: 'movie',
    seedingMethod: 'TMDB daily exports create ExternalID stubs for movies and people. Catalog hydration drains stubs into full MediaItems when enough metadata is available.',
    seedingSchedule: 'TMDB daily import at 3:07am, people seed every 5 min, catalog hydration every 30 min at :17/:47',
    seedingStatus: 'done',
    seedingNote: 'Env-gated: entire TMDB seeding + backlog disabled in local dev (app_env check in celery beat)',
    providers: [
      { name: 'TMDb', status: 'done', schedule: 'daily export + on-demand', note: 'Credits, genres, external IDs (IMDb, TVDB), images, trailers, releases, collections, watch providers, involved companies (production flag), revenue/budget' },
      { name: 'Fanart', status: 'done', schedule: 'every 15 min at :07/:22/:37/:52', note: 'HD posters, textless posters, logos, backgrounds' },
      { name: 'OMDb', status: 'done', schedule: 'every 30 min at :13/:43', note: 'IMDb/Rotten Tomatoes/Metacritic ratings, runtime, awards, plot' },
      { name: 'Production Companies', status: 'done', schedule: 'every 5 min' },
      { name: 'Content Ratings', status: 'done', schedule: 'every 5 min' },
      { name: 'Embedding', status: 'done', schedule: 'every 3 min (backfill)', note: 'pgvector embeddings used in search ranking via cosine distance' },
    ],
    flow: [
      { label: 'TMDB Daily Export', status: 'done', schedule: 'daily 3:07am', note: 'Creates ExternalID stubs from movie/people ID lists' },
      { label: 'People Seed', status: 'done', schedule: 'every 5 min', note: 'Hydrates person records (cast/crew) from TMDB' },
      { label: 'Catalog Hydration', status: 'done', schedule: 'every 30 min', note: 'Converts stubs → full MediaItems with metadata' },
      { label: 'Fanart Enrichment', status: 'done', schedule: 'every 15 min', note: 'HD posters, textless posters, backgrounds, logos' },
      { label: 'OMDb Ratings', status: 'done', schedule: 'every 30 min', note: 'IMDb, Rotten Tomatoes, Metacritic scores + plot' },
      { label: 'Involved Companies', status: 'done', schedule: 'every 5 min', note: 'Production companies with production flag, upserted via TMDB' },
      { label: 'Content Ratings', status: 'done', schedule: 'every 5 min' },
      { label: 'Vector Embedding', status: 'done', schedule: 'every 3 min', note: 'pgvector cosine distance in search ranking' },
    ],
    gaps: [
      'Revenue/budget fields used for ranking (revenue percentile, profit %, ROI) but never re-enriched from other sources',
      'No dedicated recommendation engine — embeddings used only for search ranking',
      'No user-review sentiment aggregation or external review scraping beyond OMDb',
    ],
  },

  show: {
    mediaType: 'show',
    seedingMethod: 'Same TMDB daily export pipeline as movies. Episode data comes from Plex watch history sync, not TMDB stubs.',
    seedingSchedule: 'TMDB daily import at 3:07am, catalog hydration every 30 min at :17/:47, Plex account sync every 11/41 min past the hour',
    seedingStatus: 'done',
    seedingNote: 'Env-gated (same as movies). Episode-level metadata depends entirely on user Plex connections.',
    providers: [
      { name: 'TMDb', status: 'done', schedule: 'daily export + on-demand', note: 'Season/episode structure, credits, genres, images, TV content ratings (TV-G/TV-14/etc.), involved companies (networks + production)' },
      { name: 'Fanart', status: 'done', schedule: 'every 15 min at :07/:22/:37/:52', note: 'HD posters, textless posters, backgrounds, logos' },
      { name: 'OMDb', status: 'done', schedule: 'every 30 min at :13/:43', note: 'Ratings, runtime, awards' },
      { name: 'Content Ratings', status: 'done', schedule: 'every 5 min' },
      { name: 'Embedding', status: 'done', schedule: 'every 3 min (backfill)', note: 'Used in search ranking via cosine distance' },
    ],
    flow: [
      { label: 'TMDB Daily Export', status: 'done', schedule: 'daily 3:07am', note: 'Creates ExternalID stubs for shows (shared with movies)' },
      { label: 'Catalog Hydration', status: 'done', schedule: 'every 30 min', note: 'Converts stubs → MediaItems with season structure' },
      { label: 'Plex Account Sync', status: 'done', schedule: 'every 11/41 min', note: 'Episode watch progress, per-user library sync' },
      { label: 'Fanart Enrichment', status: 'done', schedule: 'every 15 min', note: 'HD posters, textless posters, backgrounds, logos' },
      { label: 'OMDb Ratings', status: 'done', schedule: 'every 30 min', note: 'IMDb, Rotten Tomatoes, Metacritic scores' },
      { label: 'Involved Companies', status: 'done', schedule: 'every 5 min', note: 'Networks + production companies via TMDB' },
      { label: 'Content Ratings', status: 'done', schedule: 'every 5 min' },
      { label: 'Vector Embedding', status: 'done', schedule: 'every 3 min', note: 'pgvector cosine distance in search ranking' },
    ],
    gaps: [
      'Episode-level metadata is not independently seeded (no TVDB or TVmaze integration)',
      'Season-level enrichment ends at TMDb — no deep season metadata',
      'No network/streaming platform availability tracking',
    ],
  },

  music: {
    mediaType: 'music',
    seedingMethod: 'Four seed sources: (1) MusicBrainz release cycle discovers albums by decade via date-range search, (2) Deezer chart discovery pulls top 50 and seeds new ones, (3) Spotify recently played sync, (4) YouTube liked video sync.',
    seedingSchedule: 'MusicBrainz seed every 5 min, Deezer chart every 30 min at :14/:44, Spotify recently played every 7 min, YouTube every 15 min at :08/:23/:38/:53',
    seedingStatus: 'done',
    seedingNote: 'All four seed sources are scheduled with periodic discovery. Deezer free tier, ~10 rps. Spotify/YouTube are user-account-dependent.',
    providers: [
      { name: 'Deezer', status: 'done', schedule: 'every 30 min (chart discovery) + on-demand', note: 'Chart discovery cycle seeds top 50 albums. Full client + hydrator + transformer. Auto-chains to MB→TADB→LRCLIB→Last.fm→Fanart→embedding. Also has enrich_cover task for cover art backfill. ~10 rps, free tier.' },
      { name: 'Spotify', status: 'partial', schedule: 'every 7 min (history + library)', note: 'Seed-only — creates minimal entries with ISRCs/UPCs. Chains into MB/TADB/Last.fm/Fanart. NO catalog enrichment (no hydrator on disk). Audio features client+transformer exist but NO enrichment task wires them.' },
      { name: 'MusicBrainz', status: 'done', schedule: 'every 5 min (seed) + chained from Deezer/Spotify', note: 'ISRC→MBID + barcode→MBID resolution (ranks Album>EP>Single), full album sync with 15+ cross-platform external IDs, tracks, artists, labels, genres' },
      { name: 'TheAudioDB', status: 'done', schedule: 'chained from Deezer/MB sync', note: 'Cross-platform ID backfill, artwork (thumb/backdrop/CD art/logo), description, release year' },
      { name: 'LRCLIB', status: 'done', schedule: 'chained from Deezer/MB sync', note: 'Synced and plain lyrics for album tracks. Free API, no auth. Fills the lyrics gap that previously had no provider.' },
      { name: 'Last.fm', status: 'done', schedule: 'every 30 min + chained', note: 'Wiki summaries, genre tags, playcount and listeners stored as ExternalRatings' },
      { name: 'Fanart', status: 'done', schedule: 'every 15 min at :07/:22/:37/:52', note: 'Artist logos (set on Person), album covers by release group MBID' },
      { name: 'YouTube', status: 'partial', schedule: 'every 15 min at :08/:23/:38/:53', note: 'Liked video sync with heuristic title→album matching (0.3 confidence, 3 fallback strategies)' },
      { name: 'Embedding', status: 'done', schedule: 'every 3 min (backfill)', note: 'Used in search ranking via cosine distance' },
    ],
    flow: [
      { label: 'Deezer Chart Discovery', status: 'done', schedule: 'every 30 min', note: 'Pulls top 50 chart albums → enqueues new ones for seeding with full chain' },
      { label: 'Deezer Album Seed', status: 'done', schedule: 'chained', note: 'ISRC/UPC seed with artist credits + genres. Auto-chains to MB/TADB/LRCLIB/Last.fm/Fanart.' },
      { label: 'Spotify Seed', status: 'partial', schedule: 'every 7 min', note: 'Recently played → creates minimal entry with ISRCs. No catalog enrichment.' },
      { label: 'MB ISRC/Barcode Match', status: 'done', schedule: 'chained', note: 'Resolves ISRC→MBID + UPC→MBID. Ranks Album>EP>Single. Up to 5 ISRCs, 3 recordings each.' },
      { label: 'MB Full Sync', status: 'done', schedule: 'chained', note: 'Tracks, artists, labels, genres, cover art, 15+ external IDs (Spotify, Apple, Deezer, Tidal, etc.)' },
      { label: 'Deezer Cover Art', status: 'done', schedule: 'chained from MB', note: 'Finds cover art from Deezer for albums without poster URLs (search by artist+title)' },
      { label: 'TheAudioDB', status: 'done', schedule: 'chained', note: 'Cross-platform ID backfill, artwork (thumb, backdrop, CD art, logo), description' },
      { label: 'LRCLIB Lyrics', status: 'done', schedule: 'chained', note: 'Synced + plain lyrics for album tracks via lrclib.net free API' },
      { label: 'Last.fm', status: 'done', schedule: 'every 30 min', note: 'Wiki summaries, genre tags, playcount/listeners as ExternalRatings' },
      { label: 'YouTube Sync', status: 'partial', schedule: 'every 15 min', note: 'Liked videos → heuristic title→album matching (0.3 confidence threshold)' },
      { label: 'Fanart', status: 'done', schedule: 'every 15 min', note: 'Artist logos on Person records, album covers by release group MBID' },
      { label: 'Vector Embedding', status: 'done', schedule: 'every 3 min', note: 'pgvector cosine distance in search ranking' },
    ],
    gaps: [
      'Spotify audio features exist in client+transformer+DB but NO enrichment task wires them — 11 features (tempo, key, mode, energy, danceability, valence, acousticness, instrumentalness, liveness, speechiness, loudness) are never hydrated',
      'Spotify has no hydrator — catalog enrichment is entirely missing (seed-only)',
      'YouTube title matching is heuristic with 0.3 confidence threshold — 3 fallback strategies but no ML model',
      'No genre-based radio, autoplay discovery, or similar-artist traversal',
    ],
  },

  game: {
    mediaType: 'game',
    seedingMethod: 'Steam store app list + IGDB game database. Dual-seed from both providers with fuzzy name matching for cross-provider resolution.',
    seedingSchedule: 'Steam seed every 5 min, IGDB seed every 5 min, Steam enrich every 15 min at :03/:18/:33/:48, SteamGrid every 30 min at :27/:57, CCU batch every 5 min',
    seedingStatus: 'done',
    seedingNote: 'Dual-seed with name match. CCU batch handles up to 250 games per cycle. Strongest pipeline of the four types.',
    providers: [
      { name: 'Steam', status: 'done', schedule: 'seed every 5 min + enrich every 15 min', note: 'Store page data (price, developers, publishers, screenshots, movies), reviews (Steam user + Metacritic), CCU, library sync' },
      { name: 'IGDB', status: 'done', schedule: 'every 5 min', note: 'Game metadata, genres, platforms, game modes, screenshots, critic/user ratings, age ratings (ESRB/PEGI/CERO/USK/GRAC/ClassInd/ACB)' },
      { name: 'Steam Name Match', status: 'done', schedule: 'every 30 min at :23/:53', note: 'Searches Steam store by title to backfill steam_app_id for IGDB-only games' },
      { name: 'SteamGrid', status: 'done', schedule: 'every 30 min at :27/:57', note: 'Grid images (textless posters), heroes (backdrops), logos, icons' },
      { name: 'Fanart', status: 'done', schedule: 'every 15 min at :07/:22/:37/:52' },
      { name: 'Game Age Ratings', status: 'done', schedule: 'every 5 min' },
      { name: 'CCU Batch', status: 'done', schedule: 'every 5 min', note: 'Updates current_players for up to 250 games per cycle' },
      { name: 'Embedding', status: 'done', schedule: 'every 3 min (backfill)', note: 'Used in search ranking via cosine distance' },
    ],
    flow: [
      { label: 'Steam App List', status: 'done', schedule: 'every 5 min', note: 'Store app list → creates Game entries with steam_app_id' },
      { label: 'IGDB Seed', status: 'done', schedule: 'every 5 min', note: 'Metadata, genres, platforms, game modes, age ratings, screenshots' },
      { label: 'Steam Enrich', status: 'done', schedule: 'every 15 min', note: 'Store page: price, developers, publishers, screenshots, trailer movies' },
      { label: 'Steam Reviews', status: 'done', schedule: 'every 15 min', note: 'User review score + total, Metacritic score via store page' },
      { label: 'Name Match', status: 'done', schedule: 'every 30 min', note: 'Searches Steam store by title → backfills steam_app_id for IGDB entries' },
      { label: 'SteamGrid', status: 'done', schedule: 'every 30 min', note: 'Grid images, hero backdrops, logos, icons' },
      { label: 'Fanart', status: 'done', schedule: 'every 15 min', note: 'Game artwork' },
      { label: 'Age Ratings', status: 'done', schedule: 'every 5 min', note: 'ESRB, PEGI, CERO, USK, GRAC, ClassInd, ACB — mapped from IGDB' },
      { label: 'CCU Batch', status: 'done', schedule: 'every 5 min', note: 'Concurrent player counts for up to 250 games/cycle' },
      { label: 'Vector Embedding', status: 'done', schedule: 'every 3 min', note: 'pgvector cosine distance in search ranking' },
    ],
    gaps: [
      'No non-Steam storefront data (Epic Games Store, GOG, PlayStation, Xbox, Nintendo)',
      'No achievement/trophy data integration',
      'No playtime tracking beyond Steam library',
    ],
  },
}

export const EXPERIMENTS_ADMIN: Record<string, ExperimentAdminMeta> = {
  ai_recommendations: {
    key: 'ai_recommendations',
    readinessCriteria: [
      { label: 'Vector search query layer', status: 'partial', note: 'Search uses pgvector cosine distance; no dedicated recommendation engine yet' },
      { label: 'Embedding backfill complete', status: 'done', note: 'Backfill runs every 3 min; new items get embeddings on creation' },
      { label: 'Collaborative filtering cache', status: 'missing', note: 'Scans all users in memory with no indexing or caching' },
      { label: 'User preference weighting', status: 'missing' },
      { label: 'Fallback to trending content', status: 'done' },
      { label: 'Multi-type support', status: 'missing', note: 'No per-media-type models — movies, shows, music, and games would each need tuned signals' },
    ],
    integrations: [
      { targetFeature: 'gamification', status: 'planned', note: 'XP for discovering content through recommendations' },
      { targetFeature: 'friends_social', status: 'planned', note: 'Friend-based collaborative filtering signals' },
    ],
    mediaTypeSupport: [
      { mediaType: 'movie', status: 'none', note: 'No per-type models exist yet' },
      { mediaType: 'show', status: 'none', note: 'No per-type models exist yet' },
      { mediaType: 'music', status: 'none', note: 'No per-type models exist yet' },
      { mediaType: 'game', status: 'none', note: 'No per-type models exist yet' },
    ],
  },

  mood_checkins: {
    key: 'mood_checkins',
    readinessCriteria: [
      { label: 'Daily check-in CRUD', status: 'done' },
      { label: 'Mood history & trends view', status: 'missing', note: 'Only today\'s check-in is accessible via API' },
      { label: 'Mood aggregation analytics', status: 'missing', note: 'No weekly/monthly trends or insights' },
      { label: 'User toggle in settings', status: 'done', note: 'daily_mood_checkins_enabled on User model' },
    ],
    integrations: [
      { targetFeature: 'gamification', status: 'integrated', note: '10 XP awarded per daily check-in' },
    ],
    mediaTypeSupport: [
      { mediaType: 'movie', status: 'full', note: 'Type-agnostic — mood tracking has no media type dependency' },
      { mediaType: 'show', status: 'full', note: 'Type-agnostic — mood tracking has no media type dependency' },
      { mediaType: 'music', status: 'full', note: 'Type-agnostic — mood tracking has no media type dependency' },
      { mediaType: 'game', status: 'full', note: 'Type-agnostic — mood tracking has no media type dependency' },
    ],
  },

  admin_edit_proposals: {
    key: 'admin_edit_proposals',
    readinessCriteria: [
      { label: 'Proposal submission form', status: 'partial', note: 'Admin modal exists but no user-facing submission flow' },
      { label: 'Admin approve/reject workflow', status: 'done' },
      { label: 'XP rewards for proposals', status: 'done', note: '50 XP submission, 100 XP approval, 30 XP rejection' },
      { label: 'Media mutation integration', status: 'missing', note: 'Approved proposals are not wired to media update services' },
      { label: 'Image override support', status: 'partial', note: 'Backend schema exists, UI partial' },
    ],
    integrations: [
      { targetFeature: 'gamification', status: 'integrated', note: 'Full XP reward cycle for proposal lifecycle' },
    ],
    mediaTypeSupport: [
      { mediaType: 'movie', status: 'partial', note: 'Edit modal exists for movies but not wired to mutation pipeline' },
      { mediaType: 'show', status: 'partial', note: 'Edit modal exists for shows but not wired to mutation pipeline' },
      { mediaType: 'music', status: 'partial', note: 'Edit modal exists for music but not wired to mutation pipeline' },
      { mediaType: 'game', status: 'partial', note: 'Edit modal exists for games but not wired to mutation pipeline' },
    ],
  },

  workout_tracker: {
    key: 'workout_tracker',
    readinessCriteria: [
      { label: 'Exercise library management', status: 'partial', note: 'Static catalog only, no user-created exercises' },
      { label: 'NLP free-text parsing', status: 'done' },
      { label: 'Workout CRUD', status: 'done' },
      { label: 'Heatmap visualization', status: 'done' },
      { label: 'Volume (kg) tracking', status: 'missing', note: 'Field exists but always returned as null' },
      { label: 'Set-level tracking (reps + weight)', status: 'done' },
      { label: 'Streak integration', status: 'done' },
      { label: 'Gamification integration', status: 'done', note: '100 XP per workout, 8 dedicated badges, streak bonuses' },
    ],
    integrations: [
      { targetFeature: 'gamification', status: 'integrated', note: 'XP awards, 8 workout badges, streak tracking with bonus milestones' },
    ],
    mediaTypeSupport: [
      { mediaType: 'movie', status: 'full', note: 'Not media-type specific — workouts are independent of media tracking' },
      { mediaType: 'show', status: 'full', note: 'Not media-type specific — workouts are independent of media tracking' },
      { mediaType: 'music', status: 'full', note: 'Not media-type specific — workouts are independent of media tracking' },
      { mediaType: 'game', status: 'full', note: 'Not media-type specific — workouts are independent of media tracking' },
    ],
  },

  friends_social: {
    key: 'friends_social',
    readinessCriteria: [
      { label: 'Friend request system', status: 'done' },
      { label: 'Friends list queries', status: 'done' },
      { label: 'Dedicated friends page', status: 'missing', note: 'No /friends route or FriendsPage component exists' },
      { label: 'Activity feed UI', status: 'missing', note: 'No social feed showing friend activity' },
      { label: 'Follow/unfollow on profiles', status: 'done' },
      { label: 'SSE real-time friend activity', status: 'planned' },
    ],
    integrations: [
      { targetFeature: 'sse_notifications', status: 'integrated', note: 'Friend request notifications delivered via existing notification system' },
      { targetFeature: 'gamification', status: 'planned', note: 'Potential social badges and friend-based XP events' },
    ],
    mediaTypeSupport: [
      { mediaType: 'movie', status: 'full', note: 'Type-agnostic — social features are independent of media type' },
      { mediaType: 'show', status: 'full', note: 'Type-agnostic — social features are independent of media type' },
      { mediaType: 'music', status: 'full', note: 'Type-agnostic — social features are independent of media type' },
      { mediaType: 'game', status: 'full', note: 'Type-agnostic — social features are independent of media type' },
    ],
  },

  sse_notifications: {
    key: 'sse_notifications',
    readinessCriteria: [
      { label: 'SSE endpoint + Redis pub/sub', status: 'done' },
      { label: 'Toast notification display', status: 'done' },
      { label: 'Mark read / mark all read', status: 'done' },
      { label: 'Notification creation wiring', status: 'partial', note: 'Sparsely wired — few services trigger notification creation' },
      { label: 'Per-type notification preferences', status: 'done' },
      { label: 'Exponential backoff reconnect', status: 'done' },
    ],
    integrations: [],
    mediaTypeSupport: [
      { mediaType: 'movie', status: 'full', note: 'Type-agnostic — notification infrastructure works across all types' },
      { mediaType: 'show', status: 'full', note: 'Type-agnostic — notification infrastructure works across all types' },
      { mediaType: 'music', status: 'full', note: 'Type-agnostic — notification infrastructure works across all types' },
      { mediaType: 'game', status: 'full', note: 'Type-agnostic — notification infrastructure works across all types' },
    ],
  },

  youtube_sync: {
    key: 'youtube_sync',
    readinessCriteria: [
      { label: 'YouTube API integration', status: 'done' },
      { label: 'SSE progress streaming', status: 'done' },
      { label: 'Title-to-album matching', status: 'partial', note: 'Heuristic parsing with 0.3 confidence threshold and 3 fallback strategies' },
      { label: 'Channel-to-person linking', status: 'done' },
      { label: 'Background scheduled sync', status: 'missing', note: 'Only manual trigger from settings, no periodic auto-sync' },
      { label: 'Google account connection', status: 'done' },
    ],
    integrations: [
      { targetFeature: 'gamification', status: 'planned', note: 'XP for synced music interactions' },
    ],
    mediaTypeSupport: [
      { mediaType: 'movie', status: 'none', note: 'YouTube sync only applies to music videos' },
      { mediaType: 'show', status: 'none', note: 'YouTube sync only applies to music videos' },
      { mediaType: 'music', status: 'partial', note: 'Works for music videos but matching is heuristic (0.3 confidence threshold)' },
      { mediaType: 'game', status: 'none', note: 'YouTube sync only applies to music videos' },
    ],
  },

  gamification: {
    key: 'gamification',
    readinessCriteria: [
      { label: 'XP system (12+ action types)', status: 'done' },
      { label: 'Level progression (8 tiers)', status: 'done', note: '300 XP/level, Novice → Transcendent' },
      { label: '43 achievement badges', status: 'done' },
      { label: 'Login streak tracking', status: 'done' },
      { label: 'Review streak tracking', status: 'done' },
      { label: 'Workout streak tracking', status: 'done' },
      { label: 'Badge claiming UX', status: 'missing', note: 'Badges auto-award but claimed field on UserBadge is unused' },
    ],
    integrations: [],
    mediaTypeSupport: [
      { mediaType: 'movie', status: 'full', note: 'XP, badges, and streaks work across all media types' },
      { mediaType: 'show', status: 'full', note: 'XP, badges, and streaks work across all media types' },
      { mediaType: 'music', status: 'full', note: 'XP, badges, and streaks work across all media types' },
      { mediaType: 'game', status: 'full', note: 'XP, badges, and streaks work across all media types' },
    ],
  },
}

export function getReadinessStats(meta: ExperimentAdminMeta) {
  const criteriaTotal = meta.readinessCriteria.length
  const criteriaDone = meta.readinessCriteria.filter((c) => c.status === 'done').length
  const criteriaPartial = meta.readinessCriteria.filter((c) => c.status === 'partial').length

  const mediaTotal = meta.mediaTypeSupport.length
  const mediaDone = meta.mediaTypeSupport.filter((m) => m.status === 'full').length
  const mediaPartial = meta.mediaTypeSupport.filter((m) => m.status === 'partial').length

  const total = criteriaTotal + mediaTotal
  const done = criteriaDone + mediaDone
  const partial = criteriaPartial + mediaPartial

  return {
    total,
    done,
    partial,
    missing: total - done - partial,
    pct: total > 0 ? Math.round((done / total) * 100) : 0,
    criteria: { total: criteriaTotal, done: criteriaDone, partial: criteriaPartial, pct: criteriaTotal > 0 ? Math.round((criteriaDone / criteriaTotal) * 100) : 0 },
    media: { total: mediaTotal, done: mediaDone, partial: mediaPartial, pct: mediaTotal > 0 ? Math.round((mediaDone / mediaTotal) * 100) : 0 },
  }
}
