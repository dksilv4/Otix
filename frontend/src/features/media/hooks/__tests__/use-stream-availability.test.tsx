import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useStreamAvailability } from '../use-stream-availability'
import * as authHooks from '@auth/hooks/use-auth'
import * as libraryQueries from '@/features/library/library-queries'
import * as pluginApi from '@/features/plugins/api'

vi.mock('@auth/hooks/use-auth')
vi.mock('@/features/library/library-queries')
vi.mock('@/features/plugins/api')

describe('useStreamAvailability & useStreamableCatalog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('detects streamability from connected backend Plex catalog', () => {
    vi.mocked(authHooks.useAuth).mockReturnValue({
      user: { id: 'u1', plexId: 'plex-123' } as any,
      isAuthenticated: true,
      isLoading: false,
    } as any)

    vi.mocked(libraryQueries.useLibraryTab).mockReturnValue({
      data: {
        pages: [
          {
            items: [
              { id: '101', slug: 'fight-club-1999', tmdbId: '550', title: 'Fight Club' },
              { id: '202', slug: 'breaking-bad', tmdbId: '1396', title: 'Breaking Bad' },
            ],
          },
        ],
      },
      isLoading: false,
      isError: false,
    } as any)

    vi.mocked(pluginApi.getPluginAPI).mockReturnValue(null)

    const { result } = renderHook(() =>
      useStreamAvailability({
        mediaId: '101',
        tmdbId: '550',
        mediaType: 'movie',
      }),
    )

    expect(result.current.isStreamable).toBe(true)
    expect(result.current.providerLabel).toBe('Plex')
    expect(result.current.tone).toBe('amber')
  })

  it('returns not streamable when media is not in catalog and no plugins match', () => {
    vi.mocked(authHooks.useAuth).mockReturnValue({
      user: { id: 'u1', plexId: 'plex-123' } as any,
      isAuthenticated: true,
      isLoading: false,
    } as any)

    vi.mocked(libraryQueries.useLibraryTab).mockReturnValue({
      data: { pages: [{ items: [] }] },
      isLoading: false,
      isError: false,
    } as any)

    vi.mocked(pluginApi.getPluginAPI).mockReturnValue(null)

    const { result } = renderHook(() =>
      useStreamAvailability({
        mediaId: '999',
        tmdbId: '99999',
        mediaType: 'movie',
      }),
    )

    expect(result.current.isStreamable).toBe(false)
  })

  it('detects streamability from desktop plugin slot data', async () => {
    vi.mocked(authHooks.useAuth).mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    } as any)

    vi.mocked(libraryQueries.useLibraryTab).mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
    } as any)

    const getSlotData = vi.fn().mockResolvedValue([
      {
        pluginId: 'jellyfin',
        data: {
          widgets: [
            {
              type: 'badge',
              props: { text: 'On Jellyfin', tone: 'success' },
            },
          ],
        },
      },
    ])

    vi.mocked(pluginApi.getPluginAPI).mockReturnValue({
      getSlotData,
    } as any)

    const { result } = renderHook(() =>
      useStreamAvailability({
        mediaId: '456',
        tmdbId: '789',
        mediaType: 'movie',
      }),
    )

    await waitFor(() => {
      expect(result.current.isStreamable).toBe(true)
    })
    expect(result.current.providerLabel).toBe('On Jellyfin')
  })
})
