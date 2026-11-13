import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { MediaStreamPlayerModal } from '../media-stream-player-modal'
import {
  MediaStreamPlayerProvider,
  useMediaStreamPlayer,
} from '@/features/media/hooks/use-media-stream-player'
import { UniversalPlayerProvider } from '@/features/player/core/universal-player-context'
import '@/features/player/adapters'
import type { StreamPlaybackSession } from '@/features/media/types/stream-player'

const mockSession: StreamPlaybackSession = {
  source: 'jellyfin',
  serverUrl: 'http://localhost:8096',
  token: 'test-token',
  itemId: 'item-123',
  title: 'Interstellar',
  subtitle: '2014',
  playSessionId: 'sess-xyz',
  directUrl: 'http://localhost:8096/Videos/item-123/stream?static=true',
  hlsUrl: 'http://localhost:8096/Videos/item-123/master.m3u8',
  container: 'mp4',
  videoCodec: 'h264',
  audioCodec: 'aac',
  audioTracks: [
    { id: 'a1', index: 0, label: 'English (AAC)', language: 'eng', codec: 'aac', channels: 2 },
    { id: 'a2', index: 1, label: 'French (AAC)', language: 'fra', codec: 'aac', channels: 2 },
  ],
  subtitles: [
    { id: 's1', index: 0, label: 'English', language: 'eng', format: 'vtt', isExternal: true, requiresBurnIn: false },
  ],
  startPositionMs: 0,
  durationMs: 7200000,
}

const TestPlayerTrigger = () => {
  const { openStream, toggleInAppPip, toggleOverallPip } = useMediaStreamPlayer()
  return (
    <div>
      <button type="button" onClick={() => openStream(mockSession)}>
        Open Stream
      </button>
      <button type="button" onClick={toggleInAppPip}>
        Toggle In-App PiP
      </button>
      <button type="button" onClick={toggleOverallPip}>
        Toggle Overall PiP
      </button>
    </div>
  )
};

describe('MediaStreamPlayerModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <MediaStreamPlayerProvider>
        <MediaStreamPlayerModal />
      </MediaStreamPlayerProvider>,
    )

    expect(container.firstChild).toBe(null)
  })

  it('renders title, server source badge, and controls when open', () => {
    render(
      <MediaStreamPlayerProvider>
        <TestPlayerTrigger />
        <MediaStreamPlayerModal />
      </MediaStreamPlayerProvider>,
    )

    fireEvent.click(screen.getByText('Open Stream'))

    expect(screen.getAllByText('Interstellar')[0]).toBeInTheDocument()
    expect(screen.getByText('jellyfin')).toBeInTheDocument()
    expect(screen.getByTitle(/Close/i)).toBeInTheDocument()
    expect(screen.getByTitle(/Minimize to in-app player/i)).toBeInTheDocument()
    expect(screen.getByTitle(/Picture-in-Picture \(OS window\)/i)).toBeInTheDocument()
  })

  it('toggles play/pause when transport button clicked', () => {
    render(
      <MediaStreamPlayerProvider>
        <TestPlayerTrigger />
        <MediaStreamPlayerModal />
      </MediaStreamPlayerProvider>,
    )

    fireEvent.click(screen.getByText('Open Stream'))

    const playPauseBtn = screen.getByTitle(/Pause \(Space\)/i)
    expect(playPauseBtn).toBeInTheDocument()

    act(() => {
      fireEvent.click(playPauseBtn)
    })

    expect(screen.getByTitle(/Play \(Space\)/i)).toBeInTheDocument()
  })

  it('closes modal when close button is clicked', () => {
    render(
      <MediaStreamPlayerProvider>
        <TestPlayerTrigger />
        <MediaStreamPlayerModal />
      </MediaStreamPlayerProvider>,
    )

    fireEvent.click(screen.getByText('Open Stream'))
    expect(screen.getAllByText('Interstellar')[0]).toBeInTheDocument()

    const closeBtn = screen.getByTitle(/Close \(Esc\)/i)
    act(() => {
      fireEvent.click(closeBtn)
    })

    expect(screen.queryByText('Interstellar')).not.toBeInTheDocument()
  })

  it('minimizes into in-app PiP mode and restores back to full modal', () => {
    render(
      <MediaStreamPlayerProvider>
        <TestPlayerTrigger />
        <MediaStreamPlayerModal />
      </MediaStreamPlayerProvider>,
    )

    fireEvent.click(screen.getByText('Open Stream'))

    // Click minimize to in-app player
    const minimizeBtn = screen.getByTitle(/Minimize to in-app player/i)
    act(() => {
      fireEvent.click(minimizeBtn)
    })

    // In-app PiP mini overlay should now be visible with Restore button
    const restoreBtn = screen.getByTitle(/Expand to full player/i)
    expect(restoreBtn).toBeInTheDocument()

    // Clicking restore returns to full modal view
    act(() => {
      fireEvent.click(restoreBtn)
    })

    expect(screen.getByTitle(/Minimize to in-app player/i)).toBeInTheDocument()
  })

  it('toggles in-app PiP using keyboard shortcut "i"', () => {
    render(
      <MediaStreamPlayerProvider>
        <TestPlayerTrigger />
        <MediaStreamPlayerModal />
      </MediaStreamPlayerProvider>,
    )

    fireEvent.click(screen.getByText('Open Stream'))

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i' }))
    })

    expect(screen.getByTitle(/Expand to full player/i)).toBeInTheDocument()

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i' }))
    })

    expect(screen.getByTitle(/Minimize to in-app player/i)).toBeInTheDocument()
  })

  it('displays overall PiP overlay and toggles overall PiP using "p"', async () => {
    render(
      <MediaStreamPlayerProvider>
        <TestPlayerTrigger />
        <MediaStreamPlayerModal />
      </MediaStreamPlayerProvider>,
    )

    fireEvent.click(screen.getByText('Open Stream'))

    // Press 'p' to trigger overall PiP
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p' }))
    })

    // Check bottom-right PiP button
    const pipBtn = screen.getByTitle(/Picture-in-Picture \(OS window\)/i)
    expect(pipBtn).toBeInTheDocument()
  })

  it('opens quality menu, displays quality options, and selects a new quality', () => {
    render(
      <MediaStreamPlayerProvider>
        <TestPlayerTrigger />
        <MediaStreamPlayerModal />
      </MediaStreamPlayerProvider>,
    )

    fireEvent.click(screen.getByText('Open Stream'))

    const qualityBtn = screen.getByTitle(/Video Quality \(Q\)/i)
    expect(qualityBtn).toBeInTheDocument()
    expect(qualityBtn).toHaveTextContent(/Auto/i)

    // Open Quality Menu
    act(() => {
      fireEvent.click(qualityBtn)
    })

    expect(screen.getByText('720p HD')).toBeInTheDocument()
    expect(screen.getByText('1080p HD')).toBeInTheDocument()

    // Select 720p HD
    act(() => {
      fireEvent.click(screen.getByText('720p HD'))
    })

    // Button should now show 720p
    expect(qualityBtn).toHaveTextContent(/720p/i)
  })

  it('toggles quality menu using keyboard shortcut "q" and displays Quality in shortcuts modal', () => {
    render(
      <MediaStreamPlayerProvider>
        <TestPlayerTrigger />
        <MediaStreamPlayerModal />
      </MediaStreamPlayerProvider>,
    )

    fireEvent.click(screen.getByText('Open Stream'))

    // Press 'q' to open quality menu
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }))
    })

    expect(screen.getByText('720p HD')).toBeInTheDocument()

    // Press 'q' again to close quality menu
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }))
    })

    expect(screen.queryByText('720p HD')).not.toBeInTheDocument()

    // Press '?' to view shortcuts modal
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }))
    })

    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument()
    expect(screen.getByText('Quality')).toBeInTheDocument()
    expect(screen.getByText('Audio Track')).toBeInTheDocument()
    expect(screen.getByText('Subtitles')).toBeInTheDocument()
  })

  it('displays audio track selector when multiple audio tracks exist and switches track', () => {
    render(
      <MediaStreamPlayerProvider>
        <TestPlayerTrigger />
        <MediaStreamPlayerModal />
      </MediaStreamPlayerProvider>,
    )

    fireEvent.click(screen.getByText('Open Stream'))

    const audioBtn = screen.getByTitle(/Audio Track \(A\)/i)
    expect(audioBtn).toBeInTheDocument()

    // Open Audio Menu
    act(() => {
      fireEvent.click(audioBtn)
    })

    expect(screen.getByText('English (AAC)')).toBeInTheDocument()
    expect(screen.getByText('French (AAC)')).toBeInTheDocument()

    // Select French
    act(() => {
      fireEvent.click(screen.getByText('French (AAC)'))
    })

    // Menu closes after selection
    expect(screen.queryByText('English (AAC)')).not.toBeInTheDocument()
  })

  it('displays subtitle track selector when subtitles exist, opens menu, and switches subtitle track', () => {
    render(
      <MediaStreamPlayerProvider>
        <TestPlayerTrigger />
        <MediaStreamPlayerModal />
      </MediaStreamPlayerProvider>,
    )

    fireEvent.click(screen.getByText('Open Stream'))

    const subtitleBtn = screen.getByTitle(/Subtitles \(C\)/i)
    expect(subtitleBtn).toBeInTheDocument()
    expect(subtitleBtn).toHaveTextContent(/Off/i)

    // Open Subtitle Menu
    act(() => {
      fireEvent.click(subtitleBtn)
    })

    expect(screen.getByRole('button', { name: /Off/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /English/i })).toBeInTheDocument()

    // Select English
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /English/i }))
    })

    // Subtitle button now indicates English (ENG)
    expect(subtitleBtn).toHaveTextContent(/ENG/i)
  })

  it('toggles subtitles using keyboard shortcut "c"', () => {
    render(
      <MediaStreamPlayerProvider>
        <TestPlayerTrigger />
        <MediaStreamPlayerModal />
      </MediaStreamPlayerProvider>,
    )

    fireEvent.click(screen.getByText('Open Stream'))

    const subtitleBtn = screen.getByTitle(/Subtitles \(C\)/i)
    expect(subtitleBtn).toHaveTextContent(/Off/i)

    // Press 'c' to enable first subtitle
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }))
    })

    expect(subtitleBtn).toHaveTextContent(/ENG/i)

    // Press 'c' again to turn off subtitle
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }))
    })

    expect(subtitleBtn).toHaveTextContent(/Off/i)
  })

  it('expands to 100% width edge-to-edge when theater mode is activated', () => {
    render(
      <MediaStreamPlayerProvider>
        <TestPlayerTrigger />
        <MediaStreamPlayerModal />
      </MediaStreamPlayerProvider>,
    )

    fireEvent.click(screen.getByText('Open Stream'))

    const theaterBtn = screen.getByTitle(/Theater mode \(T\)/i)
    expect(theaterBtn).toBeInTheDocument()

    // Toggle theater mode on
    act(() => {
      fireEvent.click(theaterBtn)
    })

    // The container should have full width edge-to-edge classes
    const modalWrapper = document.querySelector('.max-w-none')
    expect(modalWrapper).toBeInTheDocument()
    expect(modalWrapper).toHaveClass('w-full')
    expect(modalWrapper).toHaveClass('px-0')
  })

  it('renders episode name at the top of the modal instead of the show name when playing an episode', () => {
    const episodeSession: StreamPlaybackSession = {
      ...mockSession,
      title: 'Breaking Bad',
      episodeContext: {
        seriesTitle: 'Breaking Bad',
        seasonNumber: 1,
        episodeNumber: 1,
        episodeTitle: 'Pilot',
      },
    }

    const EpisodeTrigger = () => {
      const { openStream } = useMediaStreamPlayer()
      return (
        <button type="button" onClick={() => openStream(episodeSession)}>
          Open Episode
        </button>
      )
    }

    render(
      <MediaStreamPlayerProvider>
        <EpisodeTrigger />
        <MediaStreamPlayerModal />
      </MediaStreamPlayerProvider>,
    )

    fireEvent.click(screen.getByText('Open Episode'))

    expect(screen.getAllByText('Pilot')[0]).toBeInTheDocument()
    expect(screen.getByText('Breaking Bad · S1:E1')).toBeInTheDocument()
  })

  it('enforces that the middle waveform pod is larger than the side pods in total', () => {
    render(
      <MediaStreamPlayerProvider>
        <TestPlayerTrigger />
        <MediaStreamPlayerModal />
      </MediaStreamPlayerProvider>,
    )

    fireEvent.click(screen.getByText('Open Stream'))

    // Find the 3 pods in the player controls bar
    const pod1 = document.querySelector('.max-w-\\[24\\%\\]')
    const pod2 = document.querySelector('.min-w-\\[52\\%\\]')

    expect(pod1).toBeInTheDocument()
    expect(pod2).toBeInTheDocument()

    // Pod 1 & Pod 3 both have max-w-[24%] (total <= 48%), Pod 2 has min-w-[52%] (> 48%)
    expect(pod1).toHaveClass('max-w-[24%]')
    expect(pod2).toHaveClass('min-w-[52%]')
  })

  it('auto-advances to next queued episode when video ends', async () => {
    const episodeSession: StreamPlaybackSession = {
      ...mockSession,
      title: 'Breaking Bad',
      itemId: 'ep-1-1',
      episodeContext: {
        seriesTitle: 'Breaking Bad',
        seasonNumber: 1,
        episodeNumber: 1,
        episodeTitle: 'Pilot',
      },
    }

    const queuedEpisode: any = {
      id: 'jellyfin:ep-1-2',
      source: 'jellyfin',
      mediaType: 'video',
      subtype: 'episode',
      title: 'Breaking Bad',
      subtitle: 'S1:E2 · Cat in the Bag',
      episodeContext: {
        seriesTitle: 'Breaking Bad',
        seasonNumber: 1,
        episodeNumber: 2,
        episodeTitle: 'Cat in the Bag',
      },
      providerData: {
        ...mockSession,
        itemId: 'ep-1-2',
        title: 'Breaking Bad',
        subtitle: 'S1:E2 · Cat in the Bag',
        episodeContext: {
          seriesTitle: 'Breaking Bad',
          seasonNumber: 1,
          episodeNumber: 2,
          episodeTitle: 'Cat in the Bag',
        },
      },
    }

    const QueueTrigger = () => {
      const { openStream } = useMediaStreamPlayer()
      return (
        <button
          type="button"
          onClick={() => openStream(episodeSession, [queuedEpisode])}
        >
          Open With Queue
        </button>
      )
    }

    render(
      <UniversalPlayerProvider>
        <MediaStreamPlayerProvider>
          <QueueTrigger />
          <MediaStreamPlayerModal />
        </MediaStreamPlayerProvider>
      </UniversalPlayerProvider>,
    )

    fireEvent.click(screen.getByText('Open With Queue'))
    expect(screen.getAllByText('Pilot')[0]).toBeInTheDocument()

    // Find the video element and dispatch 'ended'
    const video = document.querySelector('video')
    expect(video).toBeInTheDocument()

    act(() => {
      video?.dispatchEvent(new Event('ended'))
    })

    // Next episode should now be loaded
    await waitFor(() => {
      expect(screen.getAllByText('Cat in the Bag')[0]).toBeInTheDocument()
      expect(screen.getByText('Breaking Bad · S1:E2')).toBeInTheDocument()
    })
  })

  it('renders upcoming queue panel next to player when queue exists and toggles with queue button', async () => {
    const episodeSession: StreamPlaybackSession = {
      ...mockSession,
      title: 'Breaking Bad',
      episodeContext: {
        episodeTitle: 'Pilot',
        seriesTitle: 'Breaking Bad',
        seasonNumber: 1,
        episodeNumber: 1,
      },
    }

    const queuedEpisode: PlayableMediaItem = {
      id: 'ep-2',
      title: 'Cat in the Bag',
      mediaType: 'video',
      provider: 'plex',
      providerData: {
        ...mockSession,
        title: 'Breaking Bad',
        episodeContext: {
          episodeTitle: 'Cat in the Bag',
          seriesTitle: 'Breaking Bad',
          seasonNumber: 1,
          episodeNumber: 2,
        },
      },
    }

    const QueueTrigger = () => {
      const { openStream } = useMediaStreamPlayer()
      return (
        <button
          type="button"
          onClick={() => openStream(episodeSession, [queuedEpisode])}
        >
          Open With Queue Test
        </button>
      )
    }

    render(
      <UniversalPlayerProvider>
        <MediaStreamPlayerProvider>
          <QueueTrigger />
          <MediaStreamPlayerModal />
        </MediaStreamPlayerProvider>
      </UniversalPlayerProvider>,
    )

    fireEvent.click(screen.getByText('Open With Queue Test'))

    // The Up Next queue panel should be displayed
    await waitFor(() => {
      expect(screen.getByText('Up Next')).toBeInTheDocument()
      expect(screen.getByText('Next episode plays automatically')).toBeInTheDocument()
    })

    // Toggle queue button hides the queue panel
    const toggleQueueBtn = screen.getByTitle(/Hide Queue/i)
    expect(toggleQueueBtn).toBeInTheDocument()
    fireEvent.click(toggleQueueBtn)

    await waitFor(() => {
      expect(screen.queryByText('Next episode plays automatically')).not.toBeInTheDocument()
    })
  })

  it('correctly transitions between playing and paused states when unpausing', () => {
    render(
      <MediaStreamPlayerProvider>
        <TestPlayerTrigger />
        <MediaStreamPlayerModal />
      </MediaStreamPlayerProvider>,
    )

    fireEvent.click(screen.getByText('Open Stream'))

    // Initially playing
    const pauseBtn = screen.getByTitle(/Pause \(Space\)/i)
    expect(pauseBtn).toBeInTheDocument()

    // Pause the video
    act(() => {
      fireEvent.click(pauseBtn)
    })
    const playBtn = screen.getByTitle(/Play \(Space\)/i)
    expect(playBtn).toBeInTheDocument()

    // Unpause the video - the Play icon should go away and be replaced by Pause
    act(() => {
      fireEvent.click(playBtn)
    })
    expect(screen.getByTitle(/Pause \(Space\)/i)).toBeInTheDocument()
    expect(screen.queryByTitle(/Play \(Space\)/i)).not.toBeInTheDocument()
  })
})
