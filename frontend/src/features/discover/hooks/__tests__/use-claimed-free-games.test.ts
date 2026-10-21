import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { useClaimedFreeGames } from '../use-claimed-free-games'
import {
  CLAIMED_FREE_GAMES_STORAGE_KEY,
  HIDE_CLAIMED_FREE_GAMES_STORAGE_KEY,
  CLAIMED_FREE_GAMES_CHANGED_EVENT,
  HIDE_CLAIMED_FREE_GAMES_CHANGED_EVENT,
} from '../../utils/free-games'
import type { FreeGameItem } from '@/features/discover/queries/discover-queries'

const mockPost = vi.fn()
const mockDelete = vi.fn()

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    post: (...args: any[]) => mockPost(...args),
    delete: (...args: any[]) => mockDelete(...args),
  },
}))

const mockShowToast = vi.fn()
vi.mock('@ui/molecules/toast', () => ({
  showToast: (args: unknown) => mockShowToast(args),
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useClaimedFreeGames', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('reads initial empty claimed state and unhidden state', () => {
    const { result } = renderHook(() => useClaimedFreeGames(), {
      wrapper: createWrapper(),
    })

    const sampleItem: FreeGameItem = {
      id: 'epic:astrea',
      store: 'epic',
      storeName: 'Epic Games',
      title: 'Astrea',
      isFreeNow: true,
    }

    expect(result.current.claimedKeys).toEqual([])
    expect(result.current.isClaimed(sampleItem)).toBe(false)
    expect(result.current.hideClaimed).toBe(false)
  })

  it('toggles claim status, updates localStorage, and notifies user via toast', async () => {
    const { result } = renderHook(() => useClaimedFreeGames(), {
      wrapper: createWrapper(),
    })

    const sampleItem: FreeGameItem = {
      id: 'astrea',
      store: 'epic',
      storeName: 'Epic Games',
      title: 'Astrea: Six-Sided Oracles',
      isFreeNow: true,
      mediaItem: { id: '42' } as any,
    }

    // Claim
    await act(async () => {
      const status = await result.current.toggleClaimed(sampleItem)
      expect(status).toBe(true)
    })

    expect(result.current.isClaimed(sampleItem)).toBe(true)
    expect(localStorage.getItem(CLAIMED_FREE_GAMES_STORAGE_KEY)).toContain('epic:astrea')
    expect(mockPost).toHaveBeenCalledWith('/media/42/claim')
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Marked as claimed',
        variant: 'success',
      }),
    )

    // Unclaim
    await act(async () => {
      const status = await result.current.toggleClaimed(sampleItem)
      expect(status).toBe(false)
    })

    expect(result.current.isClaimed(sampleItem)).toBe(false)
    expect(mockDelete).toHaveBeenCalledWith('/media/42/claim')
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Marked as unclaimed',
        variant: 'info',
      }),
    )
  })

  it('recognizes game already owned in user interactions as claimed', () => {
    const { result } = renderHook(() => useClaimedFreeGames(), {
      wrapper: createWrapper(),
    })

    const ownedItem: FreeGameItem = {
      id: 'epic:astrea',
      store: 'epic',
      storeName: 'Epic Games',
      title: 'Astrea',
      isFreeNow: true,
      mediaItem: {
        id: '42',
        userInteractions: {
          owned: true,
          liked: false,
          watchlisted: false,
          watched: false,
          played: false,
          started: false,
          listened: false,
        },
      } as any,
    }

    expect(result.current.isClaimed(ownedItem)).toBe(true)
  })

  it('allows unclaiming a backend-owned game with instant session override', async () => {
    const { result } = renderHook(() => useClaimedFreeGames(), {
      wrapper: createWrapper(),
    })

    const ownedItem: FreeGameItem = {
      id: 'epic:astrea',
      store: 'epic',
      storeName: 'Epic Games',
      title: 'Astrea',
      isFreeNow: true,
      mediaItem: {
        id: '42',
        userInteractions: {
          owned: true,
          liked: false,
          watchlisted: false,
          watched: false,
          played: false,
          started: false,
          listened: false,
        },
      } as any,
    }

    expect(result.current.isClaimed(ownedItem)).toBe(true)

    await act(async () => {
      await result.current.toggleClaimed(ownedItem)
    })

    expect(result.current.isClaimed(ownedItem)).toBe(false)
    expect(mockDelete).toHaveBeenCalledWith('/media/42/claim')
  })

  it('toggles hideClaimed preference and syncs to localStorage', () => {
    const { result } = renderHook(() => useClaimedFreeGames(), {
      wrapper: createWrapper(),
    })

    expect(result.current.hideClaimed).toBe(false)

    act(() => {
      result.current.setHideClaimed(true)
    })

    expect(result.current.hideClaimed).toBe(true)
    expect(localStorage.getItem(HIDE_CLAIMED_FREE_GAMES_STORAGE_KEY)).toBe('true')

    act(() => {
      result.current.setHideClaimed((prev) => !prev)
    })

    expect(result.current.hideClaimed).toBe(false)
    expect(localStorage.getItem(HIDE_CLAIMED_FREE_GAMES_STORAGE_KEY)).toBe('false')
  })

  it('reacts to window storage and custom events', () => {
    const { result } = renderHook(() => useClaimedFreeGames(), {
      wrapper: createWrapper(),
    })

    const testItem: FreeGameItem = {
      id: 'steam:123',
      store: 'steam',
      storeName: 'Steam',
      title: 'Test Game',
      isFreeNow: true,
    }

    expect(result.current.isClaimed(testItem)).toBe(false)

    act(() => {
      localStorage.setItem(CLAIMED_FREE_GAMES_STORAGE_KEY, JSON.stringify(['steam:123']))
      window.dispatchEvent(
        new CustomEvent(CLAIMED_FREE_GAMES_CHANGED_EVENT, {
          detail: { key: 'steam:123', claimed: true },
        }),
      )
    })

    expect(result.current.isClaimed(testItem)).toBe(true)

    act(() => {
      window.dispatchEvent(
        new CustomEvent(HIDE_CLAIMED_FREE_GAMES_CHANGED_EVENT, {
          detail: { hide: true },
        }),
      )
    })

    expect(result.current.hideClaimed).toBe(true)
  })
})
