import { describe, expect, it } from 'vitest'

import { mergeDuplicateGames } from '../storage-utils'
import type { LocalGame } from '../../types'

function makeGame(overrides: Partial<LocalGame> = {}): LocalGame {
  return {
    id: 'g1',
    title: 'Test Game',
    exePath: '',
    installDir: '',
    platform: 'epic',
    ...overrides,
  }
}

describe('mergeDuplicateGames', () => {
  it('collapses rows that resolve to the same catalog game', () => {
    const parent = makeGame({
      id: 'a',
      title: 'Ghostwire Tokyo',
      otixMediaId: 'oti_x',
      otixMediaTitle: 'Ghostwire: Tokyo',
    })
    const prelude = makeGame({
      id: 'b',
      title: 'Ghostwire: Tokyo - Prelude',
      otixMediaId: 'oti_x',
      otixMediaTitle: 'Ghostwire: Tokyo',
    })
    const result = mergeDuplicateGames([parent, prelude])
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Ghostwire Tokyo')
  })

  it('prefers the row whose title matches the catalog title exactly', () => {
    const parent = makeGame({ id: 'a', title: 'Nightingale', otixMediaId: 'oti_y', otixMediaTitle: 'Nightingale' })
    const legacy = makeGame({ id: 'b', title: 'Nightingale - Legacy Mode', otixMediaId: 'oti_y', otixMediaTitle: 'Nightingale' })
    const result = mergeDuplicateGames([legacy, parent])
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Nightingale')
  })

  it('prefers non-DLC rows over DLC rows sharing a catalog id', () => {
    const dlc = makeGame({ id: 'a', title: 'Model Builder: Aether DLC', otixMediaId: 'oti_z', otixMediaTitle: 'Model Builder' })
    const main = makeGame({ id: 'b', title: 'Model Builder: Complete Edition', otixMediaId: 'oti_z', otixMediaTitle: 'Model Builder' })
    const result = mergeDuplicateGames([dlc, main])
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Model Builder: Complete Edition')
  })

  it('keeps distinct catalog games separate', () => {
    const a = makeGame({ id: 'a', title: 'Model Builder', otixMediaId: 'oti_1' })
    const b = makeGame({ id: 'b', title: 'Model Builder: Cars Pack DLC', otixMediaId: 'oti_2' })
    const result = mergeDuplicateGames([a, b])
    expect(result).toHaveLength(2)
  })

  it('merges unmatched games by normalized title', () => {
    const a = makeGame({ id: 'a', title: 'Batman™ Arkham Knight', exePath: '/x/a.exe' })
    const b = makeGame({ id: 'b', title: 'Batman Arkham Knight', exePath: '/x/b.exe' })
    const result = mergeDuplicateGames([a, b])
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Batman Arkham Knight')
    expect(result[0].id).toBe('b')
  })

  it('unifies installed PC game and source ISO image into playable card with ISO source', () => {
    const installed = makeGame({
      id: 'inst-1',
      title: 'Cyberpunk 2077',
      platform: 'pc',
      exePath: 'C:/Games/Cyberpunk 2077/bin/x64/Cyberpunk2077.exe',
      installDir: 'C:/Games/Cyberpunk 2077',
      otixMediaId: 'cp2077',
    })
    const iso = makeGame({
      id: 'iso-1',
      title: 'Cyberpunk 2077.iso',
      platform: 'iso',
      exePath: 'D:/ISOs/Cyberpunk 2077.iso',
      installDir: 'D:/ISOs',
      otixMediaId: 'cp2077',
    })

    const result = mergeDuplicateGames([iso, installed])
    expect(result).toHaveLength(1)
    // Playable installed row wins
    expect(result[0].id).toBe('inst-1')
    expect(result[0].platform).toBe('pc')
    expect(result[0].exePath).toBe('C:/Games/Cyberpunk 2077/bin/x64/Cyberpunk2077.exe')

    // Sources contain both platforms and the rich ISO source for mounting
    const isoSources = (result[0].sources as any[])?.filter((s) => s?.isIso)
    expect(isoSources).toHaveLength(1)
    expect(isoSources[0].path).toBe('D:/ISOs/Cyberpunk 2077.iso')
    expect(isoSources[0].format).toBe('ISO')
  })

  it('unifies multi-disc ISO files by title and disc stripping', () => {
    const disc1 = makeGame({
      id: 'disc-1',
      title: 'Final Fantasy VII Disc 1.iso',
      platform: 'iso',
      exePath: 'D:/ISOs/FFVII_Disc1.iso',
    })
    const disc2 = makeGame({
      id: 'disc-2',
      title: 'Final Fantasy VII Disc 2.iso',
      platform: 'iso',
      exePath: 'D:/ISOs/FFVII_Disc2.iso',
    })

    const result = mergeDuplicateGames([disc1, disc2])
    expect(result).toHaveLength(1)
    const isoSources = (result[0].sources as any[])?.filter((s) => s?.isIso)
    expect(isoSources).toHaveLength(2)
  })

  it('respects explicitly unlinked source pairs from localStorage', () => {
    const installed = makeGame({
      id: 'game-a',
      title: 'Half-Life 2',
      platform: 'pc',
      exePath: 'C:/Games/hl2/hl2.exe',
      otixMediaId: 'hl2-media',
    })
    const iso = makeGame({
      id: 'game-b',
      title: 'Half-Life 2.iso',
      platform: 'iso',
      exePath: 'D:/ISOs/hl2.iso',
      otixMediaId: 'hl2-media',
    })

    localStorage.setItem('otix:unlinked-sources', JSON.stringify(['game-a:::game-b']))
    const result = mergeDuplicateGames([installed, iso])
    localStorage.removeItem('otix:unlinked-sources')

    expect(result).toHaveLength(2)
  })

  it('merges updateFiles across duplicate entries', () => {
    const installed = makeGame({
      id: 'inst-1',
      title: 'Witcher 3',
      platform: 'pc',
      exePath: 'C:/Games/W3/bin/witcher3.exe',
      otixMediaId: 'w3',
      updateFiles: [{ name: 'Patch 1.32', path: 'C:/Updates/1.32.exe', kind: 'update' }],
    })
    const backup = makeGame({
      id: 'iso-1',
      title: 'Witcher 3.iso',
      platform: 'iso',
      exePath: 'D:/ISOs/w3.iso',
      otixMediaId: 'w3',
      updateFiles: [{ name: 'DLC Blood and Wine', path: 'D:/Updates/dlc.bin', kind: 'dlc' }],
    })

    const result = mergeDuplicateGames([installed, backup])
    expect(result).toHaveLength(1)
    expect(result[0].updateFiles).toHaveLength(2)
    expect(result[0].updateFiles?.map((u) => u.name)).toEqual(['Patch 1.32', 'DLC Blood and Wine'])
  })
})
