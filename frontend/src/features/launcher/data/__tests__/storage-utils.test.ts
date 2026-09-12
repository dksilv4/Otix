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
})
