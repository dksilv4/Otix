import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver

  class IntersectionObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.IntersectionObserver = IntersectionObserverMock as unknown as typeof IntersectionObserver
})
import { DiscoverContinueWatchingSection } from '../discover-continue-watching-section'
import type { DiscoverContinueWatchingItem } from '../../../types'

const mockItems: DiscoverContinueWatchingItem[] = [
  {
    id: '101',
    ratingKey: '101',
    mediaType: 'show',
    title: 'Severance',
    episodeTitle: 'The You You Are',
    seasonNumber: 1,
    episodeNumber: 4,
    progressPercent: 50,
  },
]

let mockIsPlexConnected = true
let mockItemsList: DiscoverContinueWatchingItem[] = mockItems
let mockShowSkeleton = false
let mockIsEmpty = false
let mockIsError = false
const mockRefetch = vi.fn()

vi.mock('../../../hooks/use-discover-continue-watching', () => ({
  useDiscoverContinueWatching: () => ({
    ref: { current: null },
    items: mockItemsList,
    isPlexConnected: mockIsPlexConnected,
    showSkeleton: mockShowSkeleton,
    isEmpty: mockIsEmpty,
    isError: mockIsError,
    refetch: mockRefetch,
  }),
}))

vi.mock('../../../hooks/use-play-continue-watching', () => ({
  usePlayContinueWatching: () => ({
    playItem: vi.fn(),
    loadingItemId: null,
  }),
}))

// Mock Carousel to simplify rendering
vi.mock('@ui/molecules/carousel', () => ({
  Carousel: ({ title, children }: any) => (
    <div data-testid="carousel">
      <h2>{title}</h2>
      {children}
    </div>
  ),
}))

vi.mock('../../molecules/discover-media-section-skeleton', () => ({
  MediaSectionSkeleton: () => <div data-testid="media-section-skeleton" />,
}))

vi.mock('../../molecules/discover-section-error', () => ({
  DiscoverSectionError: ({ title, onRetry }: any) => (
    <div data-testid="section-error">
      <span>{title}</span>
      <button onClick={onRetry}>Retry</button>
    </div>
  ),
}))

describe('DiscoverContinueWatchingSection', () => {
  it('renders nothing when Plex is not connected', () => {
    mockIsPlexConnected = false
    mockIsEmpty = false
    mockShowSkeleton = false
    mockItemsList = mockItems

    const { container } = render(<DiscoverContinueWatchingSection />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when there are no continue watching items (isEmpty = true)', () => {
    mockIsPlexConnected = true
    mockIsEmpty = true
    mockShowSkeleton = false
    mockItemsList = []

    const { container } = render(<DiscoverContinueWatchingSection />)
    expect(container.firstChild).toBeNull()
  })

  it('renders skeleton when showSkeleton is true', () => {
    mockIsPlexConnected = true
    mockIsEmpty = false
    mockShowSkeleton = true
    mockIsError = false
    mockItemsList = []

    render(<DiscoverContinueWatchingSection />)
    expect(screen.getByTestId('media-section-skeleton')).toBeInTheDocument()
  })

  it('renders error state and retries on click', () => {
    mockIsPlexConnected = true
    mockIsEmpty = false
    mockShowSkeleton = false
    mockIsError = true
    mockItemsList = []

    render(<DiscoverContinueWatchingSection />)
    expect(screen.getByTestId('section-error')).toBeInTheDocument()
    screen.getByRole('button', { name: 'Retry' }).click()
    expect(mockRefetch).toHaveBeenCalled()
  })

  it('renders Continue Watching section with items when Plex is connected and items exist', () => {
    mockIsPlexConnected = true
    mockIsEmpty = false
    mockShowSkeleton = false
    mockIsError = false
    mockItemsList = mockItems

    render(<DiscoverContinueWatchingSection />)
    expect(screen.getByText('Continue Watching')).toBeInTheDocument()
    expect(screen.getByText('Severance')).toBeInTheDocument()
  })
})
