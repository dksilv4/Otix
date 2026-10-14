import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import {
  PlexAudioProvider,
  usePlexPlayer,
} from '../plex-audio-provider'

describe('PlexAudioProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()

    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
    vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  })

  it('throws when usePlexPlayer is called outside provider', () => {
    expect(() => {
      renderHook(() => usePlexPlayer())
    }).toThrow('usePlexPlayer must be used within PlexAudioProvider')
  })

  it('initializes with default idle state', () => {
    const { result } = renderHook(() => usePlexPlayer(), {
      wrapper: ({ children }) => <PlexAudioProvider>{children}</PlexAudioProvider>,
    })

    expect(result.current.isPlaying).toBe(false)
    expect(result.current.currentTrack).toBe(null)
    expect(result.current.queue).toEqual([])
    expect(result.current.error).toBe(null)
    expect(result.current.position).toBe(0)
    expect(result.current.duration).toBe(0)
  })
})
