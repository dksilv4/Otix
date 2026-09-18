import { describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { applyCatalogStreamEvent } from './catalog-stream-provider'
import { discoverKeys } from '@discover/queries/discover-keys'
import { libraryKeys } from '@library/library-keys'
import { mediaKeys } from '@media/queries/media-keys'
import { gameKeys } from '@/features/launcher/data/queries'

function invalidateCalls(invalidate: ReturnType<typeof vi.spyOn>) {
  return invalidate.mock.calls.map(([options]) => options?.queryKey)
}

describe('applyCatalogStreamEvent', () => {
  it('refreshes only the updated row, not every catalog list', () => {
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    applyCatalogStreamEvent(queryClient, {
      type: 'media.updated',
      id: '90',
      mediaType: 'movie',
    })

    expect(invalidateCalls(invalidate)).toEqual([
      mediaKeys.detail('movie', '90'),
      gameKeys.detail('90'),
    ])
  })

  it('drops the loser and refreshes lists only after a merge', () => {
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const remove = vi.spyOn(queryClient, 'removeQueries')

    applyCatalogStreamEvent(queryClient, {
      type: 'media.merged',
      fromId: '10',
      toId: '20',
      mediaType: 'game',
    })

    expect(remove).toHaveBeenCalledWith({ queryKey: mediaKeys.detail('game', '10') })
    expect(remove).toHaveBeenCalledWith({ queryKey: gameKeys.detail('10') })
    const keys = invalidateCalls(invalidate)
    expect(keys).toContainEqual(mediaKeys.detail('game', '20'))
    expect(keys).toContainEqual(gameKeys.detail('20'))
    expect(keys).toContainEqual(discoverKeys.all())
    expect(keys).toContainEqual(libraryKeys.all())
    expect(keys).not.toContainEqual(mediaKeys.all())
    expect(keys).not.toContainEqual(gameKeys.all)
  })
})
