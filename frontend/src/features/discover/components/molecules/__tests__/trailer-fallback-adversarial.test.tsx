import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { TrailerVideoModal } from '../trailer-video-modal'
import { UnifiedMediaPlayerModal } from '@/features/media/components/organisms/unified-media-player-modal'

describe('Trailer Fallback & Error 150/101 PostMessage Adversarial Tests', () => {
  const defaultProps = {
    youtubeId: 'dQw4w9WgXcQ',
    title: 'Adversarial Movie',
    onClose: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    window.innerHeight = 800
    window.innerWidth = 1200
  })

  it('renders iframe initially and does not show fallback card before error', () => {
    render(<TrailerVideoModal {...defaultProps} />)

    expect(screen.getByTitle('Adversarial Movie trailer')).toBeInTheDocument()
    expect(screen.queryByText('Trailer Playback Restricted')).not.toBeInTheDocument()
    expect(screen.queryByText(/Watch on YouTube/i)).not.toBeInTheDocument()
  })

  it('switches to fallback card when receiving onError postMessage with code 150', () => {
    render(<TrailerVideoModal {...defaultProps} />)

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            event: 'onError',
            data: 150,
          },
        }),
      )
    })

    // Iframe must be replaced
    expect(screen.queryByTitle('Adversarial Movie trailer')).not.toBeInTheDocument()

    // Fallback card elements must be visible
    expect(screen.getByText('Trailer Playback Restricted')).toBeInTheDocument()
    expect(
      screen.getByText('The video publisher has restricted third-party embedded playback for this trailer.'),
    ).toBeInTheDocument()

    const link = screen.getByRole('link', { name: /Watch on YouTube/i }) as HTMLAnchorElement
    expect(link).toBeInTheDocument()
    expect(link.href).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(link.target).toBe('_blank')
    expect(link.rel).toBe('noopener noreferrer')
  })

  it('switches to fallback card when receiving onError postMessage with code 101', () => {
    render(<TrailerVideoModal {...defaultProps} />)

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            event: 'onError',
            data: 101,
          },
        }),
      )
    })

    expect(screen.getByText('Trailer Playback Restricted')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Watch on YouTube/i }) as HTMLAnchorElement
    expect(link.href).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  })

  it('switches to fallback card when receiving stringified JSON postMessage', () => {
    render(<TrailerVideoModal {...defaultProps} />)

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({
            event: 'onError',
            data: 150,
          }),
        }),
      )
    })

    expect(screen.getByText('Trailer Playback Restricted')).toBeInTheDocument()
  })

  it('switches to fallback card on YouTube infoDelivery with errorCode 150', () => {
    render(<TrailerVideoModal {...defaultProps} />)

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({
            event: 'infoDelivery',
            info: {
              errorCode: 150,
            },
          }),
        }),
      )
    })

    expect(screen.getByText('Trailer Playback Restricted')).toBeInTheDocument()
  })

  it('switches to fallback card on YouTube infoDelivery with error 101', () => {
    render(<TrailerVideoModal {...defaultProps} />)

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            event: 'infoDelivery',
            info: {
              error: 101,
            },
          },
        }),
      )
    })

    expect(screen.getByText('Trailer Playback Restricted')).toBeInTheDocument()
  })

  it('switches to fallback card for other embed-block error codes (2, 100, 5)', () => {
    for (const code of [2, 100, 5]) {
      const { unmount } = render(<TrailerVideoModal {...defaultProps} />)

      act(() => {
        window.dispatchEvent(
          new MessageEvent('message', {
            data: {
              event: 'onError',
              data: code,
            },
          }),
        )
      })

      expect(screen.getByText('Trailer Playback Restricted')).toBeInTheDocument()
      unmount()
    }
  })

  it('does NOT trigger fallback on non-blocking postMessage events or unhandled codes', () => {
    render(<TrailerVideoModal {...defaultProps} />)

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            event: 'onError',
            data: 999, // unknown code
          },
        }),
      )
    })

    expect(screen.queryByText('Trailer Playback Restricted')).not.toBeInTheDocument()
    expect(screen.getByTitle('Adversarial Movie trailer')).toBeInTheDocument()
  })

  it('tolerates malformed postMessage strings and arbitrary objects without throwing', () => {
    render(<TrailerVideoModal {...defaultProps} />)

    expect(() => {
      act(() => {
        window.dispatchEvent(new MessageEvent('message', { data: 'not-json-string' }))
        window.dispatchEvent(new MessageEvent('message', { data: null }))
        window.dispatchEvent(new MessageEvent('message', { data: undefined }))
        window.dispatchEvent(new MessageEvent('message', { data: 12345 }))
        window.dispatchEvent(new MessageEvent('message', { data: { event: null, info: null } }))
      })
    }).not.toThrow()

    expect(screen.getByTitle('Adversarial Movie trailer')).toBeInTheDocument()
  })

  it('UnifiedMediaPlayerModal in trailer mode behaves identically with error 150', () => {
    render(
      <UnifiedMediaPlayerModal
        mode="trailer"
        youtubeId="xyz987"
        title="Direct Unified Modal Test"
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByTitle('Direct Unified Modal Test trailer')).toBeInTheDocument()

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            event: 'onError',
            data: 150,
          },
        }),
      )
    })

    expect(screen.queryByTitle('Direct Unified Modal Test trailer')).not.toBeInTheDocument()
    expect(screen.getByText('Trailer Playback Restricted')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Watch on YouTube/i }) as HTMLAnchorElement
    expect(link.href).toBe('https://www.youtube.com/watch?v=xyz987')
  })
})
