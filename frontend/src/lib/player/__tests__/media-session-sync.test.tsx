import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useMediaSessionSync } from '../hooks/use-media-session-sync'
import type { PlayerTrackInfo } from '../types'

describe('useMediaSessionSync', () => {
  let mockActionHandlers: Record<string, ((details?: unknown) => void) | null>
  let mockMediaSession: {
    metadata: unknown
    playbackState: string
    setActionHandler: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    mockActionHandlers = {}
    mockMediaSession = {
      metadata: null,
      playbackState: 'none',
      setActionHandler: vi.fn((action: string, handler: ((details?: unknown) => void) | null) => {
        mockActionHandlers[action] = handler
      }),
    }

    Object.defineProperty(navigator, 'mediaSession', {
      value: mockMediaSession,
      configurable: true,
      writable: true,
    })
  })

  it('updates metadata and playbackState when a track is playing', () => {
    const track: PlayerTrackInfo = {
      id: 'test-1',
      title: 'Aerodynamic',
      artist: 'Daft Punk',
      albumName: 'Discovery',
      albumArt: 'https://example.com/cover.jpg',
      durationMs: 210000,
      source: 'local',
    }

    renderHook(() =>
      useMediaSessionSync({
        currentTrack: track,
        isPlaying: true,
        togglePlay: vi.fn(),
        skipNext: vi.fn(),
        skipPrevious: vi.fn(),
        seek: vi.fn(),
      }),
    )

    expect(mockMediaSession.playbackState).toBe('playing')
    expect(mockMediaSession.metadata).not.toBeNull()
  })

  it('clears metadata and sets state to none when no track is present', () => {
    renderHook(() =>
      useMediaSessionSync({
        currentTrack: null,
        isPlaying: false,
        togglePlay: vi.fn(),
        skipNext: vi.fn(),
        skipPrevious: vi.fn(),
        seek: vi.fn(),
      }),
    )

    expect(mockMediaSession.metadata).toBeNull()
    expect(mockMediaSession.playbackState).toBe('none')
  })

  it('invokes callbacks when OS media session actions are dispatched', () => {
    const togglePlay = vi.fn()
    const skipNext = vi.fn()
    const skipPrevious = vi.fn()
    const seek = vi.fn()

    renderHook(() =>
      useMediaSessionSync({
        currentTrack: {
          id: '1',
          title: 'Song',
          artist: 'Artist',
          source: 'local',
        },
        isPlaying: true,
        togglePlay,
        skipNext,
        skipPrevious,
        seek,
      }),
    )

    expect(mockActionHandlers['play']).toBeDefined()
    expect(mockActionHandlers['pause']).toBeDefined()
    expect(mockActionHandlers['nexttrack']).toBeDefined()
    expect(mockActionHandlers['previoustrack']).toBeDefined()
    expect(mockActionHandlers['seekto']).toBeDefined()

    mockActionHandlers['play']?.()
    expect(togglePlay).toHaveBeenCalledTimes(1)

    mockActionHandlers['nexttrack']?.()
    expect(skipNext).toHaveBeenCalledTimes(1)

    mockActionHandlers['previoustrack']?.()
    expect(skipPrevious).toHaveBeenCalledTimes(1)

    mockActionHandlers['seekto']?.({ seekTime: 30 })
    expect(seek).toHaveBeenCalledWith(30000)
  })
})
