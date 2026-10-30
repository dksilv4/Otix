/**
 * Test script: run matching pipeline on all scanned games without UI.
 *
 * Usage: npx ts-node scripts/test-matching.ts
 *
 * 1. Reads all games from scanned_games DB
 * 2. Sends them to /api/v1/media/match/batch
 * 3. Saves auto-matched results back to DB
 * 4. Reports match statistics
 */

import * as gameService from '../game/storage'
import http from 'http'
import https from 'https'
import { URL } from 'url'

const API_BASE = process.env.API_BASE || 'https://otix.app/api/v1'

async function fetch(url: string, opts: RequestInit = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const mod = u.protocol === 'https:' ? https : http
    const req = mod.request(u, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(opts.headers as any) },
    }, (res) => {
      let body = ''
      res.on('data', (chunk) => (body += chunk))
      res.on('end', () => {
        try { resolve(JSON.parse(body)) } catch { resolve(body) }
      })
    })
    req.on('error', reject)
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('timeout')) })
    if (opts.body) req.write(opts.body)
    req.end()
  })
}

async function main() {
  console.log('[test-matching] Reading scanned games from DB...')
  const allGames = gameService.getAllGames()
  console.log(`[test-matching] Found ${allGames.length} games`)

  // Only send unmatched games
  const unmatched = allGames.filter((g: any) => !g.otixMediaId && !g.otix_media_id)
  console.log(`[test-matching] ${unmatched.length} unmatched, ${allGames.length - unmatched.length} already matched`)

  if (unmatched.length === 0) {
    console.log('[test-matching] Nothing to do — all games matched')
    return
  }

  // Batch up to 50 at a time
  const BATCH = 50
  let totalMatched = 0
  let totalSuggested = 0

  for (let i = 0; i < unmatched.length; i += BATCH) {
    const batch = unmatched.slice(i, i + BATCH)
    const games = batch.map((g: any) => ({
      query_id: `${g.platform || 'pc'}:${g.id}`,
      title: g.title,
      developer: null,
      publisher: null,
      poster_url: g.posterUrl || g.poster_url || null,
      external_ids: [{ source: g.platform || 'pc', id: g.id }],
      media_type: 'game',
    }))

    const batchNum = Math.floor(i / BATCH) + 1
    const totalBatches = Math.ceil(unmatched.length / BATCH)
    console.log(`[test-matching] Batch ${batchNum}/${totalBatches}: sending ${games.length} games...`)

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
        const am = m.auto_match || m.autoMatch

        if (am?.media_item_id || am?.mediaItemId) {
          const mid = am.media_item_id || am.mediaItemId
          gameService.acceptSuggestion(game.id, {
            id: mid,
            title: am.title,
            slug: mid,
            posterUrl: am.poster_url || am.posterUrl || null,
            backdropUrl: am.backdrop_url || am.backdropUrl || null,
          } as any)
          matched++
          if (matched <= 5) console.log(`  ✓ ${game.title} → ${am.title}`)
        } else if ((m.candidates || []).length > 0) {
          suggested++
        }
      }

      totalMatched += matched
      totalSuggested += suggested
      console.log(`[test-matching] Batch ${batchNum}: ${matched} matched, ${suggested} candidates`)
    } catch (err: any) {
      console.error(`[test-matching] Batch ${batchNum} failed:`, err.message)
    }
  }

  gameService.notifyGamesChanged()

  console.log(`\n[test-matching] DONE: ${totalMatched} matched, ${totalSuggested} candidates out of ${unmatched.length}`)
  const remaining = gameService.getAllGames().filter((g: any) => !g.otixMediaId && !g.otix_media_id)
  console.log(`[test-matching] Remaining unmatched: ${remaining.length}/${allGames.length}`)
  const pct = Math.round(((allGames.length - remaining.length) / allGames.length) * 100)
  console.log(`[test-matching] Hit ratio: ${pct}%`)
}

main().catch(console.error)
