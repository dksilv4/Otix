// SyncPlay — one-way Spotify → YouTube Music playlist sync.
//
// Reads your Spotify playlists / Liked Songs and keeps a matching playlist on
// YouTube Music up to date. Authentication is a hybrid:
//   - Spotify: standalone — bring your own Spotify Developer app credentials
//     (authorization-code + refresh). Register redirect URI
//     http://127.0.0.1:8765/callback in the app. Tokens are stored locally and
//     refresh automatically on expiry.
//   - Google/YouTube: dual-path. Preferred: reuse Otix's own Google integration
//     (tokens pulled from the Otix backend through ctx.api). Alternative: a
//     standalone Google Cloud OAuth app using the user's own Client ID/Secret
//     (same loopback redirect as Spotify). Standalone wins when configured and
//     linked; otherwise the plugin falls back to the Otix account.
//
// Auth uses the Otix plugin OAuth window: the settings panel calls
// data['auth.getLoginUrl'] to get a provider authorize URL, opens it in an
// Electron window, captures the `code` from the provider redirect, then calls
// data['auth.handleCallback'].
//
// ctx.fetch is not a real `fetch` Response — it resolves to
// { status, statusText, headers, body } where body is a string. All API
// helpers below normalize that. ctx.api is a thin proxy to the Otix backend
// (http://127.0.0.1:8000/api) that throws on non-2xx.

const crypto = require('crypto')

// ── Constants ────────────────────────────────────────────────────────────
const REDIRECT_PORT = 8765
const REDIRECT_URI = 'http://127.0.0.1:' + REDIRECT_PORT + '/callback'

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize'
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token'
const SPOTIFY_API = 'https://api.spotify.com/v1'
const SPOTIFY_SCOPES = 'playlist-read-private playlist-read-collaborative user-library-read'

const GOOGLE_API = 'https://www.googleapis.com/youtube/v3'
// Google can connect two ways: through Otix's existing Google integration
// (framework), or standalone with the user's own Google Cloud OAuth app.
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/youtube'

// YouTube Data API v3 quota units per call.
const QUOTA_SEARCH = 100
const QUOTA_INSERT = 50
const QUOTA_PLAYLIST = 50
const QUOTA_DELETE = 50

// ── Module state ─────────────────────────────────────────────────────────
let _pending = { provider: null, state: '', googleStandalone: false } // in-flight sign-in (state for Otix Google, googleStandalone picks the standalone path)
let _syncing = false
let _syncProgress = { phase: 'idle', current: 0, total: 0, title: '', playlistTitle: '', track: 0, trackTotal: 0, lastTrack: '' }
let _autoTimer = null
let _lastSyncSummary = null          // { at, added, skipped, pruned, unmatched, errors }

// ── HTTP helpers ─────────────────────────────────────────────────────────
async function httpJson(ctx, url, opts) {
  opts = opts || {}
  opts.headers = opts.headers || {}
  if (!opts.headers['Accept']) opts.headers['Accept'] = 'application/json'
  if (!opts.headers['User-Agent']) opts.headers['User-Agent'] = 'Otix/SyncPlay'
  const res = await ctx.fetch(url, opts)
  let data = null
  if (res.body) {
    try { data = JSON.parse(res.body) } catch (e) { data = res.body }
  }
  return { status: res.status, statusText: res.statusText, headers: res.headers, data }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function httpForm(ctx, url, fields, extraHeaders) {
  const params = new URLSearchParams()
  Object.keys(fields || {}).forEach((k) => params.set(k, String(fields[k])))
  const res = await ctx.fetch(url, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/x-www-form-urlencoded' }, extraHeaders || {}),
    body: params.toString(),
  })
  let data = null
  if (res.body) {
    try { data = JSON.parse(res.body) } catch (e) { data = res.body }
  }
  return { status: res.status, headers: res.headers, data }
}

// ── Credentials & token store ────────────────────────────────────────────
async function getCreds(ctx) {
  return {
    spotifyClientId: (await ctx.config.get('spotify_client_id')) || '',
    spotifyClientSecret: (await ctx.config.get('spotify_client_secret')) || '',
  }
}

function hasCreds(c) {
  return !!(c.spotifyClientId && c.spotifyClientSecret)
}

async function storeSpotifyTokens(ctx, data) {
  await ctx.config.set('_spotify_access_token', data.access_token || '')
  if (data.refresh_token) await ctx.config.set('_spotify_refresh_token', data.refresh_token)
  await ctx.config.set('_spotify_expires_at', Date.now() + (Number(data.expires_in) || 3600) * 1000 - 60000)
  // A successful token exchange proves the Client ID/Secret are correct.
  await ctx.config.set('_spotify_creds_ok', 'valid')
}

async function refreshSpotify(ctx, refreshToken) {
  const c = await getCreds(ctx)
  const res = await httpForm(ctx, SPOTIFY_TOKEN_URL, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: c.spotifyClientId,
    client_secret: c.spotifyClientSecret,
  })
  if (res.status !== 200) {
    await ctx.config.set('_spotify_access_token', '')
    await ctx.config.set('_spotify_refresh_token', '')
    return false
  }
  await storeSpotifyTokens(ctx, res.data)
  return true
}

// Returns a fresh access token, or null when not authenticated. A valid token
// is returned as-is; an expired one triggers a refresh; if refresh fails (or
// there is no refresh token) we return null so callers treat the provider as
// disconnected rather than sending a stale token to the API.
async function getSpotifyToken(ctx) {
  const access = await ctx.config.get('_spotify_access_token')
  if (!access) return null
  const expiresAt = await ctx.config.get('_spotify_expires_at')
  if (!expiresAt || Date.now() < expiresAt) return access
  const refresh = await ctx.config.get('_spotify_refresh_token')
  if (!refresh) return null
  return (await refreshSpotify(ctx, refresh)) ? await ctx.config.get('_spotify_access_token') : null
}

// ── Google (dual-path) ────────────────────────────────────────────────────
// Google can connect two ways: through Otix's existing Google integration
// ("framework" — tokens live server-side, we pull a fresh one via ctx.api), or
// standalone with the user's own Google Cloud OAuth app (tokens stored in
// plugin config, exactly like Spotify). Standalone wins when configured and
// linked; otherwise we fall back to the framework.
async function getGoogleCreds(ctx) {
  return {
    googleClientId: (await ctx.config.get('google_client_id')) || '',
    googleClientSecret: (await ctx.config.get('google_client_secret')) || '',
  }
}

function hasGoogleCreds(c) {
  return !!(c.googleClientId && c.googleClientSecret)
}

async function storeGoogleTokens(ctx, data) {
  await ctx.config.set('_google_access_token', data.access_token || '')
  if (data.refresh_token) await ctx.config.set('_google_refresh_token', data.refresh_token)
  await ctx.config.set('_google_expires_at', Date.now() + (Number(data.expires_in) || 3600) * 1000 - 60000)
}

async function refreshStandaloneGoogle(ctx, refreshToken) {
  const c = await getGoogleCreds(ctx)
  const res = await httpForm(ctx, GOOGLE_TOKEN_URL, {
    grant_type: 'refresh_token', refresh_token: refreshToken,
    client_id: c.googleClientId, client_secret: c.googleClientSecret,
  })
  if (res.status !== 200) {
    await ctx.config.set('_google_access_token', '')
    await ctx.config.set('_google_refresh_token', '')
    return false
  }
  await storeGoogleTokens(ctx, res.data)
  return true
}

async function getStandaloneGoogleToken(ctx) {
  const c = await getGoogleCreds(ctx)
  if (!hasGoogleCreds(c)) return null
  const access = await ctx.config.get('_google_access_token')
  if (!access) return null
  const expiresAt = await ctx.config.get('_google_expires_at')
  if (!expiresAt || Date.now() < expiresAt) return access
  const refresh = await ctx.config.get('_google_refresh_token')
  if (!refresh) return null
  return (await refreshStandaloneGoogle(ctx, refresh)) ? await ctx.config.get('_google_access_token') : null
}

// Framework path: Otix stores the Google tokens; pull a fresh one through the
// authenticated API. ctx.api throws on non-2xx (404 when not linked, 401/403
// when unauthenticated or permission-denied). Returns { token } on success or
// { error } so status() can explain why Google shows disconnected.
async function getFrameworkGoogleToken(ctx) {
  try {
    const res = await ctx.api.get('/auth/oauth/google/token')
    return res && res.access_token ? { token: res.access_token } : { error: 'Otix returned no Google token' }
  } catch (e) {
    return { error: (e && e.message) || String(e) }
  }
}

// Active Google connection: standalone (user's own app) when configured and a
// usable token exists, otherwise the Otix framework. Returns { token, mode }.
async function getGoogleConnection(ctx) {
  const c = await getGoogleCreds(ctx)
  if (hasGoogleCreds(c)) {
    const token = await getStandaloneGoogleToken(ctx)
    if (token) return { token, mode: 'standalone' }
  }
  const fw = await getFrameworkGoogleToken(ctx)
  if (fw.token) return { token: fw.token, mode: 'framework' }
  return { token: null, mode: '', error: fw.error || 'Google not linked' }
}

async function getGoogleToken(ctx) {
  return (await getGoogleConnection(ctx)).token
}

// ── Spotify API ──────────────────────────────────────────────────────────
function parseSpotifyPlaylistId(input) {
  if (!input) return null
  const s = String(input).trim()
  const m = s.match(/[?&]list=([A-Za-z0-9]{15,})/) || s.match(/\/playlist\/([A-Za-z0-9]{15,})/)
  if (m) return m[1]
  if (/^[A-Za-z0-9]{15,}$/.test(s)) return s
  return null
}

async function spotifyGetPlaylist(ctx, token, id) {
  const meta = await httpJson(
    ctx,
    SPOTIFY_API + '/playlists/' + encodeURIComponent(id) + '?fields=name,snapshot_id,tracks(total)',
    { headers: { Authorization: 'Bearer ' + token } },
  )
  if (meta.status !== 200) {
    throw new Error('Spotify playlist fetch failed (HTTP ' + meta.status + '): ' + JSON.stringify(meta.data || {}).slice(0, 200))
  }
  const name = meta.data.name
  const snapshotId = meta.data.snapshot_id
  const total = (meta.data.tracks && meta.data.tracks.total) || 0

  const tracks = []
  let offset = 0
  const limit = 100
  for (;;) {
    const res = await httpJson(
      ctx,
      SPOTIFY_API + '/playlists/' + encodeURIComponent(id) + '/tracks?limit=' + limit + '&offset=' + offset,
      { headers: { Authorization: 'Bearer ' + token } },
    )
    if (res.status !== 200) throw new Error('Spotify tracks fetch failed (HTTP ' + res.status + ')')
    const items = res.data.items || []
    items.forEach((it) => {
      const tr = it.track
      if (!tr || tr.type !== 'track') return
      const artists = (tr.artists || []).map((a) => a.name).filter(Boolean)
      tracks.push({ id: tr.id, name: tr.name, artists, added_at: it.added_at || null })
    })
    offset += items.length
    if (items.length < limit || offset >= total) break
  }
  return { name, snapshot_id: snapshotId, tracks }
}

// Spotify "Liked Songs" is a saved-track library, not a playlist — there is no
// playlist id or snapshot id. Paginate /me/tracks and derive a pseudo-snapshot
// from the sorted track ids so the sync engine still detects additions/removals.
async function spotifyGetLiked(ctx, token) {
  const tracks = []
  let offset = 0
  const limit = 50
  let total = null
  for (;;) {
    const res = await httpJson(
      ctx,
      SPOTIFY_API + '/me/tracks?limit=' + limit + '&offset=' + offset,
      { headers: { Authorization: 'Bearer ' + token } },
    )
    if (res.status !== 200) throw new Error('Spotify liked songs fetch failed (HTTP ' + res.status + '): ' + JSON.stringify(res.data || {}).slice(0, 200))
    if (total === null) total = res.data.total || 0
    const items = res.data.items || []
    items.forEach((it) => {
      const tr = it.track
      if (!tr || tr.type !== 'track') return
      const artists = (tr.artists || []).map((a) => a.name).filter(Boolean)
      tracks.push({ id: tr.id, name: tr.name, artists, added_at: it.added_at || null })
    })
    offset += items.length
    if (items.length < limit || offset >= total) break
  }
  const snapshot = crypto.createHash('sha1').update(tracks.map((t) => t.id).sort().join('|')).digest('hex').slice(0, 16)
  return { name: 'Liked Songs', snapshot_id: 'liked:' + snapshot, tracks }
}

// ── YouTube Data API v3 ──────────────────────────────────────────────────
async function ytRequest(ctx, token, method, path, body) {
  const opts = { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } }
  if (body) opts.body = JSON.stringify(body)
  return httpJson(ctx, GOOGLE_API + path, opts)
}

function ytQuotaError(res) {
  if (res.status === 403 || res.status === 429) {
    throw new Error('YouTube quota/rate limit exceeded (HTTP ' + res.status + '): ' + JSON.stringify(res.data || {}).slice(0, 200))
  }
}

async function ytSearch(ctx, token, query) {
  const path = '/search?part=snippet&type=video&maxResults=8&q=' + encodeURIComponent(query) +
    '&fields=items(id(videoId),snippet(title,channelTitle))'
  const res = await ytRequest(ctx, token, 'GET', path)
  ytQuotaError(res)
  if (res.status !== 200) throw new Error('YouTube search failed (HTTP ' + res.status + ')')
  return (res.data.items || []).map((it) => ({
    videoId: it.id && it.id.videoId,
    title: it.snippet && it.snippet.title,
    channel: it.snippet && it.snippet.channelTitle,
  }))
}

async function ytFindPlaylist(ctx, token, title) {
  const path = '/playlists?part=snippet&mine=true&maxResults=50&fields=items(id,snippet(title))'
  const res = await ytRequest(ctx, token, 'GET', path)
  ytQuotaError(res)
  if (res.status !== 200) throw new Error('YouTube playlists fetch failed (HTTP ' + res.status + ')')
  const target = normalize(title)
  const items = res.data.items || []
  for (let i = 0; i < items.length; i++) {
    if (items[i].snippet && normalize(items[i].snippet.title) === target) return items[i].id
  }
  return null
}

async function ytCreatePlaylist(ctx, token, title) {
  const res = await ytRequest(ctx, token, 'POST', '/playlists?part=snippet', {
    snippet: { title, description: 'Synced from Spotify by SyncPlay' },
  })
  ytQuotaError(res)
  if (res.status !== 200) throw new Error('YouTube playlist create failed (HTTP ' + res.status + '): ' + JSON.stringify(res.data || {}).slice(0, 200))
  return res.data.id
}

// Adds a video; returns the playlistItem id so it can be removed later.
async function ytAddVideo(ctx, token, playlistId, videoId) {
  const res = await ytRequest(ctx, token, 'POST', '/playlistItems?part=snippet', {
    snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } },
  })
  ytQuotaError(res)
  if (res.status !== 200 && res.status !== 201) throw new Error('YouTube add failed (HTTP ' + res.status + ')')
  return (res.data && res.data.id) || null
}

async function ytRemovePlaylistItem(ctx, token, playlistItemId) {
  const res = await ytRequest(ctx, token, 'DELETE', '/playlistItems?id=' + encodeURIComponent(playlistItemId))
  ytQuotaError(res)
  if (res.status !== 204 && res.status !== 200) throw new Error('YouTube remove failed (HTTP ' + res.status + ')')
  return true
}

// ── Search scoring ───────────────────────────────────────────────────────
function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenSet(s) {
  const seen = {}
  normalize(s).split(' ').forEach((t) => { if (t.length > 1) seen[t] = true })
  return seen
}

// Scores a YouTube search result against a Spotify track. Higher is better.
// Penalizes trailers/teasers and results that share no tokens with the track.
function scoreVideo(video, track) {
  const title = normalize(video.title || '')
  const channel = normalize(video.channel || '')
  const nameTokens = tokenSet(track.name)
  const artistTokens = tokenSet((track.artists || []).join(' '))
  const titleTokens = tokenSet(title)
  const channelTokens = tokenSet(channel)

  let score = 0
  Object.keys(nameTokens).forEach((t) => { if (titleTokens[t]) score += 3 })
  Object.keys(artistTokens).forEach((t) => { if (titleTokens[t]) score += 2 })
  Object.keys(artistTokens).forEach((t) => { if (channelTokens[t]) score += 2 })

  if (title.indexOf('official') !== -1) score += 1
  if (title.indexOf('audio') !== -1) score += 1
  // Trailers/teasers are false positives even when they share the song name.
  if (title.indexOf('trailer') !== -1) score -= 12
  if (title.indexOf('teaser') !== -1) score -= 12
  if (title.indexOf('lyrics') !== -1) score -= 1

  // Completely unrelated result (no shared tokens at all).
  const anyShared = Object.keys(nameTokens).some((t) => titleTokens[t]) ||
    Object.keys(artistTokens).some((t) => titleTokens[t])
  if (!anyShared && Object.keys(nameTokens).length > 0) score -= 8

  return score
}

// Returns { videoId, title, channel, score } or null when no good match.
async function findBestVideo(ctx, token, track, matchMode, quota) {
  quota.budget -= QUOTA_SEARCH
  const query = ((track.artists && track.artists[0]) || '') + ' ' + track.name
  const items = await ytSearch(ctx, token, query)

  let best = null
  let bestScore = -Infinity
  items.forEach((v) => {
    const s = scoreVideo(v, track)
    if (s > bestScore) { bestScore = s; best = v }
  })
  if (!best) return null

  const threshold = matchMode === 'strict' ? 6 : 2
  if (bestScore < threshold) return null
  return { videoId: best.videoId, title: best.title, channel: best.channel, score: bestScore }
}

// ── Sync engine ──────────────────────────────────────────────────────────
async function loadSyncState(ctx) {
  return (await ctx.config.get('_sync_state')) || {}
}

async function saveSyncState(ctx, state) {
  await ctx.config.set('_sync_state', state)
}

async function syncMapping(ctx, mapping, spotifyToken, ytToken, state, quota) {
  // source: 'liked' mirrors the Liked Songs library; anything else mirrors a
  // specific Spotify playlist by URL or ID.
  const source = mapping.source === 'liked' ? 'liked' : 'playlist'
  let sp, key
  if (source === 'liked') {
    sp = await spotifyGetLiked(ctx, spotifyToken)
    key = '__liked__'
  } else {
    const spotifyId = parseSpotifyPlaylistId(mapping.spotify_playlist)
    if (!spotifyId) return { ok: false, title: mapping.yt_title, error: 'Invalid Spotify playlist: ' + mapping.spotify_playlist }
    sp = await spotifyGetPlaylist(ctx, spotifyToken, spotifyId)
    key = spotifyId
  }
  const mstate = state[key] || { added: [], noMatch: {} }

  // Snapshot unchanged since last sync → nothing to do.
  if (mstate.spotifySnapshotId === sp.snapshot_id) {
    return { ok: true, key, title: mapping.yt_title, upToDate: true, added: 0, skipped: 0 }
  }

  let ytPlaylistId = mstate.ytPlaylistId
  if (!ytPlaylistId) {
    ytPlaylistId = await ytFindPlaylist(ctx, ytToken, mapping.yt_title)
    if (!ytPlaylistId) {
      quota.budget -= QUOTA_PLAYLIST
      ytPlaylistId = await ytCreatePlaylist(ctx, ytToken, mapping.yt_title)
    }
    mstate.ytPlaylistId = ytPlaylistId
  }

  const matchMode = mapping.match_mode || 'auto'
  const pruneRemoved = mapping.prune_removed === true

  // added tracks are mirrored permanently; noMatch tracks were deliberately
  // skipped (strict mode / weak match) and should not be re-searched.
  const alreadySynced = {}
  mstate.added.forEach((a) => { if (a.sid) alreadySynced[a.sid] = true })
  Object.keys(mstate.noMatch || {}).forEach((sid) => { alreadySynced[sid] = true })
  const toAdd = sp.tracks.filter((t) => !alreadySynced[t.id])

  const result = { ok: true, key, title: mapping.yt_title, upToDate: false, added: 0, skipped: 0, pruned: 0, unmatched: [], errors: [] }
  let completed = true

  _syncProgress.trackTotal = toAdd.length
  for (let i = 0; i < toAdd.length; i++) {
    _syncProgress.track = i + 1
    const t = toAdd[i]
    _syncProgress.lastTrack = t.name
    if (quota.budget <= QUOTA_SEARCH) {
      result.skipped += toAdd.length - i
      result.errors.push('Stopped early: YouTube quota budget exhausted')
      completed = false
      break
    }
    let found = null
    try {
      found = await findBestVideo(ctx, ytToken, t, matchMode, quota)
    } catch (e) {
      // Transient failure (network/quota) — don't persist, retry next run.
      result.skipped++
      result.errors.push(t.name + ': ' + e.message)
      continue
    }

    if (!found) {
      if (!mstate.noMatch) mstate.noMatch = {}
      mstate.noMatch[t.id] = 1
      result.skipped++
      result.unmatched.push({ name: t.name, artist: (t.artists || []).join(', ') })
      continue
    }

    try {
      quota.budget -= QUOTA_INSERT
      const playlistItemId = await ytAddVideo(ctx, ytToken, ytPlaylistId, found.videoId)
      mstate.added.push({
        sid: t.id, vid: found.videoId, pid: playlistItemId,
        title: t.name, artist: (t.artists || []).join(', '),
        ytTitle: found.title, ytChannel: found.channel, score: found.score,
      })
      result.added++
    } catch (e) {
      // Don't persist failed adds either; retry next run.
      result.skipped++
      result.errors.push(t.name + ': ' + e.message)
    }

    if (i % 3 === 2) await sleep(300) // gentle pacing to avoid rate limits
  }

  if (pruneRemoved) {
    const currentIds = {}
    sp.tracks.forEach((t) => { currentIds[t.id] = true })
    const toRemove = mstate.added.filter((a) => a.vid && a.pid && !currentIds[a.sid])
    for (let j = 0; j < toRemove.length; j++) {
      if (quota.budget <= QUOTA_DELETE) break
      quota.budget -= QUOTA_DELETE
      try {
        await ytRemovePlaylistItem(ctx, ytToken, toRemove[j].pid)
        result.pruned++
      } catch (e) { result.errors.push('prune: ' + e.message) }
    }
    const removeIds = {}
    toRemove.forEach((a) => { removeIds[a.sid] = true })
    mstate.added = mstate.added.filter((a) => !removeIds[a.sid] || !a.vid)
  }

  // Only advance the snapshot when the whole playlist was processed. If the
  // quota budget cut us short, keep the old snapshot so the next run resumes
  // with the remaining tracks instead of treating the playlist as synced.
  if (completed) mstate.spotifySnapshotId = sp.snapshot_id
  mstate.lastSyncedAt = new Date().toISOString()
  mstate.lastSyncedTitle = mapping.yt_title
  state[key] = mstate
  return result
}

async function syncAll(ctx) {
  if (_syncing) return { success: false, error: 'Sync already running' }
  _syncing = true
  _syncProgress = { phase: 'running', current: 0, total: 0, title: '', playlistTitle: '', track: 0, trackTotal: 0, lastTrack: '' }
  try {
    const spotifyToken = await getSpotifyToken(ctx)
    const ytToken = await getGoogleToken(ctx)
    if (!spotifyToken) return { success: false, error: 'Spotify is not connected. Sign in first.' }
    if (!ytToken) return { success: false, error: 'YouTube is not connected. Sign in first.' }

    const mappings = (await ctx.config.get('playlists')) || []
    const enabled = mappings.filter((m) => m.enabled !== false && m.yt_title && (m.source === 'liked' || m.spotify_playlist))
    if (!enabled.length) return { success: false, error: 'No playlists configured. Add a playlist mapping in settings.' }

    const quota = { budget: Number(await ctx.config.get('quota_budget')) || 9000 }
    const pruneGlobal = (await ctx.config.get('prune_removed')) === true
    const state = await loadSyncState(ctx)

    const results = []
    let added = 0
    let skipped = 0
    let pruned = 0
    let unmatched = 0
    const errors = []

    _syncProgress.total = enabled.length
    for (let i = 0; i < enabled.length; i++) {
      const mapping = enabled[i]
      if (mapping.prune_removed === undefined) mapping.prune_removed = pruneGlobal
      _syncProgress.current = i
      _syncProgress.playlistTitle = mapping.yt_title
      _syncProgress.track = 0
      _syncProgress.trackTotal = 0
      _syncProgress.lastTrack = ''
      try {
        const r = await syncMapping(ctx, mapping, spotifyToken, ytToken, state, quota)
        results.push(r)
        added += r.added || 0
        skipped += r.skipped || 0
        pruned += r.pruned || 0
        unmatched += (r.unmatched || []).length
        ;(r.errors || []).forEach((e) => errors.push(e))
      } catch (e) {
        results.push({ ok: false, title: mapping.yt_title, error: e.message || String(e) })
        errors.push(mapping.yt_title + ': ' + e.message)
      }
    }
    await saveSyncState(ctx, state)

    _lastSyncSummary = { at: new Date().toISOString(), added, skipped, pruned, unmatched, errors: errors.length }
    if ((await ctx.config.get('notify_on_sync')) !== false) {
      try {
        ctx.notifications.send('SyncPlay', `Synced ${results.length} playlist(s) — added ${added}, skipped ${skipped}` + (pruned ? `, pruned ${pruned}` : '') + (errors.length ? `, ${errors.length} error(s)` : ''))
      } catch (e) { /* notifications are best-effort */ }
    }
    return { success: true, results, added, skipped, pruned, unmatched, errorCount: errors.length }
  } catch (e) {
    return { success: false, error: e.message || String(e) }
  } finally {
    _syncing = false
    _syncProgress.phase = 'idle'
  }
}

// ── OAuth flow (called by the Otix settings panel) ───────────────────────
// The "Sign In" button calls data['auth.getLoginUrl'] with no args, so we use
// a small state machine: connect the first provider that has no token, then
// the other. Clicking Sign In again finishes the other one.
//   - Spotify: standalone — your own app credentials, redirects to
//     http://127.0.0.1:8765/callback where the Electron window captures `code`.
//   - Google: via Otix's own Google integration — we get the authorize URL from
//     Otix, then complete the exchange against Otix's callback endpoint.

// `hint` (optional) lets a per-provider settings card request a specific
// sign-in. Without it we keep the old state machine: connect the first provider
// that has no token, then the other.
async function dataAuthGetLoginUrl(ctx, hint) {
  const c = await getCreds(ctx)
  if (!c.spotifyClientId || !c.spotifyClientSecret) {
    return { url: null, error: 'Configure your Spotify Client ID and Secret in settings first.' }
  }

  const spotifyToken = await getSpotifyToken(ctx)
  const google = await getGoogleConnection(ctx)
  const gc = await getGoogleCreds(ctx)
  const standaloneAccess = await ctx.config.get('_google_access_token')

  let provider = null
  let googleStandalone = false
  if (hint === 'spotify') {
    if (spotifyToken) return { url: null, error: 'Spotify is already connected.' }
    provider = 'spotify'
  } else if (hint === 'google') {
    if (google.token) return { url: null, error: 'YouTube is already connected.' }
    provider = 'google'
    googleStandalone = hasGoogleCreds(gc)
  } else if (!spotifyToken) {
    provider = 'spotify'
  } else if (hasGoogleCreds(gc) && !standaloneAccess) {
    // The user configured their own Google app but hasn't linked it yet —
    // offer the standalone path even if Otix's Google is already connected.
    provider = 'google'
    googleStandalone = true
  } else if (!google.token) {
    provider = 'google'
    googleStandalone = hasGoogleCreds(gc)
  } else {
    return { url: null, error: 'Both Spotify and YouTube are connected. Use Scan to sync, or log out to reconnect.' }
  }

  if (provider === 'spotify') {
    _pending = { provider, state: '', googleStandalone: false }
    const url = SPOTIFY_AUTH_URL + '?client_id=' + encodeURIComponent(c.spotifyClientId) +
      '&redirect_uri=' + encodeURIComponent(REDIRECT_URI) +
      '&response_type=code&scope=' + encodeURIComponent(SPOTIFY_SCOPES) +
      '&state=syncplay&show_dialog=true'
    return { url, redirectPattern: '127.0.0.1:' + REDIRECT_PORT, tokenExtraction: { type: 'url-param' }, provider }
  }

  if (googleStandalone) {
    // Standalone Google OAuth — the user's own Cloud app, loopback redirect.
    _pending = { provider: 'google', state: 'syncplay', googleStandalone: true }
    const url = GOOGLE_AUTH_URL + '?client_id=' + encodeURIComponent(gc.googleClientId) +
      '&redirect_uri=' + encodeURIComponent(REDIRECT_URI) +
      '&response_type=code&scope=' + encodeURIComponent(GOOGLE_SCOPE) +
      '&access_type=offline&prompt=consent&state=syncplay'
    return { url, redirectPattern: '127.0.0.1:' + REDIRECT_PORT, tokenExtraction: { type: 'url-param' }, provider: 'google', mode: 'standalone' }
  }

  // Google via Otix — get the authorize URL from Otix (it stores + refreshes the tokens).
  let res
  try {
    res = await ctx.api.post('/auth/oauth/google')
  } catch (e) {
    return { url: null, error: 'Failed to start Google sign-in: ' + (e.message || e) }
  }
  if (!res || !res.auth_url) return { url: null, error: 'Otix did not return a Google authorization URL.' }
  _pending = { provider: 'google', state: res.state || '', googleStandalone: false }
  return { url: res.auth_url, redirectPattern: 'auth/callback/google', tokenExtraction: { type: 'url-param' }, provider: 'google', mode: 'framework' }
}

async function dataAuthHandleCallback(ctx, code) {
  if (!code) return { success: false, error: 'No authorization code received.' }
  const provider = _pending.provider
  const pendingState = _pending.state
  const googleStandalone = _pending.googleStandalone
  _pending = { provider: null, state: '', googleStandalone: false }
  if (!provider) return { success: false, error: 'No pending sign-in. Click Sign In again.' }
  try {
    if (provider === 'spotify') {
      const c = await getCreds(ctx)
      const res = await httpForm(ctx, SPOTIFY_TOKEN_URL, {
        grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI,
        client_id: c.spotifyClientId, client_secret: c.spotifyClientSecret,
      })
      if (res.status !== 200) throw new Error('Spotify token exchange failed (HTTP ' + res.status + '): ' + JSON.stringify(res.data || {}).slice(0, 200))
      await storeSpotifyTokens(ctx, res.data)
    } else if (googleStandalone) {
      // Standalone Google — exchange the code against Google's token endpoint directly.
      const gc = await getGoogleCreds(ctx)
      const res = await httpForm(ctx, GOOGLE_TOKEN_URL, {
        grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI,
        client_id: gc.googleClientId, client_secret: gc.googleClientSecret,
      })
      if (res.status !== 200) throw new Error('Google token exchange failed (HTTP ' + res.status + '): ' + JSON.stringify(res.data || {}).slice(0, 200))
      await storeGoogleTokens(ctx, res.data)
    } else {
      // Complete the Google exchange against Otix's callback endpoint, then poll
      // until Otix reports the account linked (code/state are single-use; the
      // Otix callback page may beat us to the exchange).
      let exchangeError = null
      if (code && pendingState) {
        try { await ctx.api.post('/auth/oauth/google/callback', { code, state: pendingState }) } catch (e) { exchangeError = (e.message || String(e)) }
      }
      const deadline = Date.now() + 30000
      let linked = null
      while (Date.now() < deadline) {
        linked = await getGoogleToken(ctx)
        if (linked) break
        await sleep(1000)
      }
      if (!linked) return { success: false, error: exchangeError ? 'Google link failed: ' + exchangeError : 'Timed out waiting for Google connection. Please try again.' }
    }
    try { ctx.notifications.send('SyncPlay', (provider === 'spotify' ? 'Spotify' : 'YouTube') + ' connected') } catch (e) { /* best-effort */ }
    return { success: true, provider }
  } catch (e) {
    _pending = { provider: null, state: '', googleStandalone: false }
    return { success: false, error: e.message || String(e) }
  }
}

async function dataAuthLogout(ctx) {
  _pending = { provider: null, state: '', googleStandalone: false }
  await ctx.config.set('_spotify_access_token', '')
  await ctx.config.set('_spotify_refresh_token', '')
  await ctx.config.set('_spotify_expires_at', 0)
  // Clear standalone Google tokens too (only stored when the own-app path was used).
  await ctx.config.set('_google_access_token', '')
  await ctx.config.set('_google_refresh_token', '')
  await ctx.config.set('_google_expires_at', 0)
  const messages = []
  try {
    await ctx.api.delete('/auth/oauth/google/disconnect')
    messages.push('Google disconnected')
  } catch (e) {
    messages.push('Google: ' + (e.message || e))
  }
  return { success: true, message: messages.join('; ') }
}

async function dataSpotifyListPlaylists(ctx) {
  const token = await getSpotifyToken(ctx)
  if (!token) return { success: false, error: 'Spotify is not connected.' }
  const res = await httpJson(ctx, SPOTIFY_API + '/me/playlists?limit=50', { headers: { Authorization: 'Bearer ' + token } })
  if (res.status !== 200) return { success: false, error: 'Spotify list failed (HTTP ' + res.status + ')' }
  return {
    success: true,
    playlists: (res.data.items || []).map((p) => ({
      id: p.id, name: p.name, tracks: (p.tracks && p.tracks.total) || 0, public: p.public !== false,
    })),
  }
}

// ── Exported methods ─────────────────────────────────────────────────────
const data = {
  'auth.getLoginUrl': dataAuthGetLoginUrl,
  'auth.handleCallback': dataAuthHandleCallback,
  'auth.logout': dataAuthLogout,
  'spotify.listPlaylists': dataSpotifyListPlaylists,
  'sync.now': (ctx) => syncAll(ctx),
  'sync.status': (ctx) => Object.assign({}, _syncProgress, { last: _lastSyncSummary }),
  'scan': (ctx) => syncAll(ctx),
  'scan.status': (ctx) => _syncProgress,
}

async function status(ctx) {
  const creds = await getCreds(ctx)
  const credsConfigured = hasCreds(creds)
  const credsFlag = await ctx.config.get('_spotify_creds_ok') // 'valid' | 'rejected' | undefined
  const spotifyCreds = !credsConfigured ? 'missing'
    : credsFlag === 'valid' ? 'valid'
    : credsFlag === 'rejected' ? 'rejected'
    : 'not tested'

  const spotifyToken = await getSpotifyToken(ctx)
  const google = await getGoogleConnection(ctx)
  const gc = await getGoogleCreds(ctx)
  const ownAppConfigured = hasGoogleCreds(gc)
  const mappings = (await ctx.config.get('playlists')) || []
  const enabledCount = mappings.filter((m) => m.enabled !== false && m.yt_title && (m.source === 'liked' || m.spotify_playlist)).length
  const s = !!spotifyToken
  const g = !!google.token
  const parts = [s ? 'Spotify ✓' : 'Spotify —', g ? (google.mode === 'standalone' ? 'YouTube ✓ (app)' : 'YouTube ✓ (Otix)') : 'YouTube —']

  const steps = []
  if (credsFlag === 'rejected') steps.push('Spotify rejected your credentials — fix them and retest')
  else if (!credsConfigured) steps.push('Add your Spotify Client ID + Secret below')
  else if (!s) steps.push(spotifyCreds === 'valid' ? 'Spotify creds saved — complete the Spotify sign-in to connect' : 'Spotify creds set — test connection, then sign in')
  if (s && !g) steps.push(ownAppConfigured ? 'Sign in to link your Google app' : (google.error && google.error !== 'Google not linked') ? 'Google: ' + google.error : 'Sign in to link YouTube via Otix')
  if (s && g && !enabledCount) steps.push('Add a playlist mapping below')
  const message = steps.join(' · ') || (enabledCount ? 'Ready to sync — mappings enabled' : 'Connected — add a playlist mapping below')
  const autoSync = (await ctx.config.get('auto_sync')) !== false

  const summary = {
    connected: s && g,
    authenticated: s && g,
    displayName: parts.join(' · '),
    spotify: s ? 'connected' : 'not connected',
    spotify_linked: s,
    google: g ? 'connected' : 'not connected',
    google_linked: g,
    google_source: g ? (google.mode === 'standalone' ? 'your Google app' : 'Otix account') : 'not connected',
    google_error: g ? null : (google.error || 'Google not linked'),
    spotify_creds: spotifyCreds,
    playlists: enabledCount,
    sync_mode: autoSync ? 'auto' : 'manual',
    message,
  }
  if (_lastSyncSummary) {
    summary.last_sync = { title: 'SyncPlay', direction: 'Spotify → YouTube Music', synced_at: _lastSyncSummary.at }
  }
  return summary
}

// test(ctx) — enable-time validation (must not hard-fail without config).
// test(ctx, configDraft) — "Test Connection" button (returns { success, message }).
async function test(ctx, configDraft) {
  const c = configDraft || (await getCreds(ctx))
  const missing = []
  if (!c.spotify_client_id && !c.spotifyClientId) missing.push('Spotify Client ID')
  if (!c.spotify_client_secret && !c.spotifyClientSecret) missing.push('Spotify Client Secret')

  if (configDraft) {
    // Connection test: validate Spotify creds with a client_credentials grant,
    // and confirm Google is reachable — via Otix's account or the user's own app.
    let failures = missing.map((m) => m + ' is required')
    if (missing.length === 0) {
      try {
        const res = await httpForm(ctx, SPOTIFY_TOKEN_URL, {
          grant_type: 'client_credentials',
          client_id: c.spotify_client_id,
          client_secret: c.spotify_client_secret,
        })
        if (res.status !== 200) {
          failures.push('Spotify credentials rejected (HTTP ' + res.status + '). Check your Client ID/Secret.')
          await ctx.config.set('_spotify_creds_ok', 'rejected')
        } else {
          await ctx.config.set('_spotify_creds_ok', 'valid')
        }
      } catch (e) {
        failures.push('Spotify check failed: ' + (e.message || e))
      }
    }
    const google = await getGoogleConnection(ctx)
    if (!google.token) {
      const ownApp = !!(c.google_client_id || c.googleClientId) && !!(c.google_client_secret || c.googleClientSecret)
      failures.push(ownApp ? 'YouTube is not connected — Sign In to link your Google app' : 'YouTube is not connected via Otix — Sign In to link your Google account')
    }
    return {
      success: failures.length === 0,
      message: failures.length === 0
        ? 'Spotify credentials OK · YouTube connected' + (google.mode === 'standalone' ? ' (your Google app)' : ' (Otix)')
        : failures.join('; '),
    }
  }

  return { passed: true, failures: missing.map((m) => m + ' not set yet') }
}

// Setup Guide tab content (slot `settings/syncplay/tutorial`). Informational
// only — no actions, so it renders on every host without wiring handleAction.
async function slotRender(ctx, location) {
  if (location !== 'settings/syncplay/tutorial') return { widgets: [] }

  const widgets = [
    {
      type: 'alert',
      props: {
        title: 'SyncPlay setup guide',
        message: 'SyncPlay mirrors Spotify playlists and Liked Songs into YouTube Music. Follow the steps in order — you only need the Spotify step and one of the two YouTube options.',
        variant: 'info',
      },
    },
    { type: 'divider', props: { label: 'Step 1 — Create a free Spotify app' } },
    {
      type: 'list',
      props: {
        items: [
          { key: 's1', title: 'Open the Spotify Developer Dashboard and sign in (free account)', subtitle: 'developer.spotify.com/dashboard', badge: '1' },
          { key: 's2', title: 'Click "Create app" — any Name/Description works', badge: '2' },
          { key: 's3', title: 'Add Redirect URI exactly http://127.0.0.1:8765/callback, then Save', badge: '3' },
          { key: 's4', title: 'Copy the Client ID and Client Secret from the app page', subtitle: 'Paste them into the SyncPlay form on the Settings page', badge: '4' },
        ],
        emptyText: '—',
      },
    },
    { type: 'divider', props: { label: 'Step 2 — Connect YouTube (choose one)' } },
    {
      type: 'list',
      props: {
        items: [
          { key: 'y1', title: 'Option A — via your Otix account (easiest)', subtitle: 'Leave the two Google fields blank and click Sign In. SyncPlay reuses the Google account already linked to Otix.', badge: 'Otix' },
          { key: 'y2', title: 'Option B — via your own Google Cloud app', subtitle: 'Create an OAuth Client ID at console.cloud.google.com, add the same redirect, and enable the YouTube Data API v3. Paste the Client ID + Secret below.', badge: 'Your app' },
        ],
        emptyText: '—',
      },
    },
    { type: 'divider', props: { label: 'Step 3 — Add a mapping' } },
    {
      type: 'list',
      props: {
        items: [
          { key: 'm1', title: 'Pick a Sync Source: a Spotify playlist or your Liked Songs', badge: 'A' },
          { key: 'm2', title: 'Set the YouTube Music playlist title — SyncPlay creates it if missing', badge: 'B' },
          { key: 'm3', title: 'Choose Match Mode — auto adds the best match, strict skips weak ones', badge: 'C' },
          { key: 'm4', title: 'Click Save, then hit Test Connection to verify everything', badge: 'D' },
        ],
        emptyText: '—',
      },
    },
    { type: 'divider', props: { label: 'Reference' } },
    {
      type: 'table',
      props: {
        columns: [
          { key: 'what', label: 'What' },
          { key: 'url', label: 'Where' },
        ],
        rows: [
          { key: 'spotify-dash', cells: { what: 'Spotify Developer Dashboard', url: 'developer.spotify.com/dashboard' } },
          { key: 'google-console', cells: { what: 'Google Cloud Console — Credentials', url: 'console.cloud.google.com/apis/credentials' } },
          { key: 'yt-music', cells: { what: 'YouTube Music', url: 'music.youtube.com' } },
        ],
      },
    },
  ]

  return { widgets }
}

// ── Entry point ──────────────────────────────────────────────────────────
function main(ctx) {
  ctx.logger.info('SyncPlay started')
  ctx.config.get('interval_hours').then((hours) => {
    ctx.config.get('auto_sync').then((auto) => {
      if (auto !== false && hours) {
        const h = Math.max(0.5, Number(hours) || 6)
        _autoTimer = setInterval(() => {
          syncAll(ctx).catch((e) => ctx.logger.error('SyncPlay auto-sync error: ' + (e.message || e)))
        }, h * 3600 * 1000)
        ctx.logger.info('SyncPlay auto-sync scheduled every ' + h + ' hours')
      }
    })
  })
  ctx.handle('syncplay.sync', () => syncAll(ctx))
}

main.status = status
main.test = test
main.slotRender = slotRender
main.data = data
main._internals = { parseSpotifyPlaylistId, normalize, scoreVideo } // exposed for the test harness

module.exports = main
