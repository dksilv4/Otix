/**
 * Real end-to-end scan test for the Radarr plugin's local-catalog sync.
 *
 * Runs under Electron (better-sqlite3 is compiled for Electron's ABI):
 *   cd desktop && ./node_modules/.bin/electron scripts/radarr-scan-test.js
 *
 * Exercises real code end-to-end — no module mocks:
 *   - the real migration chain (dist/db) creating the shared `media` table
 *   - the real SQL security boundary (validateAndPrepareSql in worker-bridge)
 *   - the real Radarr plugin (main.js) scanning a mock Radarr server over HTTP
 *     into the local media table, plus the offline-pause / recovery path
 *
 * Exits 0 on full pass, 1 on any failure.
 */

const path = require('path')
const fs = require('fs')
const os = require('os')
const http = require('http')

const DIST = path.resolve(__dirname, '..', 'dist')
const PLUGIN_PATH = path.resolve(__dirname, '..', '..', 'extensions', 'plugins', 'radarr', 'main.js')

let failures = 0
function check(name, cond, detail) {
  if (cond) {
    console.log(`  PASS ${name}`)
  } else {
    failures++
    console.error(`  FAIL ${name}${detail ? ' — ' + detail : ''}`)
  }
}

// ── Mock Radarr server ─────────────────────────────────────────────────

const MOVIES = [
  {
    id: 1,
    title: 'The Matrix',
    year: 1999,
    tmdbId: 603,
    overview: 'A computer hacker learns reality is a simulation.',
    runtime: 136,
    rating: 8.7,
    path: '/movies/The Matrix (1999)',
    genres: ['Action', 'Sci-Fi'],
    images: [
      { coverType: 'poster', url: '/posters/603.jpg', remoteUrl: 'https://image.tmdb.org/t/p/w500/poster603.jpg' },
      { coverType: 'fanart', url: '/backdrops/603.jpg', remoteUrl: 'https://image.tmdb.org/t/p/original/backdrop603.jpg' },
    ],
  },
  {
    id: 2,
    title: 'Dune: Part Two',
    year: 2024,
    tmdbId: 693134,
    overview: 'Paul Atreides unites with the Fremen.',
    runtime: 166,
    rating: 8.5,
    path: '/movies/Dune Part Two (2024)',
    genres: ['Adventure', 'Sci-Fi'],
    images: [],
  },
  { id: 3, title: 'No TMDB Movie', year: 2020, tmdbId: null, path: '/movies/No Tmdb Movie', images: [] },
]

const API_KEY = 'test-api-key'

// Mutable Radarr download queue — the mock returns whatever the test sets so
// the download-status sync can be driven through create → progress → complete.
let QUEUE = []
function setQueue(items) {
  QUEUE = items
}

function startMockServer() {
  const server = http.createServer((req, res) => {
    if (req.headers['x-api-key'] !== API_KEY) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end('{"error":"Unauthorized"}')
      return
    }
    const url = req.url || ''
    const method = req.method || 'GET'
    if (method === 'POST' && url === '/api/v3/movie') {
      res.writeHead(201, { 'Content-Type': 'application/json' })
      res.end('{}')
      return
    }
    if (url.startsWith('/api/v3/movie/lookup/tmdb')) {
      const tmdbId = new URL('http://mock' + url).searchParams.get('tmdbId')
      let body = '{}'
      if (tmdbId === '603') body = JSON.stringify({ title: 'The Matrix', year: 1999, tmdbId: 603, images: [] })
      else if (tmdbId === '999') body = JSON.stringify({ id: 555, title: 'Already Owned Movie', year: 2010, tmdbId: 999, images: [] })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(body)
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    if (url === '/api/v3/movie') res.end(JSON.stringify(MOVIES))
    else if (url === '/api/v3/system/status') res.end(JSON.stringify({ version: '4.0.0' }))
    else if (url.startsWith('/api/v3/queue')) res.end(JSON.stringify({ records: QUEUE }))
    else res.end('{}')
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port })
    })
  })
}

// ── ctx implementation (mirrors the worker-bridge RPC contract) ────────

function makeCtx(db, instances, fetchImpl, prepare) {
  const configStore = { instances, pollIntervalMinutes: 0 }
  return {
    fetch: fetchImpl,
    logger: {
      info: (...a) => console.log('[radarr]', ...a),
      warn: (...a) => console.warn('[radarr:WARN]', ...a),
      error: (...a) => console.error('[radarr:ERROR]', ...a),
    },
    config: {
      get: async (k) => configStore[k],
      getAll: async () => configStore,
      set: async (k, v) => { configStore[k] = v },
    },
    db: {
      run: async (sql, params) => prepare(db, sql, params).run(...(params || [])),
      get: async (sql, params) => prepare(db, sql, params).get(...(params || [])) || null,
      all: async (sql, params) => prepare(db, sql, params).all(...(params || [])),
    },
    events: { on: async () => () => {}, off: async () => {} },
    activity: { publish: async () => {}, remove: async () => {}, clear: async () => {} },
    notifications: { send: async () => {} },
    // Real download framework — mirrors the worker RPC surface (worker.ts).
    // Runs against the same real otix.db, so Radarr downloads land in the
    // shared `downloads` table exactly as they do in production.
    downloads: (() => {
      const dl = require(path.join(DIST, 'downloads', 'index'))
      return {
        getHistory: () => dl.getUserDownloads(),
        getDownload: (id) => dl.getDownload(id),
        getConfig: () => dl.getConfig(),
        queueItem: (data) =>
          dl.createDownload(
            (data && data.userId) || '',
            (data && data.mediaItemId) || null,
            (data && data.mediaItemTitle) || null,
            (data && data.nzbTitle) || '',
            (data && data.nzbSize) || 0,
            (data && data.nzbUrl) || '',
            (data && data.sabnzbdNzoId) || null,
            (data && data.source) || null,
          ),
        updateStatus: (id, status, errorMessage, percentage) =>
          dl.updateDownloadStatus(id, status, errorMessage, percentage),
        delete: (id) => dl.deleteDownload(id),
      }
    })(),
  }
}

// Real security boundary — same functions worker-bridge uses in production.
function makePreparer() {
  const { isSafeStatement, extractTableNames } = require(path.join(DIST, 'db', 'sql-validator'))
  const { replaceTableNames } = require(path.join(DIST, 'db', 'plugins-db'))
  const manifest = JSON.parse(
    fs.readFileSync(path.resolve(PLUGIN_PATH, '..', 'manifest.json'), 'utf8'),
  )
  const pluginId = 'radarr'
  const dbConfig = { tables: manifest.db.tables }
  return function prepare(db, sql, params) {
    if (!isSafeStatement(sql)) throw new Error('SQL statement rejected: contains unsafe operations')
    for (const table of extractTableNames(sql)) {
      if (dbConfig.tables[table]) continue // declared own table
      if (table.startsWith(`${pluginId}_`)) continue // already namespaced
      if (table !== 'media') {
        throw new Error(`Permission denied: access to table "${table}"`)
      }
      // `media` is the shared catalog table — granted to radarr (SYSTEM_TABLE_GRANTS).
    }
    const finalSql = replaceTableNames(sql, pluginId, dbConfig)
    return db.prepare(finalSql)
  }
}

// ctx.fetch — real HTTP against the mock server; mirrors worker-bridge's
// { status, headers, body: string } contract (network errors reject).
function makeFetchImpl() {
  return function fetchImpl(url, opts) {
    return new Promise((resolve, reject) => {
      const u = new URL(url)
      const mod = u.protocol === 'https:' ? require('https') : require('http')
      const headers = Object.assign({}, (opts && opts.headers) || {})
      const req = mod.request(
        u,
        { method: (opts && opts.method) || 'GET', headers },
        (res) => {
          let body = ''
          res.setEncoding('utf8')
          res.on('data', (c) => (body += c))
          res.on('end', () =>
            resolve({ status: res.statusCode, statusText: res.statusMessage, headers: res.headers, body }),
          )
        },
      )
      req.on('error', reject)
      if (opts && opts.body !== undefined) req.write(opts.body)
      req.end()
    })
  }
}

function instance(port, enabled = true, id = 'mock', name = 'Mock Server') {
  return {
    id,
    name,
    host: '127.0.0.1',
    port,
    useSsl: false,
    baseUrl: '',
    apiKey: API_KEY,
    enabled,
    qualityProfile: 'Any',
    rootFolder: '/movies',
  }
}

// ── main ────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== Radarr local-catalog scan test ===\n')

  const { app } = require('electron')
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'radarr-scan-'))
  app.setPath('userData', tempDir)
  console.log(`userData → ${tempDir}`)

  // Real migrations — creates the shared `media` table in tempDir/otix.db.
  const { initDatabase } = require(path.join(DIST, 'db', 'index'))
  await initDatabase()
  const { getDb } = require(path.join(DIST, 'db', 'connection'))
  const db = getDb()
  const mediaExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = 'media'")
    .get()
  check('migration 010 creates shared media table', !!mediaExists, 'media table missing')

  // Plugin-declared tables are created by ensureSchema at plugin start (not by
  // migrations) — mirror PluginRuntime.start() so radarr_import_log exists.
  const manifest = JSON.parse(
    fs.readFileSync(path.resolve(PLUGIN_PATH, '..', 'manifest.json'), 'utf8'),
  )
  const { ensureSchema } = require(path.join(DIST, 'db', 'plugins-db'))
  ensureSchema('radarr', { tables: manifest.db.tables })
  const logExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = 'radarr_import_log'")
    .get()
  check('ensureSchema creates radarr_import_log', !!logExists, 'radarr_import_log missing')

  const prepare = makePreparer()
  const fetchImpl = makeFetchImpl()

  const { server, port } = await startMockServer()
  console.log(`mock Radarr on 127.0.0.1:${port}\n`)

  const plugin = require(PLUGIN_PATH)
  const ctx = makeCtx(db, [instance(port)], fetchImpl, prepare)
  const cleanup = plugin.plugin(ctx)

  // ── Transient failure → retry (not pause) ─────────────────────────
  // The first fetch of /api/v3/movie rejects with a network-style error; the
  // plugin must retry with backoff and import successfully rather than flip
  // to "offline" (which would spam the UI with a scary pause on a launch hiccup).
  console.log('[0] Transient fetch failure — retry before pause')
  const makeFlakyFetch = (realFetch, failCount) => {
    let failures = 0
    return (url, opts) => {
      if (url.includes('/api/v3/movie') && failures < failCount) {
        failures++
        return Promise.reject(new Error('fetch failed: transient startup hiccup'))
      }
      return realFetch(url, opts)
    }
  }
  const flakyCtx = makeCtx(db, [instance(port)], makeFlakyFetch(fetchImpl, 1), prepare)
  const res0 = await plugin.data['sync.now'](flakyCtx)
  check('transient failure retried → success', res0.success === true && res0.imported === 2, JSON.stringify(res0))
  check('transient failure did NOT pause', res0.paused !== true, JSON.stringify(res0))

  // ── First scan ─────────────────────────────────────────────────────
  console.log('[1] First scan')
  const res1 = await plugin.data['sync.now'](ctx)
  check('scan 1 returns success', res1.success === true, JSON.stringify(res1))
  check('scan 1 imported 2 (Matrix, Dune)', res1.imported === 2, `imported=${res1.imported}`)
  check('scan 1 skipped 1 (no tmdbId)', res1.skipped === 1, `skipped=${res1.skipped}`)
  check('scan 1 failed 0', res1.failed === 0, `failed=${res1.failed}`)

  const rows = db.prepare("SELECT * FROM media WHERE provider='tmdb' ORDER BY provider_id").all()
  check('media table has 2 rows', rows.length === 2, `rows=${rows.length}`)

  const matrix = rows.find((r) => r.provider_id === '603')
  check('Matrix imported', !!matrix)
  check('Matrix title', matrix && matrix.title === 'The Matrix', matrix && matrix.title)
  check('Matrix provider_id', matrix && matrix.provider_id === '603', matrix && matrix.provider_id)
  check('Matrix poster_url', matrix && matrix.poster_url === 'https://image.tmdb.org/t/p/w500/poster603.jpg', matrix && matrix.poster_url)
  check('Matrix backdrop_url', matrix && matrix.backdrop_url === 'https://image.tmdb.org/t/p/original/backdrop603.jpg', matrix && matrix.backdrop_url)
  check('Matrix genres JSON', matrix && matrix.genres === '["Action","Sci-Fi"]', matrix && matrix.genres)
  check('Matrix runtime', matrix && matrix.runtime === 136, matrix && matrix.runtime)
  check('Matrix rating', matrix && matrix.rating === 8.7, matrix && matrix.rating)
  check('Matrix file_path', matrix && matrix.file_path === '/movies/The Matrix (1999)', matrix && matrix.file_path)
  check('Matrix source_instance', matrix && matrix.source_instance === 'Mock Server', matrix && matrix.source_instance)
  check('Matrix source_instance_id links to instance', matrix && matrix.source_instance_id === 'mock', matrix && matrix.source_instance_id)

  const dune = rows.find((r) => r.provider_id === '693134')
  check('Dune imported (no images → null artwork)', !!dune && dune.poster_url === null && dune.backdrop_url === null)

  const matrixId1 = matrix && matrix.id

  // ── Second scan (idempotent refresh) ───────────────────────────────
  console.log('\n[2] Second scan — idempotent refresh')
  const res2 = await plugin.data['sync.now'](ctx)
  const count2 = db.prepare("SELECT COUNT(*) c FROM media WHERE provider='tmdb'").get().c
  check('scan 2 imported 2 again (refresh)', res2.imported === 2, `imported=${res2.imported}`)
  check('scan 2 did not duplicate rows', count2 === 2, `rows=${count2}`)
  const matrixAgain = db.prepare("SELECT id FROM media WHERE provider='tmdb' AND provider_id='603'").get()
  check('scan 2 kept same row id', matrixAgain && matrixAgain.id === matrixId1, `id=${matrixAgain && matrixAgain.id}`)

  // ── Offline pause ──────────────────────────────────────────────────
  console.log('\n[3] Offline pause (Radarr unreachable)')
  const offlineCtx = makeCtx(db, [instance(1, true)], fetchImpl, prepare) // port 1 → ECONNREFUSED
  const res3 = await plugin.data['sync.now'](offlineCtx)
  check('scan 3 pauses (paused: true)', res3.paused === true, JSON.stringify(res3))
  check('scan 3 reports success false', res3.success === false)
  const statusOffline = await plugin.data['sync.status'](offlineCtx)
  check('sync.status shows paused', statusOffline.paused === true, JSON.stringify(statusOffline.paused))

  // ── Recovery ───────────────────────────────────────────────────────
  console.log('\n[4] Recovery after Radarr reachable again')
  const res4 = await plugin.data['sync.now'](ctx)
  check('scan 4 succeeds after recovery', res4.success === true && res4.imported === 2, JSON.stringify(res4))
  const statusBack = await plugin.data['sync.status'](ctx)
  check('sync.status unpaused after recovery', statusBack.paused !== true, JSON.stringify(statusBack.paused))

  // ── Request recording ──────────────────────────────────────────────
  console.log('\n[5] Request recording (request-movie → radarr_requests)')
  const reqExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = 'radarr_requests'")
    .get()
  check('radarr_requests table created', !!reqExists, 'radarr_requests missing')

  const reqRes = await plugin.data['request-movie'](ctx, { instanceId: 'mock', tmdbId: '603' })
  check('request-movie success', reqRes.success === true, JSON.stringify(reqRes))
  const reqRow = db
    .prepare("SELECT * FROM radarr_requests WHERE tmdb_id='603' AND instance_id='mock'")
    .get()
  check('request row recorded (status requested)', !!reqRow && reqRow.status === 'requested', JSON.stringify(reqRow))
  check('request row title', reqRow && reqRow.title === 'The Matrix', reqRow && reqRow.title)
  check('request row source manual', reqRow && reqRow.source === 'manual', reqRow && reqRow.source)
  check('request row not already_exists', reqRow && reqRow.already_exists === 0, reqRow && reqRow.already_exists)

  const existsRes = await plugin.data['request-movie'](ctx, { instanceId: 'mock', tmdbId: '999' })
  check('request-movie already-exists', existsRes.success === true && existsRes.alreadyExists === true, JSON.stringify(existsRes))
  const existsRow = db
    .prepare("SELECT * FROM radarr_requests WHERE tmdb_id='999' AND instance_id='mock'")
    .get()
  check('exists row recorded', !!existsRow && existsRow.status === 'exists' && existsRow.already_exists === 1, JSON.stringify(existsRow))

  const dupRes = await plugin.data['request-movie'](ctx, { instanceId: 'mock', tmdbId: '603' })
  check('re-request still success', dupRes.success === true, JSON.stringify(dupRes))
  const dupCount = db.prepare("SELECT COUNT(*) c FROM radarr_requests WHERE tmdb_id='603' AND instance_id='mock'").get().c
  check('re-request does not duplicate row', dupCount === 1, `count=${dupCount}`)

  const listRes = await plugin.data['requests.list'](ctx, { limit: 10, offset: 0 })
  check('requests.list total 2', listRes.total === 2, `total=${listRes.total}`)
  check('requests.list shape', Array.isArray(listRes.requests) && listRes.requests.length === 2 && listRes.requests[0].title, JSON.stringify(listRes.requests && listRes.requests[0]))
  const searchRes = await plugin.data['requests.list'](ctx, { search: 'matrix', limit: 10, offset: 0 })
  check('requests.list search matches', searchRes.total === 1 && searchRes.requests[0].tmdb_id === '603', `total=${searchRes.total}`)

  // ── Per-instance sync ──────────────────────────────────────────────
  console.log('\n[6] Per-instance sync (multi-instance)')
  const twoCtx = makeCtx(db, [instance(port, true), instance(port, true, 'mock2', 'Mock Server 2')], fetchImpl, prepare)
  const statusMulti = await plugin.data['sync.status'](twoCtx)
  check('sync.status exposes 2 instances', Array.isArray(statusMulti.instances) && statusMulti.instances.length === 2, JSON.stringify(statusMulti.instances))

  const oneSync = await plugin.data['sync.now'](twoCtx, { instanceId: 'mock2' })
  check('per-instance sync syncs only that instance', oneSync.success === true && oneSync.instances === 1, JSON.stringify(oneSync))
  const mock2Count = db.prepare("SELECT COUNT(*) c FROM media WHERE source_instance_id='mock2'").get().c
  check('per-instance sync imported to mock2 only', mock2Count === 2, `mock2 rows=${mock2Count}`)

  // ── Download status sync ───────────────────────────────────────────
  console.log('\n[7] Download status sync (Radarr queue → app download framework)')
  // Matrix is actively downloading at 40% on the mock instance.
  setQueue([
    {
      id: 'q1',
      movieId: 1,
      title: 'The Matrix',
      size: 1000,
      sizeleft: 600,
      status: 'downloading',
      movie: { tmdbId: 603, title: 'The Matrix', hasFile: false },
    },
  ])
  const s1 = await plugin.data['downloads.sync'](ctx)
  check('downloads.sync created 1 row', s1.created === 1, JSON.stringify(s1))

  const dRows = db.prepare("SELECT * FROM downloads WHERE source='radarr'").all()
  check('radarr download row created', dRows.length === 1, `rows=${dRows.length}`)
  const d1 = dRows[0]
  check('download row source radarr', !!d1 && d1.source === 'radarr', d1 && d1.source)
  check('download row status downloading', d1 && d1.status === 'downloading', d1 && d1.status)
  check('download row progress 40%', d1 && d1.percentage === 40, d1 && d1.percentage)
  check('download row mediaItemId = tmdb 603', d1 && d1.media_item_id === '603', d1 && d1.media_item_id)
  check('download row title', d1 && d1.media_item_title === 'The Matrix', d1 && d1.media_item_title)

  const mapping1 = db.prepare("SELECT * FROM radarr_downloads WHERE queue_id='q1'").get()
  check('radarr_downloads maps queue→download', !!mapping1 && mapping1.download_id === d1.id && mapping1.tmdb_id === '603', JSON.stringify(mapping1))

  const mediaStatus1 = db.prepare("SELECT status FROM media WHERE provider='tmdb' AND media_type='movie' AND provider_id='603'").get()
  check('media flipped to downloading', mediaStatus1 && mediaStatus1.status === 'downloading', JSON.stringify(mediaStatus1))

  // The movie finished — the queue item is gone, so the framework row is
  // marked completed and the catalog row flips back to downloaded.
  setQueue([])
  const s2 = await plugin.data['downloads.sync'](ctx)
  check('downloads.sync completed 1', s2.completed === 1, JSON.stringify(s2))

  const dAfter = db.prepare('SELECT * FROM downloads WHERE id = ?').get(d1.id)
  check('download row completed', dAfter && dAfter.status === 'completed' && dAfter.percentage === 100, JSON.stringify(dAfter))
  const mappingGone = db.prepare("SELECT COUNT(*) c FROM radarr_downloads WHERE queue_id='q1'").get().c
  check('mapping cleared after completion', mappingGone === 0, `c=${mappingGone}`)
  const mediaStatus2 = db.prepare("SELECT status FROM media WHERE provider='tmdb' AND media_type='movie' AND provider_id='603'").get()
  check('media flipped to downloaded', mediaStatus2 && mediaStatus2.status === 'downloaded', JSON.stringify(mediaStatus2))

  // ── Cleanup ────────────────────────────────────────────────────────
  if (typeof cleanup === 'function') cleanup()
  server.close()
  db.close()

  console.log(`\n=== ${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'} ===\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
