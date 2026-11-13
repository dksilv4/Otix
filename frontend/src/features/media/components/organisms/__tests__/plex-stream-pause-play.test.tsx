import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MediaStreamPlayerModal } from '../media-stream-player-modal'
import {
  MediaStreamPlayerProvider,
  useMediaStreamPlayer,
} from '@/features/media/hooks/use-media-stream-player'
import { UniversalPlayerProvider } from '@/features/player/core/universal-player-context'
import { universalPlayerEngine } from '@/features/player/core/universal-player-engine'
import { buildPlexPlaybackSession } from '@/features/media/utils/plex-stream'
import type { StreamPlaybackSession } from '@/features/media/types/stream-player'

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
    get: vi.fn().mockResolvedValue({ data: null }),
  },
}))

const mockPlexConnectInfo = {
  baseUrl: 'http://192.168.1.100:32400',
  token: 'plex-secret-token',
  ratingKey: '9876',
  title: 'Inception Plex',
  duration: 7200000,
  viewOffset: 45000,
  container: 'mp4',
  videoCodec: 'h264',
  audioCodec: 'aac',
  directUrl: '/library/parts/9876/file.mp4',
}

const mockPlexSession: StreamPlaybackSession = buildPlexPlaybackSession(mockPlexConnectInfo, {
  title: 'Inception Plex',
  customSessionId: 'plex-test-session-123',
})

const TestPlexPlayerTrigger = ({ session = mockPlexSession }: { session?: StreamPlaybackSession }) => {
  const { openStream, togglePlay, play, pause } = useMediaStreamPlayer()
  return (
    <div>
      <button type="button" onClick={() => openStream(session)}>
        Open Plex Stream
      </button>
      <button type="button" onClick={togglePlay}>
        Toggle Play
      </button>
      <button type="button" onClick={play}>
        Play Stream
      </button>
      <button type="button" onClick={pause}>
        Pause Stream
      </button>
    </div>
  )
}

describe('Plex Stream Pause/Play Functionality', () => {
  let playSpy: any
  let pauseSpy: any

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    universalPlayerEngine.stop()

    playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(function (this: any) {
      Object.defineProperty(this, 'paused', { value: false, configurable: true, writable: true })
      return Promise.resolve()
    })
    pauseSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: any) {
      Object.defineProperty(this, 'paused', { value: true, configurable: true, writable: true })
    })
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
  })

  describe('UniversalPlayerEngine & Plex Source Adapter', () => {
    it('preserves session identifier consistently across PMS stream and timeline reports', async () => {
      render(
        <UniversalPlayerProvider>
          <MediaStreamPlayerProvider>
            <TestPlexPlayerTrigger />
            <MediaStreamPlayerModal />
          </MediaStreamPlayerProvider>
        </UniversalPlayerProvider>,
      )

      await act(async () => {
        fireEvent.click(screen.getByText('Open Plex Stream'))
      })

      expect(universalPlayerEngine.getPlaySessionId()).toBe('plex-test-session-123')

      // Pause playback
      await act(async () => {
        fireEvent.click(screen.getByText('Pause Stream'))
      })

      // Verify PMS timeline call contains the exact same sessionId and state=paused
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('X-Plex-Session-Identifier=plex-test-session-123'),
        expect.anything(),
      )
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('state=paused'),
        expect.anything(),
      )
    })

    it('pauses cleanly when stream is in buffering state', async () => {
      render(
        <UniversalPlayerProvider>
          <MediaStreamPlayerProvider>
            <TestPlexPlayerTrigger />
            <MediaStreamPlayerModal />
          </MediaStreamPlayerProvider>
        </UniversalPlayerProvider>,
      )

      await act(async () => {
        fireEvent.click(screen.getByText('Open Plex Stream'))
      })

      // Simulate stream buffer stall
      act(() => {
        universalPlayerEngine.onVideoBuffering(true)
      })
      expect(universalPlayerEngine.getState().status).toBe('buffering')

      // User pauses while buffering
      await act(async () => {
        fireEvent.click(screen.getByText('Toggle Play'))
      })

      expect(universalPlayerEngine.getState().status).toBe('paused')
      expect(pauseSpy).toHaveBeenCalled()

      // User resumes
      await act(async () => {
        fireEvent.click(screen.getByText('Toggle Play'))
      })

      expect(universalPlayerEngine.getState().status).toBe('playing')
      expect(playSpy).toHaveBeenCalled()
    })

    it('toggles pause and play via transport UI controls and keyboard shortcuts', async () => {
      render(
        <UniversalPlayerProvider>
          <MediaStreamPlayerProvider>
            <TestPlexPlayerTrigger />
            <MediaStreamPlayerModal />
          </MediaStreamPlayerProvider>
        </UniversalPlayerProvider>,
      )

      await act(async () => {
        fireEvent.click(screen.getByText('Open Plex Stream'))
      })

      // Transport button should indicate pause is available
      const pauseBtn = screen.getByTitle(/Pause \(Space\)/i)
      expect(pauseBtn).toBeInTheDocument()

      // Click pause
      await act(async () => {
        fireEvent.click(pauseBtn)
      })

      // Now transport button should indicate play is available
      const playBtn = screen.getByTitle(/Play \(Space\)/i)
      expect(playBtn).toBeInTheDocument()
      expect(universalPlayerEngine.getState().status).toBe('paused')

      // Press Spacebar to resume
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))
      })

      expect(screen.getByTitle(/Pause \(Space\)/i)).toBeInTheDocument()
      expect(universalPlayerEngine.getState().status).toBe('playing')
    })

    it('toggles pause and play by clicking the video surface overlay', async () => {
      render(
        <UniversalPlayerProvider>
          <MediaStreamPlayerProvider>
            <TestPlexPlayerTrigger />
            <MediaStreamPlayerModal />
          </MediaStreamPlayerProvider>
        </UniversalPlayerProvider>,
      )

      await act(async () => {
        fireEvent.click(screen.getByText('Open Plex Stream'))
      })

      const videoSurface = screen.getByLabelText(/Pause video/i)
      expect(videoSurface).toBeInTheDocument()

      // Click video surface to pause
      await act(async () => {
        fireEvent.click(videoSurface)
      })

      expect(universalPlayerEngine.getState().status).toBe('paused')
      expect(pauseSpy).toHaveBeenCalled()

      // Click video surface to resume
      const playSurface = screen.getByLabelText(/Play video/i)
      await act(async () => {
        fireEvent.click(playSurface)
      })

      expect(universalPlayerEngine.getState().status).toBe('playing')
      expect(playSpy).toHaveBeenCalled()
    })

    it('transitions out of buffering state to playing when time advances', async () => {
      render(
        <UniversalPlayerProvider>
          <MediaStreamPlayerProvider>
            <TestPlexPlayerTrigger />
            <MediaStreamPlayerModal />
          </MediaStreamPlayerProvider>
        </UniversalPlayerProvider>,
      )

      await act(async () => {
        fireEvent.click(screen.getByText('Open Plex Stream'))
      })

      // Set to buffering
      act(() => {
        universalPlayerEngine.onVideoBuffering(true)
      })
      expect(universalPlayerEngine.getState().status).toBe('buffering')

      const video = document.querySelector('video')
      expect(video).toBeTruthy()

      if (video) {
        Object.defineProperty(video, 'paused', { value: false, writable: true })
        Object.defineProperty(video, 'currentTime', { value: 10, writable: true })
        act(() => {
          video.dispatchEvent(new Event('timeupdate'))
        })

        expect(universalPlayerEngine.getState().status).toBe('playing')
        expect(universalPlayerEngine.getState().position).toBe(10)
      }
    })
  })

  describe('Initial Seek Protection on Resume', () => {
    it('does not re-seek back to start position when canplay fires on pause/resume', async () => {
      render(
        <UniversalPlayerProvider>
          <MediaStreamPlayerProvider>
            <TestPlexPlayerTrigger />
            <MediaStreamPlayerModal />
          </MediaStreamPlayerProvider>
        </UniversalPlayerProvider>,
      )

      await act(async () => {
        fireEvent.click(screen.getByText('Open Plex Stream'))
      })

      const video = document.querySelector('video')
      expect(video).toBeTruthy()

      if (video) {
        // Fast-forward video to 300s
        Object.defineProperty(video, 'currentTime', { value: 300, writable: true })

        // Pause
        await act(async () => {
          fireEvent.click(screen.getByTitle(/Pause \(Space\)/i))
        })

        // Resume
        await act(async () => {
          fireEvent.click(screen.getByTitle(/Play \(Space\)/i))
        })

        // Simulate browser canplay event during resume
        act(() => {
          video.dispatchEvent(new Event('canplay'))
        })

        // The currentTime must remain at 300s, not reset to startPositionMs (45s)
        expect(video.currentTime).toBe(300)
      }
    })
  })

  describe('LegacyMediaStreamPlayerProvider videoElement synchronization', () => {
    it('pauses and resumes videoElement in legacy mode', async () => {
      render(
        <MediaStreamPlayerProvider>
          <TestPlexPlayerTrigger />
          <MediaStreamPlayerModal />
        </MediaStreamPlayerProvider>,
      )

      await act(async () => {
        fireEvent.click(screen.getByText('Open Plex Stream'))
      })

      // Pause button clicked
      await act(async () => {
        fireEvent.click(screen.getByTitle(/Pause \(Space\)/i))
      })

      expect(pauseSpy).toHaveBeenCalled()

      // Play button clicked
      await act(async () => {
        fireEvent.click(screen.getByTitle(/Play \(Space\)/i))
      })

      expect(playSpy).toHaveBeenCalled()
    })
  })

  describe('Plex Stream Volume & Quality Controls', () => {
    it('synchronizes volume and mute directly onto the active video element', async () => {
      render(
        <UniversalPlayerProvider>
          <MediaStreamPlayerProvider>
            <TestPlexPlayerTrigger />
            <MediaStreamPlayerModal />
          </MediaStreamPlayerProvider>
        </UniversalPlayerProvider>,
      )

      await act(async () => {
        fireEvent.click(screen.getByText('Open Plex Stream'))
      })

      const video = document.querySelector('video')
      expect(video).not.toBeNull()
      if (video) {
        // Adjust volume to 0.4
        act(() => {
          universalPlayerEngine.setVolume(0.4)
        })
        expect(video.volume).toBeCloseTo(0.4)
        expect(video.muted).toBe(false)

        // Toggle mute
        act(() => {
          universalPlayerEngine.toggleMute()
        })
        expect(video.muted).toBe(true)
        expect(video.volume).toBe(0)

        // Increasing volume un-mutes
        act(() => {
          universalPlayerEngine.setVolume(0.8)
        })
        expect(video.muted).toBe(false)
        expect(video.volume).toBeCloseTo(0.8)
      }
    })

    it('switches to transcode HLS with bitrate and resolution parameters when quality is changed', async () => {
      render(
        <UniversalPlayerProvider>
          <MediaStreamPlayerProvider>
            <TestPlexPlayerTrigger />
            <MediaStreamPlayerModal />
          </MediaStreamPlayerProvider>
        </UniversalPlayerProvider>,
      )

      await act(async () => {
        fireEvent.click(screen.getByText('Open Plex Stream'))
      })

      // Initially direct-play because mp4/h264
      expect(universalPlayerEngine.getState().playbackMethod).toBe('direct-play')

      // Change quality to 720p HD (4 Mbps)
      await act(async () => {
        await universalPlayerEngine.setQuality('720p')
      })

      const state = universalPlayerEngine.getState()
      expect(state.currentQuality).toBe('720p')
      expect(state.playbackMethod).toBe('transcode')
      expect(state.currentItem?.providerData?.maxVideoBitrate).toBe(4000)
      expect(state.currentItem?.providerData?.videoResolution).toBe('1280x720')
      expect(state.currentItem?.providerData?.hlsUrl).toContain('maxVideoBitrate=4000')
      expect(state.currentItem?.providerData?.hlsUrl).toContain('videoResolution=1280x720')

      // Switch back to original
      await act(async () => {
        await universalPlayerEngine.setQuality('original')
      })

      const originalState = universalPlayerEngine.getState()
      expect(originalState.currentQuality).toBe('original')
      expect(originalState.playbackMethod).toBe('direct-play')
      expect(originalState.currentItem?.providerData?.directUrl).toContain('/library/parts/9876/file.mp4')
    })
  })
})
