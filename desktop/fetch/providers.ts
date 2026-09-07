// desktop/fetch/providers.ts
// TypeScript mirrors of the backend seed-raw fetches for the dispatchable and
// seedable provider/entity pairs. A proxy fetch happens only when the server
// lacks a provider key but an online capable device holds one; the desktop
// client reproduces the exact raw dict the server-side `seed_*_from_*` service
// consumes, so the parked SyncJob seeds as if the server had fetched it.
//
// Mirrors today: tmdb (movie/show — one appended detail GET) and igdb (game —
// the hydration-fields /games GET plus a resolved /age_ratings fetch, mirroring
// igdb_ingest.fetch_and_seed_game). These are the only providers with both an
// engine the dispatcher gates on AND a registered (provider, entity_type)
// seeder in apps/integrations/services/fetch_result.py. Providers are executed
// through an injected HttpTransport so request building and raw assembly are
// unit-testable without network access.

import type { FetchCapability, FetchRequest, HttpTransport, ProviderKeys } from './types'

const TMDB_BASE = 'https://api.themoviedb.org/3'
const IGDB_API = 'https://api.igdb.com/v4'
const TWITCH_OAUTH = 'https://id.twitch.tv/oauth2/token'

/** Key stores providers live in; mirrors are keyed by these exact names. */
export const SUPPORTED_PROVIDERS = ['tmdb', 'igdb'] as const

// Field string the IGDB game seeder hydrates (igdb_ingest.GAME_HYDRATION_FIELDS).
// Keep in lockstep with the backend so the client returns a seedable raw.
export const GAME_HYDRATION_FIELDS = [
  'id,name,slug,cover.image_id,first_release_date,storyline,summary,',
  'status,game_type,franchise.name,parent_game.name,',
  'websites.url,websites.type,',
  'platforms.name,genres.name,game_modes.name,',
  'screenshots.image_id,artworks.image_id,',
  'videos.video_id,videos.name,age_ratings,',
  'involved_companies.developer,involved_companies.publisher,',
  'involved_companies.porting,involved_companies.supporting,',
  'involved_companies.company.name,involved_companies.company.slug',
].join('')

function tmdbPath(entityType: string): string {
  return entityType === 'show' ? 'tv' : entityType === 'movie' ? 'movie' : ''
}

function tmdbAppendToResponse(entityType: string): string {
  return entityType === 'show'
    ? 'credits,external_ids,images,videos,keywords,seasons,content_ratings'
    : 'credits,external_ids,images,videos,release_dates,keywords'
}

/** Required key fields per provider, mirrored by the backend key schemas. */
const REQUIRED_KEY_FIELDS: Record<string, string[]> = {
  tmdb: ['token'], // TMDB v4 read-access token (Bearer), like the server TMDB_RAT
  igdb: ['client_id', 'client_secret'], // Twitch app creds for client-credentials
}

/** True when a provider has both a mirror and a usable key present. */
export function isMirrorable(provider: string, keys: ProviderKeys): boolean {
  if (!(provider in REQUIRED_KEY_FIELDS)) return false
  const keyed = keys[provider]
  if (!keyed || typeof keyed !== 'object') return false
  // tmdb also accepts a v3 api_key fallback even though the server needs a token.
  if (provider === 'tmdb') return Boolean(keyed.token) || Boolean(keyed.api_key)
  return REQUIRED_KEY_FIELDS[provider].every((field) => Boolean(keyed[field]))
}

/** Reduce a user's full key map to the subset the desktop can advertise. */
export function usableCapability(keys: ProviderKeys): FetchCapability {
  const provider_keys: ProviderKeys = {}
  const providers: string[] = []
  for (const provider of Object.keys(keys)) {
    if (!isMirrorable(provider, keys)) continue
    provider_keys[provider] = keys[provider]
    providers.push(provider)
  }
  return { provider_keys, providers }
}

function requireStatus(res: { status: number }, what: string): void {
  if (res.status !== 200) {
    throw new Error(`${what} failed (HTTP ${res.status})`)
  }
}

// ── TMDB ─────────────────────────────────────────────────────────────

async function fetchTmdbDetail(
  transport: HttpTransport,
  entityType: string,
  externalId: string,
  keys: ProviderKeys,
): Promise<Record<string, unknown>> {
  const path = tmdbPath(entityType)
  if (!path) throw new Error(`tmdb fetch has no mirror for entity '${entityType}'`)
  const tmdbKeys = keys.tmdb ?? {}
  const url = new URL(`${TMDB_BASE}/${path}/${externalId}`)
  url.searchParams.set('language', 'en-US')
  url.searchParams.set('append_to_response', tmdbAppendToResponse(entityType))

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (tmdbKeys.token) headers.Authorization = `Bearer ${tmdbKeys.token}`
  else if (tmdbKeys.api_key) url.searchParams.set('api_key', tmdbKeys.api_key)
  else throw new Error('tmdb fetch requires a token or api_key')

  const res = await transport({ method: 'GET', url: url.toString(), headers, timeoutMs: 60_000 })
  requireStatus(res, `TMDB ${path} ${externalId}`)
  try {
    return JSON.parse(res.body) as Record<string, unknown>
  } catch {
    throw new Error(`TMDB ${path} ${externalId} returned invalid JSON`)
  }
}

// ── IGDB ─────────────────────────────────────────────────────────────

// In-process Twitch token cache so repeated game fetches don't re-auth each one.
const igdbTokenCache = new Map<string, { token: string; expiresAt: number }>()
const IGDB_TOKEN_TTL_MS = 50 * 24 * 60 * 60 * 1000 // 50 days

async function igdbAccessToken(
  transport: HttpTransport,
  keys: ProviderKeys,
): Promise<{ token: string; clientId: string }> {
  const igdbKeys = keys.igdb ?? {}
  const clientId = igdbKeys.client_id ?? ''
  const clientSecret = igdbKeys.client_secret ?? ''
  if (!clientId || !clientSecret) throw new Error('igdb fetch requires client_id and client_secret')

  const cached = igdbTokenCache.get(clientId)
  if (cached && Date.now() < cached.expiresAt) return { token: cached.token, clientId }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  }).toString()
  const res = await transport({
    method: 'POST',
    url: TWITCH_OAUTH,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    timeoutMs: 30_000,
  })
  requireStatus(res, 'IGDB Twitch OAuth')
  let data: { access_token?: string }
  try {
    data = JSON.parse(res.body) as { access_token?: string }
  } catch {
    throw new Error('IGDB Twitch OAuth returned invalid JSON')
  }
  if (!data.access_token) throw new Error('IGDB Twitch OAuth returned no access_token')
  igdbTokenCache.set(clientId, { token: data.access_token, expiresAt: Date.now() + IGDB_TOKEN_TTL_MS })
  return { token: data.access_token, clientId }
}

async function igdbPost(
  transport: HttpTransport,
  token: string,
  clientId: string,
  path: string,
  body: string,
): Promise<Record<string, unknown>[]> {
  const res = await transport({
    method: 'POST',
    url: `${IGDB_API}${path}`,
    headers: {
      'Client-ID': clientId,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'text/plain',
    },
    body,
    timeoutMs: 60_000,
  })
  requireStatus(res, `IGDB ${path}`)
  try {
    const parsed = JSON.parse(res.body) as unknown
    if (!Array.isArray(parsed)) throw new Error(`IGDB ${path} did not return an array`)
    return parsed as Record<string, unknown>[]
  } catch (err) {
    if (err instanceof Error && err.message !== `IGDB ${path} did not return an array`) {
      throw new Error(`IGDB ${path} returned invalid JSON`)
    }
    throw err
  }
}

async function fetchIgdbGame(
  transport: HttpTransport,
  externalId: string,
  keys: ProviderKeys,
): Promise<Record<string, unknown>> {
  const { token, clientId } = await igdbAccessToken(transport, keys)
  const rows = await igdbPost(
    transport,
    token,
    clientId,
    '/games',
    `fields ${GAME_HYDRATION_FIELDS}; where id = (${externalId}); limit 1;`,
  )
  const game = rows[0]
  if (!game) throw new Error(`IGDB returned no game for id ${externalId}`)

  // The /games endpoint returns age_ratings as an id list; resolve the org/label
  // rows through a separate /age_ratings fetch (best-effort), exactly like
  // igdb_ingest.fetch_and_seed_game attaches raw['age_rating_details'].
  const ageIds = Array.isArray(game.age_ratings)
    ? (game.age_ratings as unknown[]).filter((r): r is number => typeof r === 'number').map(String)
    : []
  if (ageIds.length > 0) {
    try {
      const details = await igdbPost(
        transport,
        token,
        clientId,
        '/age_ratings',
        `fields organization,rating_category; where id = (${ageIds.join(',')}); limit 500;`,
      )
      if (Array.isArray(details) && details.length > 0) game.age_rating_details = details
    } catch {
      // Best-effort sub-fetch: a failure shouldn't abort the seed (matches server).
    }
  }
  return game
}

// ── Dispatch ─────────────────────────────────────────────────────────

/** Fetch the raw provider payload the backend seed service expects for *req*. */
export async function fetchSeedRaw(
  transport: HttpTransport,
  req: FetchRequest,
  keys: ProviderKeys,
): Promise<Record<string, unknown>> {
  switch (req.provider) {
    case 'tmdb':
      if (!isMirrorable('tmdb', keys)) throw new Error('tmdb fetch requested but no usable tmdb key')
      return fetchTmdbDetail(transport, req.entity_type, req.external_id, keys)
    case 'igdb':
      if (!isMirrorable('igdb', keys)) throw new Error('igdb fetch requested but no usable igdb key')
      return fetchIgdbGame(transport, req.external_id, keys)
    default:
      throw new Error(`no proxy-fetch mirror for provider '${req.provider}'`)
  }
}
