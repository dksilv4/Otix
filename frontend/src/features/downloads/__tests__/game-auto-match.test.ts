import { describe, expect, it } from 'vitest'
import {
  findBestGameRelease,
  scoreGameRelease,
  findCompanionUpdates,
  type DownloaderCapabilities,
} from '../game-auto-match'
import type { ServerProwlarrRelease } from '../usenet-types'

function makeRelease(title: string, extras: Partial<ServerProwlarrRelease> = {}): ServerProwlarrRelease {
  return {
    guid: extras.guid ?? title,
    title,
    size: extras.size ?? 30_000_000_000,
    download_url: extras.download_url ?? 'https://example.test/download',
    indexer: extras.indexer ?? '1337x',
    protocol: extras.protocol ?? 'torrent',
    age_days: extras.age_days ?? 10,
    seeders: extras.seeders ?? 50,
    info_url: extras.info_url ?? null,
    publish_date: extras.publish_date ?? '2024-01-01T00:00:00Z',
  }
}

const ALL_DOWNLOADERS: DownloaderCapabilities = {
  torrentConfigured: true,
  usenetConfigured: true,
}

const TORRENT_ONLY: DownloaderCapabilities = {
  torrentConfigured: true,
  usenetConfigured: false,
}

const USENET_ONLY: DownloaderCapabilities = {
  torrentConfigured: false,
  usenetConfigured: true,
}

describe('game-auto-match', () => {
  describe('Downloader filtering', () => {
    it('rejects torrent releases when only Usenet is configured', () => {
      const torrent = makeRelease('Cyberpunk.2077.v2.0-GOG', { protocol: 'torrent' })
      const res = scoreGameRelease(torrent, { title: 'Cyberpunk 2077' }, USENET_ONLY)
      expect(res).toBeNull()
    })

    it('rejects usenet releases when only Torrent is configured', () => {
      const usenet = makeRelease('Cyberpunk.2077.v2.0-GOG', { protocol: 'usenet' })
      const res = scoreGameRelease(usenet, { title: 'Cyberpunk 2077' }, TORRENT_ONLY)
      expect(res).toBeNull()
    })

    it('rejects releases with empty download URL', () => {
      const emptyDl = makeRelease('Cyberpunk.2077.v2.0-GOG', { download_url: '' })
      const res = scoreGameRelease(emptyDl, { title: 'Cyberpunk 2077' }, ALL_DOWNLOADERS)
      expect(res).toBeNull()
    })
  })

  describe('Repacker & Scene ranking', () => {
    it('prioritizes GOG (DRM-free) over other repackers when both are healthy', () => {
      const gog = makeRelease('Cyberpunk.2077.v2.0-GOG', { guid: 'gog', seeders: 50 })
      const fitgirl = makeRelease('Cyberpunk.2077-FitGirl.Repack', { guid: 'fg', seeders: 60 })
      const best = findBestGameRelease([fitgirl, gog], { title: 'Cyberpunk 2077' }, ALL_DOWNLOADERS)
      expect(best).not.toBeNull()
      expect(best?.baseRelease.guid).toBe('gog')
    })

    it('prioritizes trusted repackers over unknown uploads', () => {
      const unknown = makeRelease('Cyberpunk.2077.PC-RandomUploader', { guid: 'rand', seeders: 10 })
      const dodi = makeRelease('Cyberpunk.2077-DODI.Repack', { guid: 'dodi', seeders: 20 })
      const best = findBestGameRelease([unknown, dodi], { title: 'Cyberpunk 2077' }, ALL_DOWNLOADERS)
      expect(best?.baseRelease.guid).toBe('dodi')
    })

    it('penalizes torrents with 0 seeders', () => {
      const deadGog = makeRelease('The.Witcher.3.Wild.Hunt-GOG', { guid: 'dead', seeders: 0 })
      const aliveRune = makeRelease('The.Witcher.3.Wild.Hunt-RUNE', { guid: 'alive', seeders: 30 })
      const best = findBestGameRelease([deadGog, aliveRune], { title: 'The Witcher 3' }, ALL_DOWNLOADERS)
      expect(best?.baseRelease.guid).toBe('alive')
    })
  })

  describe('Edition and Year bonuses', () => {
    it('rewards GOTY and Complete editions', () => {
      const standard = makeRelease('The.Witcher.3.Wild.Hunt-RUNE', { guid: 'std' })
      const goty = makeRelease('The.Witcher.3.Wild.Hunt.GOTY.Edition-RUNE', { guid: 'goty' })
      const best = findBestGameRelease([standard, goty], { title: 'The Witcher 3' }, ALL_DOWNLOADERS)
      expect(best?.baseRelease.guid).toBe('goty')
    })

    it('rewards releases matching the catalog release year', () => {
      const remake2023 = makeRelease('Resident.Evil.4.2023-EMPRESS', { guid: 'remake' })
      const original2005 = makeRelease('Resident.Evil.4.2005-FLT', { guid: 'orig' })
      const best = findBestGameRelease(
        [original2005, remake2023],
        { title: 'Resident Evil 4', year: 2023 },
        ALL_DOWNLOADERS,
      )
      expect(best?.baseRelease.guid).toBe('remake')
    })
  })

  describe('Companion Updates', () => {
    it('finds and orders companion updates chronologically for the matching repacker', () => {
      const base = makeRelease('Kingdom.Come.Deliverance.II.v1.5-ElAmigos', { guid: 'base' })
      const patch1 = makeRelease('Kingdom.Come.Deliverance.II.Update.v1.5.1-ElAmigos', { guid: 'p1' })
      const patch2 = makeRelease('Kingdom.Come.Deliverance.II.Update.v1.5.2-ElAmigos', { guid: 'p2' })
      const otherPatch = makeRelease('Kingdom.Come.Deliverance.II.Update.v1.5.2-RUNE', { guid: 'other-p' })

      const updates = findCompanionUpdates(
        base,
        {
          kind: 'game',
          gameKey: 'kingdom come deliverance 2',
          gameTitle: 'Kingdom Come Deliverance 2',
          editionKey: 'standard',
          editionLabel: 'Standard',
          version: '1.5',
          sceneGroup: null,
          repackerKey: 'elamigos',
          repackerLabel: 'ElAmigos',
          platform: 'PC',
          platformKey: 'pc',
          location: null,
          locationCode: null,
          year: null,
          matchedQuery: true,
          rawTitle: base.title,
        },
        [base, patch1, patch2, otherPatch],
        ALL_DOWNLOADERS,
      )

      expect(updates.map((u) => u.guid)).toEqual(['p1', 'p2'])
    })

    it('returns null when only updates or DLCs exist with no base game', () => {
      const updateOnly = makeRelease('Cyberpunk.2077.Update.2.13-GOG')
      const dlcOnly = makeRelease('Cyberpunk.2077.Phantom.Liberty.DLC-GOG')
      const best = findBestGameRelease([updateOnly, dlcOnly], { title: 'Cyberpunk 2077' }, ALL_DOWNLOADERS)
      expect(best).toBeNull()
    })
  })
})
