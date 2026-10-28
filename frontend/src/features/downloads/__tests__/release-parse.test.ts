import { describe, expect, it } from 'vitest'
import {
  classifyReleaseKind,
  compareVersions,
  extractLocation,
  extractPlatform,
  extractReleaseVersion,
  extractReleaseYear,
  filterEditionGroups,
  groupReleasesByEdition,
  groupReleasesByGame,
  groupReleasesByRepackerAndVersion,
  parseReleaseTitle,
  groupResultsByEditionAndPack,
  collectEditionPackPlatforms,
  releaseMatchesSearchHint,
} from '../release-parse'
import type { ServerProwlarrRelease } from '../usenet-types'

function release(title: string, extras: Partial<ServerProwlarrRelease> = {}): ServerProwlarrRelease {
  return {
    guid: extras.guid ?? title,
    title,
    size: extras.size ?? 1_000_000_000,
    download_url: extras.download_url ?? 'https://example.test/dl',
    indexer: extras.indexer ?? 'NZBGeek',
    protocol: extras.protocol ?? 'usenet',
    age_days: extras.age_days ?? 1,
    seeders: extras.seeders ?? null,
  }
}

describe('parseReleaseTitle', () => {
  it('treats a scene installer as a base game and strips the group', () => {
    const parsed = parseReleaseTitle('Kingdom.Come.Deliverance.II-RUNE')
    expect(parsed.kind).toBe('game')
    expect(parsed.gameKey).toBe('kingdom come deliverance 2')
    expect(parsed.gameTitle).toBe('Kingdom Come Deliverance 2')
    expect(parsed.sceneGroup).toBe('RUNE')
    expect(parsed.version).toBeNull()
  })

  it('normalizes roman numerals so II and 2 group together', () => {
    const a = parseReleaseTitle('Hades.II-GOG')
    const b = parseReleaseTitle('Hades.2.Update.1.1-RUNE')
    expect(a.gameKey).toBe(b.gameKey)
    expect(a.kind).toBe('game')
    expect(b.kind).toBe('update')
    expect(b.version).toBe('1.1')
  })

  it('classifies patches, hotfixes, and named updates', () => {
    expect(classifyReleaseKind('Cyberpunk.2077.Update.2.13-GOG')).toBe('update')
    expect(classifyReleaseKind('Cyberpunk.2077.Update2.13-GOG')).toBe('update')
    expect(classifyReleaseKind('Cyberpunk 2077 [Update 2.13].iso')).toBe('update')
    expect(classifyReleaseKind('Cyberpunk.2077.Updated.v2.21-ElAmigos')).toBe('update')
    expect(classifyReleaseKind('setup_cyberpunk_2077_update_2.13_(64bit)_(gog).exe')).toBe('update')
    expect(classifyReleaseKind('Elden.Ring.Patch.1.12.3-FLT')).toBe('update')
    expect(classifyReleaseKind('Silent.Hill.2.Hotfix-RUNE')).toBe('update')
    expect(extractReleaseVersion('Cyberpunk.2077.Update.2.13-GOG')).toBe('2.13')
    expect(extractReleaseVersion('Cyberpunk.2077.Update2.13-GOG')).toBe('2.13')
  })

  it('groups a versioned cyberpunk update under the same key as the base game', () => {
    const base = parseReleaseTitle('Cyberpunk.2077-GOG.iso')
    const glued = parseReleaseTitle('Cyberpunk.2077.Update2.13-GOG.iso')
    const versioned = parseReleaseTitle('Cyberpunk.2077.v2.13-GOG.iso')
    expect(base.kind).toBe('game')
    expect(glued.kind).toBe('update')
    expect(glued.gameKey).toBe(base.gameKey)
    expect(versioned.gameKey).toBe(base.gameKey)
  })

  it('keeps full packs that include updates as the base game', () => {
    const parsed = parseReleaseTitle(
      'Baldurs.Gate.3.MULTi13.Incl.Update.v4.1.1-FitGirl.Repack',
    )
    expect(parsed.kind).toBe('game')
    expect(parsed.gameKey).toBe('baldurs gate 3')
    expect(parsed.version).toBe('4.1.1')
  })

  it('classifies DLC separately but groups it under the same game', () => {
    const dlc = parseReleaseTitle('Cyberpunk.2077.Phantom.Liberty.DLC-GOG', 'Cyberpunk 2077')
    expect(dlc.kind).toBe('dlc')
    expect(dlc.gameKey).toBe('cyberpunk 2077')
  })

  it('uses the search hint so noisy titles still attach to the queried game', () => {
    const parsed = parseReleaseTitle(
      'KCD2.Royal.Edition.Update.v1.2.2-DODI',
      'Kingdom Come: Deliverance II',
    )
    expect(parsed.kind).toBe('update')
    expect(parsed.gameKey).toBe('kingdom come deliverance 2')
    expect(parsed.version).toBe('1.2.2')
  })

  it('matches SABnzbd queue names back to the searched game', () => {
    expect(
      releaseMatchesSearchHint(
        'Kingdom Come Deliverance II v1.5.0 ElAmigos',
        'Kingdom Come: Deliverance II',
      ),
    ).toBe(true)
    expect(releaseMatchesSearchHint('Unrelated Sports Title-FLT', 'Kingdom Come: Deliverance II')).toBe(false)
  })
})

describe('compareVersions', () => {
  it('sorts dotted versions newest first', () => {
    expect(compareVersions('1.2.1', '1.2.0')).toBeLessThan(0)
    expect(compareVersions('1.10', '1.9')).toBeLessThan(0)
    expect(compareVersions(null, '1.0')).toBeGreaterThan(0)
  })
})

describe('groupReleasesByGame', () => {
  it('keeps one cluster for the search and nests updates and DLC under it', () => {
    const clusters = groupReleasesByGame(
      [
        release('Cyberpunk.2077.Phantom.Liberty.DLC-GOG', { guid: 'dlc', size: 30_000_000_000 }),
        release('Cyberpunk.2077.Update.2.13-GOG', { guid: 'upd', size: 8_000_000_000 }),
        release('Cyberpunk.2077.v2.0-GOG.iso', { guid: 'base', size: 70_000_000_000 }),
        release('Unrelated.Sports.Title-FLT', { guid: 'other', size: 4_000_000_000 }),
      ],
      'Cyberpunk 2077',
    )

    expect(clusters).toHaveLength(1)
    const cyber = clusters[0]
    expect(cyber.title).toBe('Cyberpunk 2077')
    expect(cyber.games.map((item) => item.release.guid)).toContain('base')
    expect(cyber.updates.map((item) => item.release.guid)).toEqual(['upd'])
    expect(cyber.dlc.map((item) => item.release.guid)).toEqual(['dlc'])
    expect(cyber.other.map((item) => item.release.guid)).toEqual(['other'])
  })

  it('orders updates from newest version to oldest', () => {
    const cluster = groupReleasesByGame([
      release('Hades.II.Update.1.0-RUNE', { guid: 'u1' }),
      release('Hades.II-RUNE', { guid: 'g' }),
      release('Hades.II.Update.1.1.2-RUNE', { guid: 'u2' }),
    ])[0]

    expect(cluster.updates.map((item) => item.parsed.version)).toEqual(['1.1.2', '1.0'])
  })

  it('groups Royal Edition installers and updates together without splitting games', () => {
    const [cluster] = groupReleasesByGame(
      [
        release('Kingdom.Come.Deliverance.II-RUNE', { guid: 'std' }),
        release('KCD2.Royal.Edition-DODI', { guid: 'royal' }),
        release('KCD2.Royal.Edition.Update.v1.2.2-DODI', { guid: 'upd' }),
      ],
      'Kingdom Come: Deliverance II',
    )

    expect(cluster).toBeDefined()
    expect(cluster.games.map((item) => item.release.guid).sort()).toEqual(['royal', 'std'])
    expect(cluster.updates.map((item) => item.release.guid)).toEqual(['upd'])
    expect(cluster.updates[0].parsed.editionLabel).toBe('Royal Edition')
  })
})

describe('groupReleasesByEdition', () => {
  it('puts named editions first with their updates nested, not a game dump', () => {
    const clusters = groupReleasesByEdition(
      [
        release('Kingdom.Come.Deliverance.II-RUNE', { guid: 'std', size: 80_000_000_000 }),
        release('KCD2.Royal.Edition-DODI', { guid: 'royal', size: 90_000_000_000 }),
        release('KCD2.Royal.Edition.Update.v1.2.2-DODI', { guid: 'upd' }),
        release('Unrelated.Sports.Title-FLT', { guid: 'other' }),
      ],
      'Kingdom Come: Deliverance II',
    )

    expect(clusters.map((cluster) => cluster.title)).toEqual([
      'Royal Edition',
      'Release',
      'Other results',
    ])
    expect(clusters[0].releases.map((item) => item.release.guid)).toEqual(['royal'])
    expect(clusters[0].updates.map((item) => item.release.guid)).toEqual(['upd'])
    expect(clusters[1].releases.map((item) => item.release.guid)).toEqual(['std'])
    expect(clusters[2].releases.map((item) => item.release.guid)).toEqual(['other'])
  })

  it('keeps DLC as its own edition group', () => {
    const clusters = groupReleasesByEdition(
      [
        release('Cyberpunk.2077.Phantom.Liberty.DLC-GOG', { guid: 'dlc' }),
        release('Cyberpunk.2077.Update.2.13-GOG', { guid: 'upd' }),
        release('Cyberpunk.2077.v2.0-GOG.iso', { guid: 'base' }),
      ],
      'Cyberpunk 2077',
    )

    expect(clusters.map((cluster) => cluster.title)).toEqual(['Release', 'Phantom Liberty'])
    const base = clusters[0]
    expect(base.releases.map((item) => item.release.guid)).toEqual(['base'])
    expect(base.updates.map((item) => item.release.guid)).toEqual(['upd'])
    expect(clusters[1].releases.map((item) => item.release.guid)).toEqual(['dlc'])
  })
})

describe('groupReleasesByRepackerAndVersion', () => {
  it('nests ElAmigos updates under the matching installer version', () => {
    const clusters = groupReleasesByRepackerAndVersion(
      [
        release('Kingdom.Come.Deliverance.II.v1.5-ElAmigos', { guid: 'base', size: 80_000_000_000 }),
        release('Kingdom.Come.Deliverance.II.Update.v1.5.2-ElAmigos', { guid: 'u2' }),
        release('Kingdom.Come.Deliverance.II.Update.v1.5.3-ElAmigos', { guid: 'u3' }),
        release('Kingdom.Come.Deliverance.II-RUNE', { guid: 'rune', size: 70_000_000_000 }),
      ],
      'Kingdom Come: Deliverance II',
    )

    expect(clusters.map((cluster) => cluster.title)).toEqual(['ElAmigos', 'RUNE'])
    const elamigos = clusters[0].versions
    expect(elamigos).toHaveLength(1)
    expect(elamigos[0].version).toBe('1.5')
    expect(elamigos[0].releases.map((item) => item.release.guid)).toEqual(['base'])
    expect(elamigos[0].updates.map((item) => item.parsed.version)).toEqual(['1.5.3', '1.5.2'])
  })

  it('treats v1.5.0 and later 1.5.x patches as the same full-game pack', () => {
    const clusters = groupReleasesByRepackerAndVersion(
      [
        release('Kingdom.Come.Deliverance.II.v1.5.0-ElAmigos', { guid: 'base' }),
        release('Kingdom.Come.Deliverance.II.Update.v1.5.1-ElAmigos', { guid: 'u1' }),
        release('Kingdom.Come.Deliverance.II.Update.v1.5.2-ElAmigos', { guid: 'u2' }),
      ],
      'Kingdom Come: Deliverance II',
    )

    expect(clusters[0].versions).toHaveLength(1)
    expect(clusters[0].versions[0].version).toBe('1.5')
    expect(clusters[0].versions[0].releases.map((item) => item.release.guid)).toEqual(['base'])
    expect(clusters[0].versions[0].updates.map((item) => item.parsed.version)).toEqual(['1.5.2', '1.5.1'])
  })
})

describe('groupResultsByEditionAndPack', () => {
  it('groups by version only, newest first, with later patches under that full game version', () => {
    const groups = groupResultsByEditionAndPack(
      [
        release('KCD2.Royal.Edition.v1.5-ElAmigos', { guid: 'royal', size: 90_000_000_000 }),
        release('KCD2.Royal.Edition.Update.v1.5.2-ElAmigos', { guid: 'u2' }),
        release('KCD2.Royal.Edition.Update.v1.5.3-ElAmigos', { guid: 'u3' }),
        release('Kingdom.Come.Deliverance.II-RUNE', { guid: 'rune', size: 70_000_000_000 }),
        release('Kingdom.Come.Deliverance.II.v1.4-ElAmigos', { guid: 'v14', size: 80_000_000_000 }),
      ],
      'Kingdom Come: Deliverance II',
    )

    expect(groups).toHaveLength(1)
    expect(groups[0].packs.map((pack) => pack.title)).toEqual(['v1.5', 'v1.4', 'Initial Release'])
    expect(groups[0].packs[0].releases.map((item) => item.release.guid)).toEqual(['royal'])
    expect(groups[0].packs[0].updates.map((item) => item.parsed.version)).toEqual(['1.5.3', '1.5.2'])
    expect(groups[0].packs[2].releases.map((item) => item.release.guid)).toEqual(['rune'])
  })

  it('puts different repackers of the same version in one version group', () => {
    const groups = groupResultsByEditionAndPack(
      [
        release('Kingdom.Come.Deliverance.II.v1.5-ElAmigos', { guid: 'ela', size: 80_000_000_000 }),
        release('Kingdom.Come.Deliverance.II.v1.5-RUNE', { guid: 'rune', size: 90_000_000_000 }),
        release('Kingdom.Come.Deliverance.II.Update.v1.5.2-DODI', { guid: 'u2' }),
      ],
      'Kingdom Come: Deliverance II',
    )

    expect(groups).toHaveLength(1)
    expect(groups[0].packs).toHaveLength(1)
    expect(groups[0].packs[0].title).toBe('v1.5')
    expect(groups[0].packs[0].releases.map((item) => item.release.guid).sort()).toEqual(['ela', 'rune'])
    expect(groups[0].packs[0].updates.map((item) => item.release.guid)).toEqual(['u2'])
  })

  it('attaches updates to unversioned initial release for games like Little Nightmares 3', () => {
    const groups = groupResultsByEditionAndPack(
      [
        release('Little.Nightmares.III-RUNE', { guid: 'ln3-initial', size: 15_000_000_000 }),
        release('Little.Nightmares.III.Update.v1.0.1-RUNE', { guid: 'ln3-u1' }),
        release('Little.Nightmares.III.Update.v1.0.2-RUNE', { guid: 'ln3-u2' }),
      ],
      'Little Nightmares 3',
    )

    expect(groups).toHaveLength(1)
    expect(groups[0].packs).toHaveLength(1)
    const pack = groups[0].packs[0]
    expect(pack.title).toBe('Initial Release')
    expect(pack.version).toBeNull()
    expect(pack.releases.map((r) => r.release.guid)).toEqual(['ln3-initial'])
    expect(pack.updates.map((u) => u.release.guid)).toEqual(['ln3-u2', 'ln3-u1'])
  })
})

describe('extractPlatform', () => {
  it('parses Nintendo platforms accurately', () => {
    expect(extractPlatform('Super.Mario.Odyssey.NSW-BigBlue')?.label).toBe('Nintendo Switch')
    expect(extractPlatform('The.Legend.of.Zelda.Tears.of.the.Kingdom.Switch')?.key).toBe('switch')
    expect(extractPlatform('Pokemon.Emerald.(USA).GBA')?.label).toBe('Game Boy Advance')
    expect(extractPlatform('Mario.Kart.DS.NDS')?.label).toBe('Nintendo DS')
    expect(extractPlatform('Super.Mario.64.N64')?.label).toBe('Nintendo 64')
    expect(extractPlatform('Super.Metroid.SNES')?.label).toBe('SNES')
    expect(extractPlatform('Super.Mario.Bros.3.NES')?.label).toBe('NES')
    expect(extractPlatform('Super.Smash.Bros.Melee.GameCube')?.label).toBe('GameCube')
    expect(extractPlatform('Super.Mario.Galaxy.Wii')?.label).toBe('Wii')
  })

  it('parses PlayStation and Xbox platforms accurately', () => {
    expect(extractPlatform('Demon.Souls.PS5-GRP')?.label).toBe('PS5')
    expect(extractPlatform('Bloodborne.PS4-GRP')?.label).toBe('PS4')
    expect(extractPlatform('Metal.Gear.Solid.4.PS3')?.label).toBe('PS3')
    expect(extractPlatform('Final.Fantasy.X.PS2')?.label).toBe('PS2')
    expect(extractPlatform('Crash.Bandicoot.PS1')?.label).toBe('PS1')
    expect(extractPlatform('Halo.Infinite.Xbox.Series')?.label).toBe('Xbox Series')
    expect(extractPlatform('Forza.Horizon.5.X360')?.label).toBe('Xbox 360')
    expect(extractPlatform('Gears.of.War.Xbox.One')?.label).toBe('Xbox One')
  })

  it('parses PC and infers PC for trusted PC scene repackers', () => {
    expect(extractPlatform('Cyberpunk.2077.PC')?.label).toBe('PC')
    expect(extractPlatform('The.Witcher.3.WIN64')?.label).toBe('PC')
    expect(extractPlatform('Elden.Ring-FitGirl.Repack', null, 'fitgirl')?.label).toBe('PC')
    expect(extractPlatform('Hades.II-RUNE', 'RUNE', 'rune')?.label).toBe('PC')
    expect(extractPlatform('Baldurs.Gate.3-GOG', null, 'gog')?.label).toBe('PC')
  })
})

describe('extractLocation', () => {
  it('parses country and region codes from brackets and parentheticals', () => {
    expect(extractLocation('Pokemon.Emerald.(USA).GBA')?.label).toBe('USA')
    expect(extractLocation('The.Legend.of.Zelda.[Europe].NSW')?.label).toBe('Europe')
    expect(extractLocation('Persona.5.Royal.(Japan).PS4')?.label).toBe('Japan')
    expect(extractLocation('Super.Mario.Bros.(World).NES')?.label).toBe('World')
    expect(extractLocation('Final.Fantasy.VII.(Asia).PS1')?.label).toBe('Asia')
    expect(extractLocation('Pokemon.HeartGold.(Germany).NDS')?.label).toBe('Germany')
    expect(extractLocation('Animal.Crossing.(France).3DS')?.label).toBe('France')
    expect(extractLocation('Castlevania.(Spain).GBA')?.label).toBe('Spain')
  })

  it('parses multi-region tags and MULTi language packs', () => {
    expect(extractLocation('Zelda.Ocarina.of.Time.(USA, Europe).N64')?.label).toBe('USA / Europe')
    expect(extractLocation('Cyberpunk.2077.MULTi13-FitGirl')?.label).toBe('MULTi13')
    expect(extractLocation('Hades.II.MULTi-ElAmigos')?.label).toBe('MULTi')
  })

  it('does not falsely extract location if it is part of the searched game title', () => {
    expect(extractLocation('Captain.America.Super.Soldier', 'Captain America')).toBeNull()
  })
})

describe('extractReleaseYear', () => {
  it('extracts release year from parentheses or brackets', () => {
    expect(extractReleaseYear('Resident.Evil.4.(2023).PC')).toBe('2023')
    expect(extractReleaseYear('Doom.[1993].iso')).toBe('1993')
  })

  it('extracts standalone release year', () => {
    expect(extractReleaseYear('God.of.War.2018-CPY', 'God of War')).toBe('2018')
    expect(extractReleaseYear('Spider-Man.2018.v1.0', 'Spider-Man')).toBe('2018')
    expect(extractReleaseYear('Elden.Ring.2022.MULTi', 'Elden Ring')).toBe('2022')
  })

  it('does not treat game title numbers like Cyberpunk 2077 or 1942 as release years', () => {
    expect(extractReleaseYear('Cyberpunk.2077.v2.0-GOG.iso', 'Cyberpunk 2077')).toBeNull()
    expect(extractReleaseYear('1942.The.Joint.Strike', '1942')).toBeNull()
  })
})

describe('Platform and Location in parseReleaseTitle and filterEditionGroups', () => {
  it('populates platform, location, and year in ParsedGameRelease', () => {
    const parsed = parseReleaseTitle('Pokemon.Emerald.(USA).2004.GBA', 'Pokemon Emerald')
    expect(parsed.platform).toBe('Game Boy Advance')
    expect(parsed.platformKey).toBe('gba')
    expect(parsed.location).toBe('USA')
    expect(parsed.locationCode).toBe('usa')
    expect(parsed.year).toBe('2004')
  })

  it('collects platforms and filters edition groups by platform', () => {
    const pcRelease = release('Celeste.PC.v1.4-GOG', { guid: 'pc-1' })
    const switchRelease = release('Celeste.NSW.v1.4-GRP', { guid: 'sw-1' })
    const groups = groupResultsByEditionAndPack([pcRelease, switchRelease], 'Celeste')

    const platforms = collectEditionPackPlatforms(groups)
    expect(platforms.map((p) => p.key).sort()).toEqual(['pc', 'switch'])

    const pcFiltered = filterEditionGroups(groups, 'all', 'all', 'pc')
    expect(pcFiltered[0].packs[0].releases.map((r) => r.release.guid)).toEqual(['pc-1'])

    const switchFiltered = filterEditionGroups(groups, 'all', 'all', 'switch')
    expect(switchFiltered[0].packs[0].releases.map((r) => r.release.guid)).toEqual(['sw-1'])
  })
})
