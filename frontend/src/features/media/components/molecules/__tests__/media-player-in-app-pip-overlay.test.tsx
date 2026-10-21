import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  MediaPlayerInAppPipOverlay,
  type MediaPlayerInAppPipOverlayProps,
} from '../media-player-in-app-pip-overlay'

describe('MediaPlayerInAppPipOverlay', () => {
  const defaultProps: MediaPlayerInAppPipOverlayProps = {
    title: 'Dune: Part Two',
    source: 'plex',
    isPlaying: true,
    isBuffering: false,
    isOverallPip: false,
    currentTime: 3600,
    duration: 7200,
    isMuted: false,
    controlsVisible: true,
    onTogglePlay: vi.fn(),
    onSkipBack: vi.fn(),
    onSkipForward: vi.fn(),
    onSeek: vi.fn(),
    onToggleMute: vi.fn(),
    onRestore: vi.fn(),
    onToggleOverallPip: vi.fn(),
    onClose: vi.fn(),
  }

  it('renders title, source badge, elapsed/duration time, and action buttons', () => {
    render(<MediaPlayerInAppPipOverlay {...defaultProps} />)

    expect(screen.getByText('Dune: Part Two')).toBeInTheDocument()
    expect(screen.getByText('plex')).toBeInTheDocument()
    expect(screen.getByText(/1:00:00 \/ 2:00:00/)).toBeInTheDocument()
    expect(screen.getByTitle(/Expand to full player/i)).toBeInTheDocument()
    expect(screen.getByTitle(/Picture-in-Picture \(OS window\)/i)).toBeInTheDocument()
    expect(screen.getByTitle(/Close player/i)).toBeInTheDocument()
  })

  it('handles play/pause toggle', () => {
    const onTogglePlay = vi.fn()
    render(<MediaPlayerInAppPipOverlay {...defaultProps} onTogglePlay={onTogglePlay} />)

    const pauseBtn = screen.getByTitle(/Pause \(Space\)/i)
    fireEvent.click(pauseBtn)
    expect(onTogglePlay).toHaveBeenCalledTimes(1)
  })

  it('handles skip backward and forward clicks', () => {
    const onSkipBack = vi.fn()
    const onSkipForward = vi.fn()
    render(
      <MediaPlayerInAppPipOverlay
        {...defaultProps}
        onSkipBack={onSkipBack}
        onSkipForward={onSkipForward}
      />,
    )

    fireEvent.click(screen.getByTitle(/Skip back 10s/i))
    expect(onSkipBack).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTitle(/Skip forward 10s/i))
    expect(onSkipForward).toHaveBeenCalledTimes(1)
  })

  it('handles restore, overall PiP, and close buttons', () => {
    const onRestore = vi.fn()
    const onToggleOverallPip = vi.fn()
    const onClose = vi.fn()
    render(
      <MediaPlayerInAppPipOverlay
        {...defaultProps}
        onRestore={onRestore}
        onToggleOverallPip={onToggleOverallPip}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByTitle(/Expand to full player/i))
    expect(onRestore).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTitle(/Picture-in-Picture \(OS window\)/i))
    expect(onToggleOverallPip).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTitle(/Close player/i))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('handles mute toggle', () => {
    const onToggleMute = vi.fn()
    render(<MediaPlayerInAppPipOverlay {...defaultProps} onToggleMute={onToggleMute} />)

    fireEvent.click(screen.getByTitle(/Mute \(M\)/i))
    expect(onToggleMute).toHaveBeenCalledTimes(1)
  })

  it('renders OS PiP active state with Return Video button when isOverallPip is true', () => {
    const onToggleOverallPip = vi.fn()
    render(
      <MediaPlayerInAppPipOverlay
        {...defaultProps}
        isOverallPip={true}
        onToggleOverallPip={onToggleOverallPip}
      />,
    )

    expect(screen.getByText('Playing in OS PiP window')).toBeInTheDocument()
    const returnBtn = screen.getByTitle('Restore video to player')
    expect(returnBtn).toBeInTheDocument()

    fireEvent.click(returnBtn)
    expect(onToggleOverallPip).toHaveBeenCalledTimes(1)
  })

  it('shows buffering indicator when isBuffering is true', () => {
    render(<MediaPlayerInAppPipOverlay {...defaultProps} isBuffering={true} />)

    expect(screen.getByText(/Buffering/i)).toBeInTheDocument()
  })

  it('hides controls overlay when isDragging is true', () => {
    const { container } = render(<MediaPlayerInAppPipOverlay {...defaultProps} isDragging={true} />)

    const overlay = container.querySelector('.opacity-0')
    expect(overlay).toBeInTheDocument()
  })
})
