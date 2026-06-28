/**
 * Test matching pipeline — runs standalone against the DB + API.
 * Usage: node scripts/test-matching.js
 */
const Database = require('better-sqlite3')
const http = require('http')
const https = require('https')
const path = require('path')
const os = require('os')

const DB_PATH = path.join(os.homedir(), 'AppData/Roaming/desktop/databases/downloads.db')
const API_BASE = process.env.API_BASE || 'http://localhost:8000/api/v1'

function fetch(url, opts) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const mod = u.protocol === 'https:' ? https : http
    const req = mod.request(u, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    }, (res) => {
      let body = ''
      res.on('data', (chunk) => (body += chunk))
      res.on('end', () => {
        try { resolve(JSON.parse(body)) } catch { resolve(body) }
      })
    })
    req.on('error', reject)
    req.setTimeout(180000, () => { req.destroy(); reject(new Error('timeout')) })
    if (opts.body) req.write(opts.body)
    req.end()
  })
}

function acceptSuggestion(db, gameId, suggestion) {
  if (!suggestion) return
  db.prepare(`
    UPDATE scanned_games SET
      otix_media_id = ?, otix_media_title = ?, otix_media_slug = ?,
      otix_poster_url = ?, otix_backdrop_url = ?,
      otix_textless_poster_url = ?, otix_logo_url = ?, otix_icon_url = ?,
      otix_match_suggestion = NULL,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    suggestion.id, suggestion.title, suggestion.slug ?? null,
    suggestion.posterUrl || null, suggestion.backdropUrl || null,
    suggestion.textlessPosterUrl || null, suggestion.logoUrl || null, suggestion.iconUrl || null,
    gameId,
  )
}

async function main() {
  const db = new Database(DB_PATH)

  const allGames = db.prepare('SELECT * FROM scanned_games').all()
  console.log(`Games: ${allGames.length} total, ${allGames.filter(g => g.otix_media_id).length} matched`)

  const unmatched = allGames.filter(g => !g.otix_media_id)
  console.log(`Unmatched: ${unmatched.length}`)

  if (!unmatched.length) {
    console.log('All matched — nothing to do')
    db.close()
    return
  }

  // Show sample
  console.log('\nSample unmatched:')
  unmatched.slice(0, 5).forEach(g => console.log(`  ${g.title} (${g.platform})`))

  const BATCH = 20
  let totalMatched = 0
  let totalSuggested = 0

  for (let i = 0; i < unmatched.length; i += BATCH) {
    const batch = unmatched.slice(i, i + BATCH)
    const games = batch.map(g => ({
      query_id: `${g.platform || 'pc'}:${g.id}`,
      title: g.title,
      developer: null,
      publisher: null,
      poster_url: g.poster_url || null,
      external_ids: [{ source: g.platform || 'pc', id: g.id }],
      media_type: 'game',
    }))

    const n = Math.floor(i / BATCH) + 1
    const total = Math.ceil(unmatched.length / BATCH)
    process.stdout.write(`\rBatch ${n}/${total}: ${games.length} games... `)

    try {
      const data = await fetch(`${API_BASE}/media/match/batch`, {
        method: 'POST',
        body: JSON.stringify({ games }),
      })

      const matches = data.matches || []
      let matched = 0
      let suggested = 0

      for (let j = 0; j < Math.min(batch.length, matches.length); j++) {
        const m = matches[j]
        const game = batch[j]
        const am = m.auto_match

        // Auto-match: server auto_match OR high-confidence candidate (>= 0.85)
        let best = am && am.media_item_id ? am : null
        if (!best && m.candidates?.length > 0 && m.candidates[0].confidence >= 0.80) {
          best = m.candidates[0]
        }
        if (best?.media_item_id) {
          acceptSuggestion(db, game.id, {
            id: best.media_item_id,
            title: best.title,
            slug: best.media_item_id,
            posterUrl: best.poster_url || null,
            backdropUrl: best.backdrop_url || null,
          })
          matched++
        } else if (m.candidates?.length > 0) {
          suggested++
        }
      }

      totalMatched += matched
      totalSuggested += suggested
      process.stdout.write(`done (${matched} matched, ${suggested} candidates)`)
    } catch (err) {
      process.stdout.write(`FAILED: ${err.message}`)
    }
  }

  console.log(`\n\nDONE: ${totalMatched} new matches, ${totalSuggested} candidates`)

  const remaining = db.prepare("SELECT COUNT(*) as c FROM scanned_games WHERE otix_media_id IS NULL OR otix_media_id = ''").get()
  const pct = Math.round(((allGames.length - remaining.c) / allGames.length) * 100)
  console.log(`Hit ratio: ${pct}% (${allGames.length - remaining.c}/${allGames.length})`)

  db.close()
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
