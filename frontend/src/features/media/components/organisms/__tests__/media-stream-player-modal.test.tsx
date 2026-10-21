import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MediaStreamPlayerModal } from '../media-stream-player-modal'
import {
  MediaStreamPlayerProvider,
  useMediaStreamPlayer,
} from '@/features/media/hooks/use-media-stream-player'
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

    expect(screen.getByText('Interstellar')).toBeInTheDocument()
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
    expect(screen.getByText('Interstellar')).toBeInTheDocument()

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
  })
})
