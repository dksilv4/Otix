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

function TestPlayerTrigger() {
  const { openStream } = useMediaStreamPlayer()
  return (
    <button type="button" onClick={() => openStream(mockSession)}>
      Open Stream
    </button>
  )
}

describe('MediaStreamPlayerModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <MediaStreamPlayerProvider>
        <MediaStreamPlayerModal />
      </MediaStreamPlayerProvider>
    )

    expect(container.firstChild).toBe(null)
  })

  it('renders title, server source badge, and controls when open', () => {
    render(
      <MediaStreamPlayerProvider>
        <TestPlayerTrigger />
        <MediaStreamPlayerModal />
      </MediaStreamPlayerProvider>
    )

    fireEvent.click(screen.getByText('Open Stream'))

    expect(screen.getByText('Interstellar')).toBeInTheDocument()
    expect(screen.getByText('jellyfin')).toBeInTheDocument()
    expect(screen.getByTitle(/Close/i)).toBeInTheDocument()
  })

  it('toggles play/pause when transport button clicked', () => {
    render(
      <MediaStreamPlayerProvider>
        <TestPlayerTrigger />
        <MediaStreamPlayerModal />
      </MediaStreamPlayerProvider>
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
      </MediaStreamPlayerProvider>
    )

    fireEvent.click(screen.getByText('Open Stream'))
    expect(screen.getByText('Interstellar')).toBeInTheDocument()

    const closeBtn = screen.getByTitle(/Close/i)
    act(() => {
      fireEvent.click(closeBtn)
    })

    expect(screen.queryByText('Interstellar')).not.toBeInTheDocument()
  })
})
