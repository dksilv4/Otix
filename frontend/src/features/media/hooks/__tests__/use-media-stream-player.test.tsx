import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  MediaStreamPlayerProvider,
  useMediaStreamPlayer,
} from '../use-media-stream-player'
import type { StreamPlaybackSession } from '../../types/stream-player'

const mockSession: StreamPlaybackSession = {
  source: 'jellyfin',
  serverUrl: 'http://localhost:8096',
  token: 'test-token',
  itemId: 'item-123',
  title: 'Inception',
  subtitle: '2010',
  playSessionId: 'sess-abc',
  directUrl: 'http://localhost:8096/Videos/item-123/stream?static=true',
  hlsUrl: 'http://localhost:8096/Videos/item-123/master.m3u8',
  container: 'mp4',
  videoCodec: 'h264',
  audioCodec: 'aac',
  audioTracks: [
    { id: 'a1', index: 0, label: 'English (AAC)', language: 'eng', codec: 'aac', channels: 2 },
  ],
  subtitles: [
    { id: 's1', index: 0, label: 'English', language: 'eng', format: 'vtt', isExternal: true, requiresBurnIn: false },
  ],
  startPositionMs: 5000,
  durationMs: 120000,
}

describe('useMediaStreamPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('initializes with default closed state', () => {
    const { result } = renderHook(() => useMediaStreamPlayer(), {
      wrapper: MediaStreamPlayerProvider,
    })

    expect(result.current.isOpen).toBe(false)
    expect(result.current.session).toBe(null)
    expect(result.current.isPlaying).toBe(false)
    expect(result.current.currentTime).toBe(0)
    expect(result.current.isInAppPip).toBe(false)
    expect(result.current.isOverallPip).toBe(false)
  })

  it('opens stream and correctly initializes session state', () => {
    const { result } = renderHook(() => useMediaStreamPlayer(), {
      wrapper: MediaStreamPlayerProvider,
    })

    act(() => {
      result.current.openStream(mockSession)
    })

    expect(result.current.isOpen).toBe(true)
    expect(result.current.session).toEqual(mockSession)
    expect(result.current.isPlaying).toBe(true)
    expect(result.current.currentTime).toBe(5) // 5000ms -> 5s
    expect(result.current.duration).toBe(120) // 120000ms -> 120s
    expect(result.current.playbackMethod).toBe('direct-play')
    expect(result.current.isInAppPip).toBe(false)
  })

  it('routes to direct-stream when audio is AC3', () => {
    const { result } = renderHook(() => useMediaStreamPlayer(), {
      wrapper: MediaStreamPlayerProvider,
    })

    act(() => {
      result.current.openStream({
        ...mockSession,
        audioCodec: 'ac3',
      })
    })

    expect(result.current.playbackMethod).toBe('direct-stream')
  })

  it('toggles play/pause, seeks, and updates volume', () => {
    const { result } = renderHook(() => useMediaStreamPlayer(), {
      wrapper: MediaStreamPlayerProvider,
    })

    act(() => {
      result.current.openStream(mockSession)
    })

    act(() => {
      result.current.togglePlay()
    })
    expect(result.current.isPlaying).toBe(false)

    act(() => {
      result.current.seek(45)
    })
    expect(result.current.currentTime).toBe(45)

    act(() => {
      result.current.setVolume(0.8)
    })
    expect(result.current.volume).toBe(0.8)
  })

  it('closes stream and resets session', () => {
    const { result } = renderHook(() => useMediaStreamPlayer(), {
      wrapper: MediaStreamPlayerProvider,
    })

    act(() => {
      result.current.openStream(mockSession)
    })
    expect(result.current.isOpen).toBe(true)

    act(() => {
      result.current.closeStream()
    })
    expect(result.current.isOpen).toBe(false)
    expect(result.current.session).toBe(null)
    expect(result.current.isInAppPip).toBe(false)
    expect(result.current.isOverallPip).toBe(false)
  })

  it('manages in-app PiP mode correctly', () => {
    const { result } = renderHook(() => useMediaStreamPlayer(), {
      wrapper: MediaStreamPlayerProvider,
    })

    act(() => {
      result.current.openStream(mockSession)
    })
    expect(result.current.isInAppPip).toBe(false)

    act(() => {
      result.current.setInAppPip(true)
    })
    expect(result.current.isInAppPip).toBe(true)

    act(() => {
      result.current.toggleInAppPip()
    })
    expect(result.current.isInAppPip).toBe(false)
  })

  it('manages overall PiP mode with registered video element', async () => {
    const { result } = renderHook(() => useMediaStreamPlayer(), {
      wrapper: MediaStreamPlayerProvider,
    })

    const video = document.createElement('video')
    video.requestPictureInPicture = vi.fn().mockResolvedValue({} as PictureInPictureWindow)

    act(() => {
      result.current.openStream(mockSession)
      result.current.registerVideoElement(video)
    })

    expect(result.current.isOverallPip).toBe(false)

    await act(async () => {
      await result.current.requestOverallPip()
    })
    expect(video.requestPictureInPicture).toHaveBeenCalledTimes(1)
    expect(result.current.isOverallPip).toBe(true)

    act(() => {
      result.current.setIsOverallPip(false)
    })
    expect(result.current.isOverallPip).toBe(false)
  })
})
