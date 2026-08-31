// SyncPlay dev test harness. Run with: node test.js
// Mocks ctx (in-memory config + fake Spotify/YouTube HTTP + a fake Otix
// backend for ctx.api) and exercises the plugin's data methods end-to-end
// without any real network calls.

const path = require('path')
const plugin = require(path.join(__dirname, 'main.js'))

// ── Mutable "server" state the mock fetch reads from ─────────────────────
// Spotify is standalone (user's own app): creds live in plugin config
// and tokens are exchanged against accounts.spotify.com directly.
const CREDS = { spotify_client_id: 'sp_id', spotify_client_secret: 'sp_secret' }
// Google is dual-path: through Otix (framework) or the user's own Cloud app.
const GCREDS = { google_client_id: 'g_id', google_client_secret: 'g_secret' }
let SPOTIFY_SNAPSHOT = 'snap_1'
let SPOTIFY_TRACKS = [
  { id: 't1', name: 'Blinding Lights', artists: ['The Weeknd'] },
  { id: 't2', name: 'Levitating', artists: ['Dua Lipa'] },
  { id: 't3', name: 'As It Was', artists: ['Harry Styles'] },
]
let SPOTIFY_LIKED = []      // [{ id, name, artists }]
let YT_PLAYLISTS = []       // [{ id, snippet: { title } }]
let YT_ITEMS = []           // [{ id, playlistId, videoId }]
let PI_COUNT = 0
let PL_COUNT = 0

// Search results keyed by normalized query. A track with no entry falls back
// to SEARCH_DEFAULT (unrelated results) — used to test strict mode.
const SEARCH = {
  'the weeknd blinding lights': [
    { videoId: 'vid_bl1', title: 'The Weeknd - Blinding Lights (Official Video)', channel: 'The Weeknd' },
    { videoId: 'vid_bl2', title: 'Blinding Lights - The Weeknd (Lyrics)', channel: 'SomeLyrics' },
  ],
  'dua lipa levitating': [
    { videoId: 'vid_lev', title: 'Dua Lipa - Levitating (Official Music Video) ft. DaBaby', channel: 'Dua Lipa' },
  ],
  'harry styles as it was': [
    { videoId: 'vid_aiw', title: 'Harry Styles - As It Was (Official Video)', channel: 'Harry Styles' },
  ],
}
const SEARCH_DEFAULT = [
  { videoId: 'vid_x1', title: '10 Hours of Rain Sounds', channel: 'Relax Channel' },
]

// ── Mock HTTP ────────────────────────────────────────────────────────────
function respond(status, data) {
  return { status, statusText: status === 200 ? 'OK' : 'ERR', headers: {}, body: data === undefined ? '' : JSON.stringify(data) }
}

async function mockFetch(url, init) {
  init = init || {}
  const method = (init.method || 'GET').toUpperCase()
  const u = new URL(url)

  // ── Spotify OAuth token endpoint (standalone app) ──
  if (url.startsWith('https://accounts.spotify.com/api/token')) {
    const params = new URLSearchParams(init.body)
    const grant = params.get('grant_type')
    if (grant === 'authorization_code') {
      return respond(200, { access_token: 'sp_user', refresh_token: 'sp_refresh', expires_in: 3600, token_type: 'Bearer' })
    }
    if (grant === 'refresh_token') {
      return respond(200, { access_token: 'sp_refreshed', expires_in: 3600, token_type: 'Bearer' })
    }
    if (grant === 'client_credentials') {
      if (params.get('client_id') !== 'sp_id' || params.get('client_secret') !== 'sp_secret') {
        return respond(401, { error: 'invalid_client' })
      }
      return respond(200, { access_token: 'app_token', expires_in: 3600, token_type: 'Bearer' })
    }
    throw new Error('Unhandled Spotify grant: ' + grant)
  }

  // ── Standalone Google OAuth token endpoint (user's own Cloud app) ──
  if (url.startsWith('https://oauth2.googleapis.com/token')) {
    const params = new URLSearchParams(init.body)
    const grant = params.get('grant_type')
    if (grant === 'authorization_code') {
      return respond(200, { access_token: 'g_user', refresh_token: 'g_refresh', expires_in: 3600, token_type: 'Bearer' })
    }
    if (grant === 'refresh_token') {
      return respond(200, { access_token: 'g_refreshed', expires_in: 3600, token_type: 'Bearer' })
    }
    throw new Error('Unhandled Google grant: ' + grant)
  }

  // ── Spotify API ──
  if (url.startsWith('https://api.spotify.com/v1/playlists/')) {
    const parts = u.pathname.split('/')
    if (parts.includes('tracks')) {
      const offset = Number(u.searchParams.get('offset') || 0)
      const slice = SPOTIFY_TRACKS.slice(offset, offset + 100)
      return respond(200, {
        items: slice.map((t) => ({ added_at: '2024-01-01T00:00:00Z', track: { id: t.id, name: t.name, type: 'track', artists: t.artists.map((a) => ({ name: a })) } })),
        total: SPOTIFY_TRACKS.length,
      })
    }
    return respond(200, { name: 'My Mix', snapshot_id: SPOTIFY_SNAPSHOT, tracks: { total: SPOTIFY_TRACKS.length } })
  }
  if (url.startsWith('https://api.spotify.com/v1/me/playlists')) {
    return respond(200, { items: [{ id: 'pl_1', name: 'My Mix', tracks: { total: SPOTIFY_TRACKS.length }, public: false }] })
  }
  if (url.startsWith('https://api.spotify.com/v1/me/tracks')) {
    const offset = Number(u.searchParams.get('offset') || 0)
    const limit = Number(u.searchParams.get('limit') || 50)
    const slice = SPOTIFY_LIKED.slice(offset, offset + limit)
    return respond(200, {
      items: slice.map((t) => ({ added_at: '2024-01-01T00:00:00Z', track: { id: t.id, name: t.name, type: 'track', artists: (t.artists || []).map((a) => ({ name: a })) } })),
      total: SPOTIFY_LIKED.length,
    })
  }

  // ── YouTube Data API ──
  if (url.startsWith('https://www.googleapis.com/youtube/v3/search')) {
    const q = (u.searchParams.get('q') || '').toLowerCase()
    const items = SEARCH[q] || SEARCH_DEFAULT
    return respond(200, { items: items.map((it) => ({ id: { videoId: it.videoId }, snippet: { title: it.title, channelTitle: it.channel } })) })
  }
  if (url.startsWith('https://www.googleapis.com/youtube/v3/playlists') && method === 'GET') {
    return respond(200, { items: YT_PLAYLISTS })
  }
  if (url.startsWith('https://www.googleapis.com/youtube/v3/playlists') && method === 'POST') {
    const body = JSON.parse(init.body)
    const id = 'yt_pl_' + (++PL_COUNT)
    YT_PLAYLISTS.push({ id, snippet: { title: body.snippet.title } })
    return respond(200, { id })
  }
  if (url.startsWith('https://www.googleapis.com/youtube/v3/playlistItems') && method === 'POST') {
    const body = JSON.parse(init.body)
    const id = 'pi_' + (++PI_COUNT)
    YT_ITEMS.push({ id, playlistId: body.snippet.playlistId, videoId: body.snippet.resourceId.videoId })
    return respond(200, { id, snippet: { playlistId: body.snippet.playlistId, resourceId: { videoId: body.snippet.resourceId.videoId } } })
  }
  if (url.startsWith('https://www.googleapis.com/youtube/v3/playlistItems') && method === 'DELETE') {
    YT_ITEMS = YT_ITEMS.filter((it) => it.id !== u.searchParams.get('id'))
    return respond(204, undefined)
  }

  throw new Error('Unhandled mock URL: ' + url + ' (' + method + ')')
}

// ── Mock Otix backend (ctx.api) ──────────────────────────────────────────
// Simulates the authenticated Otix API the plugin drives: integration token
// endpoints + the OAuth initiate/callback/disconnect flow. ctx.api throws on
// non-2xx just like the real bridge, so the plugin treats throws as
// "not connected". Spotify is standalone (not via Otix) — only Google
// lives behind the Otix OAuth endpoints.
let GOOGLE_LINKED = false

function resetBackend() {
  GOOGLE_LINKED = false
  SPOTIFY_LIKED = []
}

function mockApi(method, path, body) {
  method = String(method).toUpperCase()
  const fail = () => { throw new Error('API ' + method + ' ' + path + ' returned 400') }

  if (path === '/auth/oauth/google/token') {
    if (!GOOGLE_LINKED) return fail()
    return { access_token: 'yt_user' }
  }
  if (path === '/auth/oauth/google' && method === 'POST') {
    return { auth_url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=mock&response_type=code&state=st_google', state: 'st_google' }
  }
  if (path === '/auth/oauth/google/callback' && method === 'POST') {
    if (!body || !body.code || !body.state) return fail()
    GOOGLE_LINKED = true
    return { message: 'Google account linked successfully' }
  }
  if (path === '/auth/oauth/google/disconnect' && method === 'DELETE') {
    GOOGLE_LINKED = false
    return { message: 'Google account disconnected' }
  }
  throw new Error('Unhandled mock API: ' + method + ' ' + path)
}

// ── Mock ctx ─────────────────────────────────────────────────────────────
function makeCtx(initialConfig) {
  const store = new Map(Object.entries(initialConfig || {}))
  const notifications = []
  const handlers = {}
  const ctx = {
    id: 'otix-syncplay',
    manifest: { name: 'SyncPlay' },
    config: {
      getAll: async () => Object.fromEntries(store),
      get: async (k) => store.get(k),
      set: async (k, v) => { store.set(k, v) },
    },
    api: {
      get: async (p) => mockApi('GET', p),
      post: async (p, b) => mockApi('POST', p, b),
      put: async (p, b) => mockApi('PUT', p, b),
      delete: async (p) => mockApi('DELETE', p),
    },
    fetch: mockFetch,
    logger: { debug() {}, info() {}, warn() {}, error(...a) { console.log('  [log]', ...a) } },
    notifications: { send: (t, b) => notifications.push([t, b]) },
    events: { on: async () => () => {}, off: async () => {} },
    handle: (m, fn) => { handlers[m] = fn; return () => {} },
    activity: { publish: async () => {}, remove: async () => {}, clear: async () => {} },
    onDestroy: () => {},
  }
  return { ctx, store, notifications, handlers }
}

// ── Tiny test runner ─────────────────────────────────────────────────────
let passed = 0
let failed = 0
const failures = []

async function check(name, fn) {
  try {
    await fn()
    passed++
    console.log('  PASS  ' + name)
  } catch (e) {
    failed++
    failures.push(name + ': ' + (e && e.stack ? e.stack : e))
    console.log('  FAIL  ' + name + ' — ' + (e && e.message ? e.message : e))
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed')
}

// ── Tests ────────────────────────────────────────────────────────────────
async function testParseSpotifyPlaylistId() {
  const { parseSpotifyPlaylistId } = plugin._internals
  assert(parseSpotifyPlaylistId('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M') === '37i9dQZF1DXcBWIGoYBM5M', 'URL form')
  assert(parseSpotifyPlaylistId('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc&pt=a1b2') === '37i9dQZF1DXcBWIGoYBM5M', 'URL with params')
  assert(parseSpotifyPlaylistId('37i9dQZF1DXcBWIGoYBM5M') === '37i9dQZF1DXcBWIGoYBM5M', 'bare ID')
  assert(parseSpotifyPlaylistId('https://open.spotify.com/track/abc') === null, 'track URL rejected')
  assert(parseSpotifyPlaylistId('') === null, 'empty rejected')
}

async function testScoring() {
  const { normalize, scoreVideo } = plugin._internals
  assert(normalize('Harry Styles - As It Was (Official Video)') === 'harry styles as it was official video', 'normalize')

  const track = { name: 'Blinding Lights', artists: ['The Weeknd'] }
  const official = { videoId: 'x', title: 'The Weeknd - Blinding Lights (Official Video)', channel: 'The Weeknd' }
  const lyrics = { videoId: 'y', title: 'Blinding Lights - The Weeknd (Lyrics)', channel: 'LyricsHQ' }
  const trailer = { videoId: 'z', title: 'Blinding Lights Movie Trailer (2024)', channel: 'Film Studio' }
  const unrelated = { videoId: 'w', title: '10 Hours of Rain Sounds', channel: 'Relax Channel' }

  const sOfficial = scoreVideo(official, track)
  const sLyrics = scoreVideo(lyrics, track)
  const sTrailer = scoreVideo(trailer, track)
  const sUnrelated = scoreVideo(unrelated, track)
  assert(sOfficial > sLyrics, 'official beats lyrics (' + sOfficial + ' vs ' + sLyrics + ')')
  assert(sTrailer < 0, 'trailer penalized (' + sTrailer + ')')
  assert(sUnrelated < 0, 'unrelated penalized (' + sUnrelated + ')')
  assert(sOfficial > 6, 'official match is strong (' + sOfficial + ')')
}

async function testOAuthStateMachine() {
  resetBackend()
  const { ctx } = makeCtx(CREDS)
  plugin(ctx) // entry point

  // Without creds configured, no login URL is offered.
  const noCreds = await plugin.data['auth.getLoginUrl'](makeCtx().ctx)
  assert(!noCreds.url && noCreds.error, 'missing creds blocks login with a message')

  // First login is standalone Spotify (own app creds, loopback redirect).
  const url1 = await plugin.data['auth.getLoginUrl'](ctx)
  assert(url1.url && url1.provider === 'spotify', 'first login is spotify')
  assert(url1.url.indexOf('accounts.spotify.com/authorize') !== -1, 'spotify authorize url')
  assert(url1.url.indexOf('client_id=sp_id') !== -1, 'client id in authorize url')
  assert(url1.redirectPattern === '127.0.0.1:8765', 'spotify loopback redirect pattern')
  assert(url1.tokenExtraction && url1.tokenExtraction.type === 'url-param', 'url-param extraction')

  // Exchange the code against accounts.spotify.com → tokens stored in plugin config.
  const cb1 = await plugin.data['auth.handleCallback'](ctx, 'sp_code')
  assert(cb1.success === true, 'spotify callback succeeds')
  assert((await ctx.config.get('_spotify_access_token')) === 'sp_user', 'spotify access token stored')
  assert((await ctx.config.get('_spotify_refresh_token')) === 'sp_refresh', 'spotify refresh token stored')

  // Second login is Google via the Otix OAuth flow.
  const url2 = await plugin.data['auth.getLoginUrl'](ctx)
  assert(url2.url && url2.provider === 'google', 'second login is google')
  assert(url2.redirectPattern === 'auth/callback/google', 'google redirect pattern')
  const cb2 = await plugin.data['auth.handleCallback'](ctx, 'g_code')
  assert(cb2.success === true && GOOGLE_LINKED === true, 'google linked via otix callback')

  const url3 = await plugin.data['auth.getLoginUrl'](ctx)
  assert(!url3.url, 'no third login when both connected')

  const st = await plugin.status(ctx)
  assert(st.connected === true, 'status connected')
  assert(st.spotify === 'connected' && st.google === 'connected', 'status shows both connected')
  assert(st.google_linked === true, 'google_linked true when connected via Otix account')
  assert(st.google_source === 'Otix account', 'google source reports Otix account')
}

async function testGoogleStandaloneFlow() {
  resetBackend()
  // Configure the user's own Google Cloud app AND pre-link Otix's Google —
  // configured-but-unlinked standalone creds should win the login flow.
  const { ctx } = makeCtx(Object.assign({}, CREDS, GCREDS))
  GOOGLE_LINKED = true
  await plugin.data['auth.getLoginUrl'](ctx)
  await plugin.data['auth.handleCallback'](ctx, 'sp_code')

  const url = await plugin.data['auth.getLoginUrl'](ctx)
  assert(url.url && url.provider === 'google' && url.mode === 'standalone', 'standalone google offered over linked otix account')
  assert(url.redirectPattern === '127.0.0.1:8765', 'standalone google loopback redirect')
  assert(url.url.indexOf('accounts.google.com') !== -1, 'google authorize url')
  assert(url.url.indexOf('client_id=g_id') !== -1, 'google client id in authorize url')

  // Exchange the code against Google's token endpoint → tokens in plugin config.
  const cb = await plugin.data['auth.handleCallback'](ctx, 'g_code')
  assert(cb.success === true, 'standalone google callback succeeds')
  assert((await ctx.config.get('_google_access_token')) === 'g_user', 'standalone google access token stored')
  assert((await ctx.config.get('_google_refresh_token')) === 'g_refresh', 'standalone google refresh token stored')

  const st = await plugin.status(ctx)
  assert(st.connected === true, 'status connected with standalone google')
  assert(st.google_source === 'your Google app', 'status reports own Google app')
  assert(st.displayName.indexOf('(app)') !== -1, 'display name shows standalone app')

  // No further login is offered once both providers are connected.
  const again = await plugin.data['auth.getLoginUrl'](ctx)
  assert(!again.url, 'no login when spotify + standalone google connected')
}

async function testGoogleStandaloneRefresh() {
  resetBackend()
  const { ctx } = makeCtx(Object.assign({}, CREDS, GCREDS))
  await ctx.config.set('_spotify_access_token', 'sp_user')
  await ctx.config.set('_spotify_expires_at', Date.now() + 3600000)
  // Expired standalone Google token + refresh token → auto-refresh in place.
  await ctx.config.set('_google_access_token', 'old_g')
  await ctx.config.set('_google_refresh_token', 'g_refresh')
  await ctx.config.set('_google_expires_at', Date.now() - 60000)

  const st = await plugin.status(ctx)
  assert(st.google === 'connected' && st.google_source === 'your Google app', 'standalone google auto-refreshed')
  assert((await ctx.config.get('_google_access_token')) === 'g_refreshed', 'google access token refreshed in place')
}

async function testSpotifyTokenRefresh() {
  resetBackend()
  const { ctx } = makeCtx(CREDS)

  // No tokens at all → Spotify disconnected.
  const st0 = await plugin.status(ctx)
  assert(st0.connected === false, 'disconnected when nothing linked')
  assert(st0.spotify === 'not connected' && st0.google === 'not connected', 'both providers shown disconnected')

  // Expired access token + valid refresh token → auto-refresh on next status read.
  await ctx.config.set('_spotify_access_token', 'old')
  await ctx.config.set('_spotify_refresh_token', 'sp_refresh')
  await ctx.config.set('_spotify_expires_at', Date.now() - 60000)
  const st1 = await plugin.status(ctx)
  assert(st1.spotify === 'connected', 'expired token auto-refreshed → spotify connected')
  assert(st1.connected === false, 'google still disconnected')
  assert((await ctx.config.get('_spotify_access_token')) === 'sp_refreshed', 'access token refreshed in place')

  GOOGLE_LINKED = true
  const st2 = await plugin.status(ctx)
  assert(st2.connected === true && st2.google === 'connected', 'both linked → fully connected')
}

async function testLogout() {
  resetBackend()
  const { ctx } = makeCtx(Object.assign({}, CREDS, GCREDS))
  await ctx.config.set('_spotify_access_token', 'sp_user')
  await ctx.config.set('_spotify_refresh_token', 'sp_refresh')
  await ctx.config.set('_spotify_expires_at', Date.now() + 3600000)
  // Standalone Google tokens present too — logout must clear both paths.
  await ctx.config.set('_google_access_token', 'g_user')
  await ctx.config.set('_google_refresh_token', 'g_refresh')
  await ctx.config.set('_google_expires_at', Date.now() + 3600000)
  GOOGLE_LINKED = true
  assert((await plugin.status(ctx)).connected === true, 'starts connected')

  const r = await plugin.data['auth.logout'](ctx)
  assert(r.success === true, 'logout succeeds')
  assert((await ctx.config.get('_spotify_access_token')) === '', 'spotify access token cleared')
  assert((await ctx.config.get('_spotify_expires_at')) === 0, 'spotify expiry cleared')
  assert((await ctx.config.get('_google_access_token')) === '', 'standalone google access token cleared')
  assert((await ctx.config.get('_google_expires_at')) === 0, 'standalone google expiry cleared')
  assert(GOOGLE_LINKED === false, 'google disconnected via otix')

  const st = await plugin.status(ctx)
  assert(st.connected === false, 'status disconnected after logout')
}

async function testSyncAddsAndDedupes() {
  SPOTIFY_SNAPSHOT = 'snap_1'
  SPOTIFY_TRACKS = [
    { id: 't1', name: 'Blinding Lights', artists: ['The Weeknd'] },
    { id: 't2', name: 'Levitating', artists: ['Dua Lipa'] },
    { id: 't3', name: 'As It Was', artists: ['Harry Styles'] },
  ]
  YT_PLAYLISTS = []
  YT_ITEMS = []
  PI_COUNT = 0
  PL_COUNT = 0

  resetBackend()
  const { ctx, notifications } = makeCtx(Object.assign({}, CREDS, {
    playlists: [{ enabled: true, spotify_playlist: 'https://open.spotify.com/playlist/abc123abc123abc123abc1', yt_title: 'My Mix', match_mode: 'auto' }],
    auto_sync: false,
    notify_on_sync: true,
  }))
  // Link both providers: standalone Spotify OAuth, then Google via Otix.
  await plugin.data['auth.getLoginUrl'](ctx)
  await plugin.data['auth.handleCallback'](ctx, 'sp_code')
  await plugin.data['auth.getLoginUrl'](ctx)
  await plugin.data['auth.handleCallback'](ctx, 'g_code')

  // First sync → all 3 added
  const r1 = await plugin.data['scan'](ctx)
  assert(r1.success === true, 'first sync succeeds')
  assert(r1.added === 3, 'first sync adds 3 tracks (got ' + r1.added + ')')
  assert(r1.results[0].upToDate === false, 'first sync not up-to-date')
  assert(YT_PLAYLISTS.length === 1 && YT_PLAYLISTS[0].snippet.title === 'My Mix', 'target playlist created')
  assert(YT_ITEMS.length === 3, '3 videos added to yt playlist')
  assert(notifications.length >= 1, 'completion notification sent')

  // Same snapshot → up to date, no new work
  const r2 = await plugin.data['scan'](ctx)
  assert(r2.success && r2.results[0].upToDate === true, 'second sync is up-to-date')
  assert(YT_ITEMS.length === 3, 'no duplicates after up-to-date sync')

  // Add a track + new snapshot → only the new track is added
  SPOTIFY_TRACKS.push({ id: 't4', name: 'Save Your Tears', artists: ['The Weeknd'] })
  SPOTIFY_SNAPSHOT = 'snap_2'
  SEARCH['the weeknd save your tears'] = [
    { videoId: 'vid_syt', title: 'The Weeknd - Save Your Tears (Official Video)', channel: 'The Weeknd' },
  ]
  const r3 = await plugin.data['scan'](ctx)
  assert(r3.added === 1, 'third sync adds exactly 1 new track (got ' + r3.added + ')')
  assert(YT_ITEMS.length === 4, 'playlist grew to 4')

  // A track whose search returns unrelated results + strict mode → skipped
  SPOTIFY_TRACKS.push({ id: 't5', name: 'Obscure Indie Gem', artists: ['Unknown Band'] })
  SPOTIFY_SNAPSHOT = 'snap_3'
  SEARCH['unknown band obscure indie gem'] = SEARCH_DEFAULT
  await ctx.config.set('playlists', [{
    enabled: true, spotify_playlist: 'abc123abc123abc123abc1', yt_title: 'My Mix', match_mode: 'strict',
  }])
  const r4 = await plugin.data['scan'](ctx)
  assert(r4.results[0].added === 0, 'strict mode adds nothing for weak match')
  assert((r4.results[0].skipped || 0) === 1, 'strict mode skips weak match')
  assert(YT_ITEMS.length === 4, 'playlist unchanged after strict skip')
  assert((r4.results[0].unmatched || []).length === 1, 'unmatched reported')
}

async function testQuotaInterruptionResumes() {
  SPOTIFY_SNAPSHOT = 'snap_q'
  SPOTIFY_TRACKS = [
    { id: 'q1', name: 'Blinding Lights', artists: ['The Weeknd'] },
    { id: 'q2', name: 'Levitating', artists: ['Dua Lipa'] },
    { id: 'q3', name: 'As It Was', artists: ['Harry Styles'] },
  ]
  YT_PLAYLISTS = []
  YT_ITEMS = []
  PI_COUNT = 0
  PL_COUNT = 0

  resetBackend()
  const { ctx } = makeCtx(Object.assign({}, CREDS, {
    playlists: [{ enabled: true, spotify_playlist: 'abc123abc123abc123abc1', yt_title: 'My Mix', match_mode: 'auto' }],
    auto_sync: false,
    quota_budget: 250, // enough for 1 search + 1 insert, not the rest
  }))
  // Link both providers: standalone Spotify OAuth, then Google via Otix.
  await plugin.data['auth.getLoginUrl'](ctx)
  await plugin.data['auth.handleCallback'](ctx, 'sp_code')
  await plugin.data['auth.getLoginUrl'](ctx)
  await plugin.data['auth.handleCallback'](ctx, 'g_code')

  // Run 1: quota runs out partway → 1 added, remaining deferred, snapshot NOT advanced.
  const r1 = await plugin.data['scan'](ctx)
  assert(r1.success === true, 'quota-limited run succeeds')
  assert(r1.added === 1, 'first run adds 1 track before quota (got ' + r1.added + ')')
  assert(YT_ITEMS.length === 1, 'one video added in partial run')

  // Run 2: full budget → resumes with the remaining 2, no duplicates.
  await ctx.config.set('quota_budget', 9000)
  const r2 = await plugin.data['scan'](ctx)
  assert(r2.added === 2, 'second run adds the remaining 2 (got ' + r2.added + ')')
  assert(YT_ITEMS.length === 3, 'total of 3 videos, no duplicates')

  // Run 3: now up to date.
  const r3 = await plugin.data['scan'](ctx)
  assert(r3.results[0].upToDate === true, 'third run up-to-date after resume')
}

async function testLikedSongsSync() {
  resetBackend()
  SPOTIFY_LIKED = [
    { id: 'lk1', name: 'Song One', artists: ['Artist A'] },
    { id: 'lk2', name: 'Song Two', artists: ['Artist B'] },
  ]
  SEARCH['artist a song one'] = [{ videoId: 'vid_lk1', title: 'Song One', channel: 'Artist A' }]
  SEARCH['artist b song two'] = [{ videoId: 'vid_lk2', title: 'Song Two', channel: 'Artist B' }]
  YT_PLAYLISTS = []
  YT_ITEMS = []
  PI_COUNT = 0
  PL_COUNT = 0

  const { ctx } = makeCtx(Object.assign({}, CREDS, {
    playlists: [{ enabled: true, source: 'liked', yt_title: 'Liked Mix', match_mode: 'auto' }],
    auto_sync: false,
    notify_on_sync: false,
  }))
  // Link providers: standalone Spotify OAuth, then Google via Otix.
  await plugin.data['auth.getLoginUrl'](ctx)
  await plugin.data['auth.handleCallback'](ctx, 'sp_code')
  await plugin.data['auth.getLoginUrl'](ctx)
  await plugin.data['auth.handleCallback'](ctx, 'g_code')

  // First sync mirrors all liked songs.
  const r1 = await plugin.data['scan'](ctx)
  assert(r1.success === true, 'liked-songs sync succeeds')
  assert(r1.added === 2, 'first liked-songs sync adds both tracks (got ' + r1.added + ')')
  assert(YT_PLAYLISTS.length === 1 && YT_PLAYLISTS[0].snippet.title === 'Liked Mix', 'liked target playlist created')
  assert(YT_ITEMS.length === 2, '2 videos added from liked songs')

  // Unchanged → up to date.
  const r2 = await plugin.data['scan'](ctx)
  assert(r2.success && r2.results[0].upToDate === true, 'unchanged liked songs are up-to-date')
  assert(YT_ITEMS.length === 2, 'no duplicates after up-to-date liked sync')

  // Newly liked track → added on the next run.
  SPOTIFY_LIKED.push({ id: 'lk3', name: 'Song Three', artists: ['Artist C'] })
  SEARCH['artist c song three'] = [{ videoId: 'vid_lk3', title: 'Song Three', channel: 'Artist C' }]
  const r3 = await plugin.data['scan'](ctx)
  assert(r3.added === 1, 'newly liked song added (got ' + r3.added + ')')
  assert(YT_ITEMS.length === 3, 'liked mirror grew to 3')
}

async function testSpotifyListPlaylists() {
  resetBackend()
  const { ctx } = makeCtx(CREDS)
  await ctx.config.set('_spotify_access_token', 'sp_user')
  await ctx.config.set('_spotify_expires_at', Date.now() + 3600000)
  const r = await plugin.data['spotify.listPlaylists'](ctx)
  assert(r.success === true, 'list playlists succeeds')
  assert(r.playlists[0].id === 'pl_1' && r.playlists[0].name === 'My Mix', 'playlist listing shape')
}

async function testStatusShapes() {
  resetBackend()
  const { ctx } = makeCtx()
  let st = await plugin.status(ctx)
  assert(st.connected === false, 'disconnected status when no integrations linked')
  assert(st.authenticated === false, 'not authenticated')
  assert(typeof st.displayName === 'string', 'displayName present')
  assert(st.spotify_creds === 'missing', 'creds reported missing when unset')
  assert(st.google_linked === false, 'google_linked false when nothing connected')
  assert(st.google_source === 'not connected', 'google source not connected')
  assert(st.sync_mode === 'auto', 'sync mode defaults to auto')

  // Creds present but never tested → "not tested".
  ctx.config.set('spotify_client_id', CREDS.spotify_client_id)
  ctx.config.set('spotify_client_secret', CREDS.spotify_client_secret)
  st = await plugin.status(ctx)
  assert(st.spotify_creds === 'not tested', 'creds reported not tested when set but unverified')

  // Persisted validity flag drives the reported creds state + message hint.
  ctx.config.set('_spotify_creds_ok', 'valid')
  st = await plugin.status(ctx)
  assert(st.spotify_creds === 'valid', 'creds reported valid after successful test')
  ctx.config.set('_spotify_creds_ok', 'rejected')
  st = await plugin.status(ctx)
  assert(st.spotify_creds === 'rejected', 'creds reported rejected after failed test')
  assert(st.message.indexOf('rejected') !== -1, 'message hints at rejected creds')
}

async function testTestMethod() {
  resetBackend()
  const { ctx } = makeCtx()
  // Enable-time: no config draft → passes without hard dependency on integrations.
  const enable = await plugin.test(ctx)
  assert(enable.passed === true, 'enable test passes')

  // Config draft with valid Spotify creds + Google linked → success.
  GOOGLE_LINKED = true
  const ok = await plugin.test(ctx, CREDS)
  assert(ok.success === true, 'test connection passes with valid creds + google linked')

  // Config draft missing creds → failure naming them.
  resetBackend()
  GOOGLE_LINKED = true
  const bad = await plugin.test(ctx, {})
  assert(bad.success === false, 'test connection fails when creds missing')
  assert(bad.message.indexOf('Spotify Client ID') !== -1, 'message names Spotify Client ID')
  assert(bad.message.indexOf('Spotify Client Secret') !== -1, 'message names Spotify Client Secret')

  // Config draft with invalid Spotify creds → credentials rejected + flag persisted.
  resetBackend()
  GOOGLE_LINKED = true
  const badCreds = await plugin.test(ctx, { spotify_client_id: 'bad_id', spotify_client_secret: 'bad_secret' })
  assert(badCreds.success === false && badCreds.message.indexOf('rejected') !== -1, 'bad spotify creds rejected: ' + badCreds.message)
  assert((await ctx.config.get('_spotify_creds_ok')) === 'rejected', 'rejected creds flag persisted')
  // Once the bad creds are actually saved to config, status surfaces the rejection.
  await ctx.config.set('spotify_client_id', 'bad_id')
  await ctx.config.set('spotify_client_secret', 'bad_secret')
  assert((await plugin.status(ctx)).spotify_creds === 'rejected', 'status reflects rejected creds')

  // Valid creds (accepted) → flag persisted as valid.
  resetBackend()
  GOOGLE_LINKED = true
  const goodCreds = await plugin.test(ctx, CREDS)
  assert(goodCreds.success === true, 'valid creds pass')
  assert((await ctx.config.get('_spotify_creds_ok')) === 'valid', 'valid creds flag persisted')

  // Valid creds but Google not linked → failure naming YouTube (Otix path).
  resetBackend()
  const noGoogle = await plugin.test(ctx, CREDS)
  assert(noGoogle.success === false, 'test fails when google not connected')
  assert(noGoogle.message.indexOf('YouTube') !== -1 && noGoogle.message.indexOf('Otix') !== -1, 'message names YouTube via Otix')

  // Valid creds + own Google app configured but not linked → failure naming the app.
  resetBackend()
  const noApp = await plugin.test(ctx, Object.assign({}, CREDS, GCREDS))
  assert(noApp.success === false, 'test fails when own google app not linked')
  assert(noApp.message.indexOf('Google app') !== -1, 'message points at the google app')

  // Valid creds + own Google app linked (standalone token stored) → success reports the app.
  resetBackend()
  const appCtx = makeCtx(Object.assign({}, CREDS, GCREDS))
  await appCtx.ctx.config.set('_google_access_token', 'g_user')
  await appCtx.ctx.config.set('_google_refresh_token', 'g_refresh')
  await appCtx.ctx.config.set('_google_expires_at', Date.now() + 3600000)
  const withApp = await plugin.test(appCtx.ctx, Object.assign({}, CREDS, GCREDS))
  assert(withApp.success === true && withApp.message.indexOf('your Google app') !== -1, 'test passes via standalone app: ' + withApp.message)
}

// Minimal widget-schema guard mirroring the host's widget-catalog validation.
const WIDGET_REQUIRED = {
  alert: ['title', 'message'],
  badge: ['label'],
  button: ['label', 'action'],
  divider: ['label'],
  list: ['items'],
  select: ['options'],
  table: ['columns', 'rows'],
  form: ['fields', 'action'],
}
function assertWidgetShape(widget, path) {
  assert(widget && typeof widget === 'object' && typeof widget.type === 'string', path + ' has a type')
  const req = WIDGET_REQUIRED[widget.type]
  if (req) {
    for (const f of req) {
      assert(widget.props && widget.props[f] !== undefined, path + ' props.' + f + ' required for ' + widget.type)
    }
  }
}

async function testSlotRender() {
  const { ctx } = makeCtx()
  const out = await plugin.slotRender(ctx, 'settings/syncplay/tutorial')
  assert(Array.isArray(out.widgets) && out.widgets.length > 0, 'tutorial slot returns widgets')
  out.widgets.forEach((w, i) => assertWidgetShape(w, 'widget[' + i + ']'))
  const types = out.widgets.map((w) => w.type)
  assert(types.indexOf('alert') !== -1 && types.indexOf('divider') !== -1, 'tutorial has alert + dividers')
  assert(types.indexOf('list') !== -1 && types.indexOf('table') !== -1, 'tutorial has list + table')

  const empty = await plugin.slotRender(ctx, 'settings/syncplay/other')
  assert(Array.isArray(empty.widgets) && empty.widgets.length === 0, 'unrelated slot returns no widgets')
  const empty2 = await plugin.slotRender(ctx, 'anywhere-else')
  assert(Array.isArray(empty2.widgets) && empty2.widgets.length === 0, 'non-tutorial location returns no widgets')
}

async function main() {
  console.log('\nSyncPlay test harness')
  console.log('──────────────────────')
  await check('parseSpotifyPlaylistId', testParseSpotifyPlaylistId)
  await check('scoreVideo', testScoring)
  await check('OAuth state machine (hybrid auth)', testOAuthStateMachine)
  await check('standalone google flow', testGoogleStandaloneFlow)
  await check('standalone google refresh', testGoogleStandaloneRefresh)
  await check('spotify token refresh', testSpotifyTokenRefresh)
  await check('logout clears tokens + otix google', testLogout)
  await check('sync add + dedupe + strict', testSyncAddsAndDedupes)
  await check('quota interruption resumes', testQuotaInterruptionResumes)
  await check('liked songs sync', testLikedSongsSync)
  await check('spotify.listPlaylists', testSpotifyListPlaylists)
  await check('status shapes', testStatusShapes)
  await check('test() dual shapes', testTestMethod)
  await check('slotRender tutorial widgets', testSlotRender)

  console.log('\n' + passed + ' passed, ' + failed + ' failed')
  if (failures.length) {
    console.log('\nFailures:')
    failures.forEach((f) => console.log('  - ' + f.split('\n')[0]))
    process.exit(1)
  }
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
