import { describe, expect, it } from 'vitest'

import type { ServerGameFile } from '@/features/downloads/types'
import type { LocalGame } from '../../types'
import {
  applyAutoMatchToGame,
  autoMatchTargetGames,
  foundServerGameTitles,
  groupServerFilesByGame,
  listFoundServerGames,
  mergeLocalAndServerGames,
  parseServerFile,
  persistableServerGames,
  serverFileToLocalGame,
  serverGameId,
} from '../visible-games'

function localGame(overrides: Partial<LocalGame> = {}): LocalGame {
  return {
    id: 'local-1',
    title: 'Half-Life 2',
    exePath: '/games/hl2.exe',
    installDir: '/games',
    platform: 'steam',
    ...overrides,
  }
}

function serverFile(overrides: Partial<ServerGameFile> = {}): ServerGameFile {
  return {
    serverId: 1,
    serverName: 'Home NAS',
    serverUrl: 'http://nas.local',
    fileId: 'file-1',
    filename: 'Half.Life.2.iso',
    filesize: 4_500_000_000,
    extension: '.iso',
    formatCategory: 'iso',
    gameTitle: 'Half-Life 2',
    libraryName: 'PC Games',
    downloadUrl: 'http://nas.local/files/file-1',
    catalogItem: { id: 'cat-hl2', title: 'Half-Life 2', slug: 'half-life-2' },
    ...overrides,
  }
}

describe('groupServerFilesByGame', () => {
  it('keeps a base ISO in the library and nests updates under it', () => {
    const groups = groupServerFilesByGame([
      serverFile(),
      serverFile({
        fileId: 'file-upd',
        filename: 'Half.Life.2.Update.1.2-FLT.iso',
        gameTitle: 'Half Life 2 Update 1 2 Flt',
        filesize: 800_000_000,
        catalogItem: null,
      }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].primary.file.fileId).toBe('file-1')
    expect(groups[0].updates.map((item) => item.file.fileId)).toEqual(['file-upd'])
    expect(groups[0].updates[0].parsed.kind).toBe('update')
  })

  it('nests named DLC under the base game instead of listing it separately', () => {
    const groups = groupServerFilesByGame([
      serverFile({
        fileId: 'base',
        filename: 'Cyberpunk.2077-GOG.iso',
        gameTitle: 'Cyberpunk 2077',
        catalogItem: { id: 'cp', title: 'Cyberpunk 2077', slug: 'cyberpunk-2077' },
      }),
      serverFile({
        fileId: 'dlc',
        filename: 'Cyberpunk.2077.Phantom.Liberty.DLC-GOG.iso',
        gameTitle: 'Cyberpunk 2077 Phantom Liberty DLC',
        catalogItem: { id: 'cp', title: 'Cyberpunk 2077', slug: 'cyberpunk-2077' },
      }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].primary.file.fileId).toBe('base')
    expect(groups[0].dlc.map((item) => item.file.fileId)).toEqual(['dlc'])
  })

  it('does not treat an update as the primary when a base game exists', () => {
    const groups = groupServerFilesByGame([
      serverFile({
        fileId: 'upd',
        filename: 'Cyberpunk.2077.Update.2.13-GOG.iso',
        gameTitle: 'Cyberpunk 2077 Update 2 13',
        filesize: 20_000_000_000,
        catalogItem: null,
      }),
      serverFile({
        fileId: 'base',
        filename: 'Cyberpunk.2077-GOG.iso',
        gameTitle: 'Cyberpunk 2077',
        filesize: 70_000_000_000,
        catalogItem: { id: 'cp', title: 'Cyberpunk 2077', slug: 'cyberpunk-2077' },
      }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].primary.file.fileId).toBe('base')
    expect(groups[0].updates).toHaveLength(1)
  })

  it('treats a glued Cyberpunk Update2 filename as an update, not a second game', () => {
    const groups = groupServerFilesByGame([
      serverFile({
        fileId: 'base',
        filename: 'Cyberpunk.2077-GOG.iso',
        gameTitle: 'Cyberpunk 2077',
        filesize: 70_000_000_000,
        catalogItem: { id: 'cp', title: 'Cyberpunk 2077', slug: 'cyberpunk-2077' },
      }),
      serverFile({
        fileId: 'upd',
        filename: 'Cyberpunk.2077.Update2.13-GOG.iso',
        gameTitle: 'Cyberpunk 2077 Update2 13',
        filesize: 8_000_000_000,
        catalogItem: { id: 'cp', title: 'Cyberpunk 2077', slug: 'cyberpunk-2077' },
      }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].primary.file.fileId).toBe('base')
    expect(groups[0].games).toHaveLength(1)
    expect(groups[0].updates.map((item) => item.file.fileId)).toEqual(['upd'])
  })
})

describe('mergeLocalAndServerGames', () => {
  it('adds scanned server releases that are not already in the local library', () => {
    const result = mergeLocalAndServerGames(
      [localGame({ title: 'Portal', otixMediaId: 'cat-portal' })],
      [serverFile()],
    )

    expect(result.map((game) => game.title)).toEqual(['Portal', 'Half-Life 2'])
    expect(result[1].platform).toBe('server')
    expect(result[1].id).toBe(serverGameId('half life 2'))
    expect(result[1].serverId).toBe(1)
    expect(result[1].serverFileId).toBe('file-1')
  })

  it('does not duplicate a local game that matches a scanned release', () => {
    const result = mergeLocalAndServerGames(
      [localGame({ otixMediaId: 'cat-hl2' })],
      [serverFile()],
    )

    expect(result).toHaveLength(1)
    expect(result[0].platform).toBe('steam')
  })

  it('hides updates from the library and attaches them to the parent game', () => {
    const result = mergeLocalAndServerGames(
      [],
      [
        serverFile(),
        serverFile({
          fileId: 'file-2',
          filename: 'Half.Life.2.Update.1-FLT.iso',
          gameTitle: 'Half Life 2 Update 1',
          catalogItem: null,
        }),
      ],
    )

    expect(result).toHaveLength(1)
    expect(result[0].updateFiles).toHaveLength(1)
    expect(result[0].updateFiles?.[0].kind).toBe('update')
    expect(result[0].updateFiles?.[0].name).toContain('Update')
  })

  it('attaches scanned updates onto an already-installed local game', () => {
    const result = mergeLocalAndServerGames(
      [localGame({ otixMediaId: 'cat-hl2' })],
      [
        serverFile({
          fileId: 'upd',
          filename: 'Half.Life.2.Patch.1.0-FLT.iso',
          gameTitle: 'Half Life 2 Patch',
          catalogItem: null,
        }),
      ],
    )

    expect(result).toHaveLength(1)
    expect(result[0].platform).toBe('steam')
    expect(result[0].updateFiles).toHaveLength(1)
    expect(result[0].updateFiles?.[0].kind).toBe('update')
  })

  it('hides application entries from the launcher list', () => {
    const discord = { ...localGame({ title: 'Discord', platform: 'pc' }), isApp: true }
    const result = mergeLocalAndServerGames([discord], [serverFile()])

    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Half-Life 2')
  })

  it('does not list an orphan update as its own library game', () => {
    const result = mergeLocalAndServerGames(
      [],
      [
        serverFile({
          fileId: 'upd',
          filename: 'Portal.Update.1-FLT.iso',
          gameTitle: 'Portal Update 1',
          catalogItem: null,
        }),
      ],
    )

    expect(result).toHaveLength(0)
  })

  it('does not keep a persisted server row once the game is installed locally', () => {
    const result = mergeLocalAndServerGames(
      [
        localGame({ otixMediaId: 'cat-hl2' }),
        localGame({
          id: serverGameId('half life 2'),
          title: 'Half-Life 2',
          platform: 'server',
          otixMediaId: 'cat-hl2',
        }),
      ],
      [serverFile()],
    )

    expect(result).toHaveLength(1)
    expect(result[0].platform).toBe('steam')
  })

  it('hides unmatched scanned files instead of listing them as games', () => {
    const result = mergeLocalAndServerGames(
      [],
      [
        serverFile({
          fileId: 'junk',
          filename: 'Setup.and.Crack-GROUP.iso',
          gameTitle: 'Setup and Crack Group',
          catalogItem: null,
        }),
      ],
    )

    expect(result).toHaveLength(0)
  })

  it('does not keep a persisted unmatched server dump in the library', () => {
    const result = mergeLocalAndServerGames(
      [
        localGame({
          id: serverGameId('random dump'),
          title: 'Random Dump',
          platform: 'server',
        }),
      ],
      [],
    )

    expect(result).toHaveLength(0)
  })

  it('does not list a catalog-matched Cyberpunk update as its own library game', () => {
    const result = mergeLocalAndServerGames(
      [],
      [
        serverFile({
          fileId: 'upd',
          filename: 'Cyberpunk.2077.Update2.13-GOG.iso',
          gameTitle: 'Cyberpunk 2077 Update2 13',
          catalogItem: { id: 'cp', title: 'Cyberpunk 2077', slug: 'cyberpunk-2077' },
        }),
      ],
    )

    expect(result).toHaveLength(0)
  })

  it('drops a persisted server card when the only scanned file is a Cyberpunk update', () => {
    const result = mergeLocalAndServerGames(
      [
        localGame({
          id: serverGameId('cyberpunk 2077'),
          title: 'Cyberpunk 2077',
          platform: 'server',
          otixMediaId: 'cp',
        }),
      ],
      [
        serverFile({
          fileId: 'upd',
          filename: 'Cyberpunk.2077.Update2.13-GOG.iso',
          gameTitle: 'Cyberpunk 2077 Update2 13',
          catalogItem: { id: 'cp', title: 'Cyberpunk 2077', slug: 'cyberpunk-2077' },
        }),
      ],
    )

    expect(result).toHaveLength(0)
  })
})

describe('listFoundServerGames', () => {
  it('lists unmatched scans so they can be added manually', () => {
    const files = [
      serverFile({
        fileId: 'junk',
        filename: 'Setup.and.Crack-GROUP.iso',
        gameTitle: 'Setup and Crack Group',
        catalogItem: null,
      }),
      serverFile(),
    ]
    const found = listFoundServerGames([], files)

    expect(found.filter((item) => item.status === 'unmatched')).toHaveLength(1)
    expect(found.find((item) => item.status === 'unmatched')?.filename).toBe('Setup.and.Crack-GROUP.iso')
    expect(found.find((item) => item.status === 'in-library')?.game.title).toBe('Half-Life 2')
    expect(mergeLocalAndServerGames([], files)).toHaveLength(1)
    const titles = foundServerGameTitles([], files)
    expect(titles).toContain('Half-Life 2')
    expect(titles.length).toBeGreaterThanOrEqual(2)
  })

  it('does not list an update-only Cyberpunk file as a found game', () => {
    const found = listFoundServerGames(
      [],
      [
        serverFile({
          fileId: 'upd',
          filename: 'Cyberpunk.2077.Update2.13-GOG.iso',
          gameTitle: 'Cyberpunk 2077 Update2 13',
          catalogItem: { id: 'cp', title: 'Cyberpunk 2077', slug: 'cyberpunk-2077' },
        }),
      ],
    )

    expect(found).toHaveLength(0)
  })

  it('marks a scan attached to a local game as already in the library', () => {
    const found = listFoundServerGames(
      [localGame()],
      [serverFile()],
    )

    expect(found).toHaveLength(1)
    expect(found[0].status).toBe('in-library')
  })

  it('does not list .bin files as found games', () => {
    const found = listFoundServerGames(
      [],
      [
        serverFile({
          fileId: 'bin-1',
          filename: 'Game.bin',
          extension: '.bin',
          formatCategory: 'iso',
          gameTitle: 'Game',
          catalogItem: null,
        }),
        serverFile({
          fileId: 'bin-2',
          filename: 'Track 01.bin',
          extension: '.bin',
          relativePath: 'Some Title/Track 01.bin',
          gameTitle: 'Track 01',
          catalogItem: null,
        }),
        serverFile(),
      ],
    )

    expect(found.every((item) => !item.filename.toLowerCase().endsWith('.bin'))).toBe(true)
    expect(found).toHaveLength(1)
    expect(found[0].game.title).toBe('Half-Life 2')
  })
})

describe('persistableServerGames', () => {
  it('keeps unmatched scans so a later manual match can be saved', () => {
    const persistable = persistableServerGames(
      [],
      [
        serverFile({
          fileId: 'junk',
          filename: 'Setup.and.Crack-GROUP.iso',
          gameTitle: 'Setup and Crack Group',
          catalogItem: null,
        }),
        serverFile(),
      ],
    )

    expect(persistable).toHaveLength(2)
    expect(persistable?.some((game) => game.title === 'Half-Life 2' && game.otixMediaId === 'cat-hl2')).toBe(true)
    expect(persistable?.some((game) => !game.otixMediaId)).toBe(true)
  })

  it('does not persist while server files have not loaded', () => {
    expect(persistableServerGames([], undefined)).toBeNull()
  })
})

describe('autoMatchTargetGames', () => {
  it('ranks clean short titles ahead of scene dumps', () => {
    const targets = autoMatchTargetGames([
      localGame({ id: 'server-dump', title: 'Balatro.v1.0.0L-Unleashed', platform: 'server' }),
      localGame({ id: 'server-balatro', title: 'Balatro', platform: 'server' }),
      localGame({ id: 'server-long', title: 'The Binding of Isaac Rebirth', platform: 'server' }),
    ], 2)
    expect(targets.map((game) => game.id)).toEqual(['server-balatro', 'server-long'])
  })
})

describe('applyAutoMatchToGame', () => {
  it('attaches catalog ids so the scanned game can hydrate', () => {
    const next = applyAutoMatchToGame(
      localGame({ id: 'server-balatro', title: 'Balatro', platform: 'server' }),
      { mediaItemId: '91', title: 'Balatro', posterUrl: 'https://img/balatro.jpg' },
    )
    expect(next.otixMediaId).toBe('91')
    expect(next.data?.id).toBe('91')
    expect(next.otixPosterUrl).toBe('https://img/balatro.jpg')
  })
})

describe('serverFileToLocalGame', () => {
  it('uses a stable server id from the parsed game key', () => {
    const game = serverFileToLocalGame(serverFile({ catalogItem: null, fileId: 'abc' }))
    expect(game.id).toBe(serverGameId('half life 2'))
    expect(game.platform).toBe('server')
  })
})

describe('parseServerFile', () => {
  it('matches setup.exe from the parent folder short path', () => {
    const { parsed } = parseServerFile(serverFile({
      filename: 'setup.exe',
      extension: '.exe',
      formatCategory: 'installer',
      gameTitle: 'Setup',
      relativePath: 'Cyberpunk 2077/setup.exe',
      catalogItem: null,
    }))
    expect(parsed.gameKey).toBe('cyberpunk 2077')
    expect(parsed.kind).toBe('game')
  })

  it('skips generic install folders when reading the short path', () => {
    const groups = groupServerFilesByGame([
      serverFile({
        filename: 'setup.exe',
        extension: '.exe',
        formatCategory: 'installer',
        gameTitle: 'Setup',
        relativePath: 'Hollow Knight Silksong/install/setup.exe',
        catalogItem: null,
      }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].title.toLowerCase()).toContain('hollow knight silksong')
  })
})
