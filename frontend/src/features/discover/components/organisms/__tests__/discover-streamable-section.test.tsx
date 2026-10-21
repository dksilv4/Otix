import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DiscoverStreamableSection } from '../discover-streamable-section'
import * as streamAvailability from '@/features/media/hooks/use-stream-availability'
import { createWrapper } from '@/test-utils'

beforeAll(() => {
  class IntersectionObserverMock {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  }
  globalThis.IntersectionObserver = IntersectionObserverMock as unknown as typeof IntersectionObserver
})

vi.mock('@/features/media/hooks/use-stream-availability')
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
  useNavigate: () => vi.fn(),
  useRouter: () => ({ state: { location: { pathname: '/' } } }),
}))
vi.mock('@ui/molecules/carousel', () => ({
  Carousel: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      <h2>{title}</h2>
      <div>{children}</div>
    </div>
  ),
}))

describe('DiscoverStreamableSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(streamAvailability.useStreamAvailability).mockReturnValue({
      isStreamable: true,
      providerLabel: 'Plex',
      tone: 'amber',
      isLoading: false,
    })
  })

  it('renders Available to Stream carousel when plex is connected and items exist', () => {
    vi.mocked(streamAvailability.useStreamableCatalog).mockReturnValue({
      isPlexConnected: true,
      items: [
        { id: 'm1', title: 'The Matrix', mediaType: 'movie', slug: 'the-matrix' } as any,
        { id: 'm2', title: 'Inception', mediaType: 'movie', slug: 'inception' } as any,
      ],
      streamableIds: new Set(['m1', 'm2']),
      isLoading: false,
      isError: false,
    })

    render(<DiscoverStreamableSection />, { wrapper: createWrapper() })

    expect(screen.getByText('Available to Stream')).toBeInTheDocument()
    expect(screen.getByText('The Matrix')).toBeInTheDocument()
    expect(screen.getByText('Inception')).toBeInTheDocument()
  })

  it('returns null when plex is not connected', () => {
    vi.mocked(streamAvailability.useStreamableCatalog).mockReturnValue({
      isPlexConnected: false,
      items: [],
      streamableIds: new Set(),
      isLoading: false,
      isError: false,
    })

    const { container } = render(<DiscoverStreamableSection />, { wrapper: createWrapper() })
    expect(container.firstChild).toBeNull()
  })

  it('returns null when plex is connected but library is empty', () => {
    vi.mocked(streamAvailability.useStreamableCatalog).mockReturnValue({
      isPlexConnected: true,
      items: [],
      streamableIds: new Set(),
      isLoading: false,
      isError: false,
    })

    const { container } = render(<DiscoverStreamableSection />, { wrapper: createWrapper() })
    expect(container.firstChild).toBeNull()
  })
})
