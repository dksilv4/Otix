import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { TrailerVideoModal, loadPlayerSettings, savePlayerSettings } from '../trailer-video-modal'

describe('TrailerVideoModal', () => {
  const defaultProps = {
    youtubeId: 'dQw4w9WgXcQ',
    title: 'Interstellar',
    onClose: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    window.innerHeight = 800
    window.innerWidth = 1200
  })

  it('renders modal with title and youtube iframe containing enablejsapi=1', () => {
    render(<TrailerVideoModal {...defaultProps} />)

    expect(screen.getByText('Interstellar — Trailer')).toBeInTheDocument()

    const iframe = screen.getByTitle('Interstellar trailer') as HTMLIFrameElement
    expect(iframe).toBeInTheDocument()
    expect(iframe.src).toContain('enablejsapi=1')
    expect(iframe.src).toContain('dQw4w9WgXcQ')
    expect(iframe.className).toContain('scale-[1.35]')
  })

  it('toggles zoom out and zoom in on button click and persists to localStorage', () => {
    render(<TrailerVideoModal {...defaultProps} />)

    const zoomButton = screen.getByLabelText(/Zoom out to fit/i)
    expect(zoomButton).toBeInTheDocument()

    const iframe = screen.getByTitle('Interstellar trailer')
    expect(iframe.className).toContain('scale-[1.35]')

    // Click Zoom Out -> should change to scale-100 (fit)
    fireEvent.click(zoomButton)
    expect(iframe.className).toContain('scale-100')
    expect(screen.getByLabelText(/Zoom in to fill/i)).toBeInTheDocument()
    expect(loadPlayerSettings().isZoomedOut).toBe(true)

    // Click Zoom In -> should toggle back to scale-[1.35]
    fireEvent.click(screen.getByLabelText(/Zoom in to fill/i))
    expect(iframe.className).toContain('scale-[1.35]')
    expect(screen.getByLabelText(/Zoom out to fit/i)).toBeInTheDocument()
    expect(loadPlayerSettings().isZoomedOut).toBe(false)
  })

  it('restores settings from localStorage on initial render', () => {
    savePlayerSettings({
      isZoomedOut: true,
      volume: 0.6,
      isMuted: true,
      isTheater: true,
    })

    render(<TrailerVideoModal {...defaultProps} />)

    const iframe = screen.getByTitle('Interstellar trailer') as HTMLIFrameElement
    expect(iframe.className).toContain('scale-100')
    expect(screen.getByLabelText(/Zoom in to fill/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Unmute \(M\)/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Exit theater mode \(T\)/i)).toBeInTheDocument()
  })

  it('toggles zoom on "z" or "Z" keyboard shortcut', () => {
    render(<TrailerVideoModal {...defaultProps} />)

    const iframe = screen.getByTitle('Interstellar trailer')
    expect(iframe.className).toContain('scale-[1.35]')

    fireEvent.keyDown(document, { key: 'z' })
    expect(iframe.className).toContain('scale-100')

    fireEvent.keyDown(document, { key: 'Z' })
    expect(iframe.className).toContain('scale-[1.35]')
  })

  it('toggles volume mute/unmute and sends postMessage to YouTube iframe', () => {
    render(<TrailerVideoModal {...defaultProps} />)

    const iframe = screen.getByTitle('Interstellar trailer') as HTMLIFrameElement
    const postMessageSpy = vi.fn()
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: postMessageSpy },
      configurable: true,
    })

    const muteButton = screen.getByLabelText(/Mute \(M\)/i)
    expect(muteButton).toBeInTheDocument()

    // Click to mute
    fireEvent.click(muteButton)
    expect(postMessageSpy).toHaveBeenCalledWith(
      JSON.stringify({ event: 'command', func: 'mute', args: [] }),
      '*',
    )
    expect(screen.getByLabelText(/Unmute \(M\)/i)).toBeInTheDocument()
    expect(loadPlayerSettings().isMuted).toBe(true)

    // Click to unmute
    fireEvent.click(screen.getByLabelText(/Unmute \(M\)/i))
    expect(postMessageSpy).toHaveBeenCalledWith(
      JSON.stringify({ event: 'command', func: 'unMute', args: [] }),
      '*',
    )
    expect(loadPlayerSettings().isMuted).toBe(false)
  })

  it('displays volume slider on hover and updates volume on slider change', () => {
    render(<TrailerVideoModal {...defaultProps} />)

    const iframe = screen.getByTitle('Interstellar trailer') as HTMLIFrameElement
    const postMessageSpy = vi.fn()
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: postMessageSpy },
      configurable: true,
    })

    const muteButton = screen.getByLabelText(/Mute \(M\)/i)
    const volumeContainer = muteButton.parentElement!

    fireEvent.mouseEnter(volumeContainer)

    const slider = screen.getByLabelText('Volume slider')
    expect(slider).toBeInTheDocument()

    fireEvent.change(slider, { target: { value: '0.7' } })
    expect(postMessageSpy).toHaveBeenCalledWith(
      JSON.stringify({ event: 'command', func: 'setVolume', args: [70] }),
      '*',
    )
    expect(loadPlayerSettings().volume).toBe(0.7)
  })

  it('renders progress bar and play/pause button', () => {
    render(<TrailerVideoModal {...defaultProps} />)

    const playPauseBtn = screen.getByLabelText(/Pause \(Space\)/i)
    expect(playPauseBtn).toBeInTheDocument()

    const progressBar = screen.getByRole('slider', { name: /video timeline/i })
    expect(progressBar).toBeInTheDocument()

    expect(screen.getAllByText('0:00').length).toBeGreaterThanOrEqual(1)
  })

  it('toggles play/pause via button and spacebar', () => {
    render(<TrailerVideoModal {...defaultProps} />)

    const iframe = screen.getByTitle('Interstellar trailer') as HTMLIFrameElement
    const postMessageSpy = vi.fn()
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: postMessageSpy },
      configurable: true,
    })

    const playPauseBtn = screen.getByLabelText(/Pause \(Space\)/i)
    fireEvent.click(playPauseBtn)
    expect(postMessageSpy).toHaveBeenCalledWith(
      JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }),
      '*',
    )

    // Press space to resume
    fireEvent.keyDown(document, { key: ' ' })
    expect(postMessageSpy).toHaveBeenCalledWith(
      JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
      '*',
    )
  })

  it('toggles play/pause instantly by clicking the video overlay', () => {
    render(<TrailerVideoModal {...defaultProps} />)

    const iframe = screen.getByTitle('Interstellar trailer') as HTMLIFrameElement
    const postMessageSpy = vi.fn()
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: postMessageSpy },
      configurable: true,
    })

    const overlay = screen.getByLabelText('Pause video')
    fireEvent.click(overlay)

    expect(postMessageSpy).toHaveBeenCalledWith(
      JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }),
      '*',
    )
  })

  it('updates time on YouTube infoDelivery message and allows scrubbing', () => {
    render(<TrailerVideoModal {...defaultProps} />)

    const iframe = screen.getByTitle('Interstellar trailer') as HTMLIFrameElement
    const postMessageSpy = vi.fn()
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: postMessageSpy },
      configurable: true,
    })

    // Simulate YouTube infoDelivery message
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({
            event: 'infoDelivery',
            info: {
              currentTime: 45,
              duration: 120,
              playerState: 1,
              videoLoadedFraction: 0.5,
            },
          }),
        }),
      )
    })

    expect(screen.getByText('0:45')).toBeInTheDocument()
    expect(screen.getByText('2:00')).toBeInTheDocument()

    // Scrub progress bar
    const progressBar = screen.getByRole('slider', { name: /video timeline/i })
    vi.spyOn(progressBar, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 10,
      bottom: 10,
      right: 200,
      x: 0,
      y: 0,
      toJSON: () => {},
    })

    fireEvent.mouseDown(progressBar, { clientX: 100 })
    expect(postMessageSpy).toHaveBeenCalledWith(
      JSON.stringify({ event: 'command', func: 'seekTo', args: [60, true] }),
      '*',
    )
  })

  it('seeks relative with ArrowLeft and ArrowRight', () => {
    render(<TrailerVideoModal {...defaultProps} />)

    const iframe = screen.getByTitle('Interstellar trailer') as HTMLIFrameElement
    const postMessageSpy = vi.fn()
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: postMessageSpy },
      configurable: true,
    })

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({
            event: 'infoDelivery',
            info: { currentTime: 30, duration: 100 },
          }),
        }),
      )
    })

    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(postMessageSpy).toHaveBeenCalledWith(
      JSON.stringify({ event: 'command', func: 'seekTo', args: [35, true] }),
      '*',
    )

    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    expect(postMessageSpy).toHaveBeenCalledWith(
      JSON.stringify({ event: 'command', func: 'seekTo', args: [30, true] }),
      '*',
    )
  })

  it('calls onClose when close button or Escape is pressed', () => {
    const onClose = vi.fn()
    render(<TrailerVideoModal {...defaultProps} onClose={onClose} />)

    fireEvent.click(screen.getByLabelText('Close trailer'))
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('toggles theater mode on button click and persists to localStorage', () => {
    render(<TrailerVideoModal {...defaultProps} />)

    const theaterButton = screen.getByLabelText(/Theater mode \(T\)/i)
    fireEvent.click(theaterButton)
    expect(screen.getByLabelText(/Exit theater mode \(T\)/i)).toBeInTheDocument()
    expect(loadPlayerSettings().isTheater).toBe(true)

    fireEvent.keyDown(document, { key: 't' })
    expect(screen.getByLabelText(/Theater mode \(T\)/i)).toBeInTheDocument()
    expect(loadPlayerSettings().isTheater).toBe(false)
  })

  it('switches between external controls mode and constrained overlay mode on resize', () => {
    const { rerender } = render(<TrailerVideoModal {...defaultProps} />)

    // With innerHeight = 800, external controls mode is active
    expect(screen.getByText('Interstellar — Trailer')).toBeInTheDocument()
    expect(screen.getByLabelText('Close trailer')).toBeInTheDocument()

    // Shrink window height to 400px (not enough space outside)
    act(() => {
      window.innerHeight = 400
      window.dispatchEvent(new Event('resize'))
    })

    rerender(<TrailerVideoModal {...defaultProps} />)

    // Controls remain fully functional inside overlay mode
    expect(screen.getByLabelText(/Pause \(Space\)/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Close trailer')).toBeInTheDocument()
  })
})
