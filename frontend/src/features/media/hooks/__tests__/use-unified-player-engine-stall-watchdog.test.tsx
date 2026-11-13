import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUnifiedPlayerEngine } from '../use-unified-player-engine'
import type { StreamPlaybackSession } from '../../types/stream-player'

const { mockRecoverMediaError, mockStartLoad, mockSwapAudioCodec, mockDestroy, MockHls } = vi.hoisted(() => {
  const mockRecoverMediaError = vi.fn()
  const mockStartLoad = vi.fn()
  const mockSwapAudioCodec = vi.fn()
  const mockDestroy = vi.fn()

  class MockHls {
    static isSupported = vi.fn().mockReturnValue(true)
    static Events = {
      MANIFEST_PARSED: 'hlsManifestParsed',
      LEVEL_SWITCHED: 'hlsLevelSwitched',
      ERROR: 'hlsError',
    }
    static ErrorTypes = {
      NETWORK_ERROR: 'networkError',
      MEDIA_ERROR: 'mediaError',
    }

    loadSource = vi.fn()
    attachMedia = vi.fn()
    on = vi.fn()
    recoverMediaError = mockRecoverMediaError
    startLoad = mockStartLoad
    swapAudioCodec = mockSwapAudioCodec
    destroy = mockDestroy
    config: any = {}
    levels: any[] = []
  }

  return { mockRecoverMediaError, mockStartLoad, mockSwapAudioCodec, mockDestroy, MockHls }
})

vi.mock('hls.js', () => ({
  default: MockHls,
}))

vi.mock('../../utils/plex-stream', () => ({
  triggerPlexDecision: vi.fn().mockResolvedValue(true),
}))

vi.mock('../../utils/player', () => ({
  safePlay: vi.fn(),
  buildYouTubeEmbedUrl: vi.fn().mockReturnValue(''),
}))

vi.mock('../use-quick-stream', () => ({
  useQuickStream: () => ({ quickStream: vi.fn() }),
}))

const mockHlsSession: StreamPlaybackSession = {
  source: 'plex',
  serverUrl: 'http://192.168.1.100:32400',
  token: 'tok-123',
  itemId: 'item-1',
  title: 'Test Movie',
  playSessionId: 'sess-1',
  hlsUrl: 'http://192.168.1.100:32400/video/:/transcode/universal/start.m3u8',
  audioTracks: [{ id: '1', index: 0, label: 'English', language: 'en', codec: 'aac', channels: 2 }],
  subtitles: [],
  startPositionMs: 0,
  durationMs: 7200000,
}

const mockDirectPlaySession: StreamPlaybackSession = {
  ...mockHlsSession,
  directUrl: 'http://192.168.1.100:32400/library/parts/1/file.mp4',
}

describe('useUnifiedPlayerEngine - Stall Watchdog Recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('triggers Tier 1 HLS recovery when video is stalled for >= 8 seconds', () => {
    const mockFallbackToHls = vi.fn()
    const mockFailoverToBaseUrl = vi.fn()

    const streamPlayer: any = {
      playbackMethod: 'direct-stream',
      isInAppPip: false,
      setAvailableQualities: vi.fn(),
      setActiveLevelHeight: vi.fn(),
      registerVideoElement: vi.fn(),
      failoverToBaseUrl: mockFailoverToBaseUrl,
      fallbackToHls: mockFallbackToHls,
    }

    const { result } = renderHook(() =>
      useUnifiedPlayerEngine({
        isTrailer: false,
        activeStreamSession: mockHlsSession,
        streamPlayer,
        trailerIsMuted: false,
        trailerVolume: 1,
        isDraggingProgress: false,
        setTrailerIsMutedState: vi.fn(),
      }),
    )

    const mockVideo = {
      paused: false,
      ended: false,
      currentTime: 10.0,
      duration: 1000,
      readyState: 4,
      buffered: { length: 0, start: vi.fn(), end: vi.fn() },
      volume: 1,
      muted: false,
      play: vi.fn().mockResolvedValue(undefined),
    } as unknown as HTMLVideoElement

    act(() => {
      result.current.setVideoRef(mockVideo)
    })

    // Advance 5 seconds - stall threshold (8s) not reached
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(mockRecoverMediaError).not.toHaveBeenCalled()
    expect(mockStartLoad).not.toHaveBeenCalled()

    // Advance 5 more seconds (total 10s: tick 1 init + tick 2 timer start + 8s stall threshold)
    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(mockRecoverMediaError).toHaveBeenCalledTimes(1)
    expect(mockStartLoad).toHaveBeenCalledTimes(1)
  })

  it('respects the 2-second user action grace period before flagging a stall', () => {
    const streamPlayer: any = {
      playbackMethod: 'direct-stream',
      isInAppPip: false,
      setAvailableQualities: vi.fn(),
      setActiveLevelHeight: vi.fn(),
      registerVideoElement: vi.fn(),
      failoverToBaseUrl: vi.fn(),
      fallbackToHls: vi.fn(),
    }

    const { result } = renderHook(() =>
      useUnifiedPlayerEngine({
        isTrailer: false,
        activeStreamSession: mockHlsSession,
        streamPlayer,
        trailerIsMuted: false,
        trailerVolume: 1,
        isDraggingProgress: false,
        setTrailerIsMutedState: vi.fn(),
      }),
    )

    const mockVideo = {
      paused: false,
      ended: false,
      currentTime: 25.0,
      duration: 1000,
      readyState: 4,
      buffered: { length: 0, start: vi.fn(), end: vi.fn() },
      volume: 1,
      muted: false,
      play: vi.fn().mockResolvedValue(undefined),
    } as unknown as HTMLVideoElement

    act(() => {
      result.current.setVideoRef(mockVideo)
    })

    // Advance 7 seconds
    act(() => {
      vi.advanceTimersByTime(7000)
    })

    // User triggers seek or play/pause action, updating lastUserActionRef
    act(() => {
      result.current.lastUserActionRef.current = Date.now()
    })

    // Advance 2 seconds
    act(() => {
      vi.advanceTimersByTime(2000)
    })

    // Even though 9s elapsed total, grace period reset the stall timer
    expect(mockRecoverMediaError).not.toHaveBeenCalled()
  })

  it('does not trigger stall recovery when playhead advances normally', () => {
    const streamPlayer: any = {
      playbackMethod: 'direct-stream',
      isInAppPip: false,
      setAvailableQualities: vi.fn(),
      setActiveLevelHeight: vi.fn(),
      registerVideoElement: vi.fn(),
      failoverToBaseUrl: vi.fn(),
      fallbackToHls: vi.fn(),
    }

    const { result } = renderHook(() =>
      useUnifiedPlayerEngine({
        isTrailer: false,
        activeStreamSession: mockHlsSession,
        streamPlayer,
        trailerIsMuted: false,
        trailerVolume: 1,
        isDraggingProgress: false,
        setTrailerIsMutedState: vi.fn(),
      }),
    )

    const mockVideo = {
      paused: false,
      ended: false,
      currentTime: 10.0,
      duration: 1000,
      readyState: 4,
      buffered: { length: 0, start: vi.fn(), end: vi.fn() },
      volume: 1,
      muted: false,
      play: vi.fn().mockResolvedValue(undefined),
    } as unknown as HTMLVideoElement

    act(() => {
      result.current.setVideoRef(mockVideo)
    })

    // Simulate normal playback over 12 seconds where currentTime advances
    for (let i = 0; i < 12; i++) {
      act(() => {
        mockVideo.currentTime += 1.0
        vi.advanceTimersByTime(1000)
      })
    }

    expect(mockRecoverMediaError).not.toHaveBeenCalled()
    expect(mockStartLoad).not.toHaveBeenCalled()
  })

  it('handles Direct Play stalls with playhead nudge on 1st stall and fallbackToHls on 2nd stall', () => {
    const mockFallbackToHls = vi.fn()

    const streamPlayer: any = {
      playbackMethod: 'direct-play',
      isInAppPip: false,
      setAvailableQualities: vi.fn(),
      setActiveLevelHeight: vi.fn(),
      registerVideoElement: vi.fn(),
      failoverToBaseUrl: vi.fn(),
      fallbackToHls: mockFallbackToHls,
    }

    const { result } = renderHook(() =>
      useUnifiedPlayerEngine({
        isTrailer: false,
        activeStreamSession: mockDirectPlaySession,
        streamPlayer,
        trailerIsMuted: false,
        trailerVolume: 1,
        isDraggingProgress: false,
        setTrailerIsMutedState: vi.fn(),
      }),
    )

    const mockVideo = {
      paused: false,
      ended: false,
      currentTime: 50.0,
      duration: 1000,
      readyState: 4,
      buffered: { length: 0, start: vi.fn(), end: vi.fn() },
      volume: 1,
      muted: false,
      play: vi.fn().mockResolvedValue(undefined),
    } as unknown as HTMLVideoElement

    act(() => {
      result.current.setVideoRef(mockVideo)
    })

    // 1st 8s stall (tick 1 + tick 2 + 8s = 10s): nudges playhead by 0.1s
    act(() => {
      vi.advanceTimersByTime(10000)
    })

    expect(mockVideo.currentTime).toBeCloseTo(50.1, 2)
    expect(mockFallbackToHls).not.toHaveBeenCalled()

    // 2nd 8s stall without progress (now stallStartTime is already set): calls fallbackToHls
    act(() => {
      vi.advanceTimersByTime(8500)
    })

    expect(mockFallbackToHls).toHaveBeenCalledTimes(1)
  })
})
