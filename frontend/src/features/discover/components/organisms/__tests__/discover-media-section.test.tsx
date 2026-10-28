import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MediaSection } from '../discover-media-section'
import * as sectionFetchHooks from '@discover/hooks/use-section-fetch'
import * as streamHooks from '@/features/media/hooks/use-stream-availability'

class IntersectionObserverMock {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
globalThis.IntersectionObserver = IntersectionObserverMock as unknown as typeof IntersectionObserver

vi.mock('@discover/hooks/use-section-fetch', () => ({
  useSectionFetch: vi.fn(),
}))

vi.mock('@/features/media/hooks/use-stream-availability', () => ({
  useStreamableCatalog: vi.fn(),
}))

vi.mock('../../molecules/discover-media-carousel', () => ({
  MediaCarousel: ({ items, title, hideStreamBadge }: any) => (
    <div data-testid="media-carousel" data-title={title} data-hide-stream-badge={String(hideStreamBadge)}>
      {items.map((item: any) => (
        <span key={item.id} data-testid={`carousel-item-${item.id}`}>
          {item.title}
        </span>
      ))}
    </div>
  ),
}))

const mockItems = [
  { id: '1', title: 'Streamable Movie 1', mediaType: 'movie' },
  { id: '2', title: 'Unstreamable Movie 2', mediaType: 'movie' },
  { id: '3', title: 'Streamable Movie 3', mediaType: 'movie' },
] as any

describe('MediaSection streamable filtering', () => {
  it('renders all items with hideStreamBadge=false when activeIntent is not streamable', () => {
    vi.mocked(sectionFetchHooks.useSectionFetch).mockReturnValue({
      ref: { current: null },
      items: mockItems,
      showSkeleton: false,
      isEmpty: false,
      isError: false,
      refetch: vi.fn(),
    } as any)

    vi.mocked(streamHooks.useStreamableCatalog).mockReturnValue({
      isPlexConnected: true,
      items: [],
      streamableIds: new Set(['1', '3']),
      isLoading: false,
      isError: false,
    })

    render(
      <MediaSection
        title="Trending Movies"
        mediaType="movie"
        listType="trending"
        activeIntent="all"
      />,
    )

    expect(screen.getByTestId('media-carousel')).toHaveAttribute('data-hide-stream-badge', 'false')
    expect(screen.getByTestId('carousel-item-1')).toBeInTheDocument()
    expect(screen.getByTestId('carousel-item-2')).toBeInTheDocument()
    expect(screen.getByTestId('carousel-item-3')).toBeInTheDocument()
  })

  it('filters items in-place and sets hideStreamBadge=true when activeIntent is streamable', () => {
    vi.mocked(sectionFetchHooks.useSectionFetch).mockReturnValue({
      ref: { current: null },
      items: mockItems,
      showSkeleton: false,
      isEmpty: false,
      isError: false,
      refetch: vi.fn(),
    } as any)

    vi.mocked(streamHooks.useStreamableCatalog).mockReturnValue({
      isPlexConnected: true,
      items: [],
      streamableIds: new Set(['1', '3']),
      isLoading: false,
      isError: false,
    })

    render(
      <MediaSection
        title="Trending Movies"
        mediaType="movie"
        listType="trending"
        activeIntent="streamable"
      />,
    )

    expect(screen.getByTestId('media-carousel')).toHaveAttribute('data-hide-stream-badge', 'true')
    expect(screen.getByTestId('carousel-item-1')).toBeInTheDocument()
    expect(screen.queryByTestId('carousel-item-2')).not.toBeInTheDocument()
    expect(screen.getByTestId('carousel-item-3')).toBeInTheDocument()
  })

  it('hides the rail completely when activeIntent is streamable and no items match', () => {
    vi.mocked(sectionFetchHooks.useSectionFetch).mockReturnValue({
      ref: { current: null },
      items: [mockItems[1]], // only unstreamable item
      showSkeleton: false,
      isEmpty: false,
      isError: false,
      refetch: vi.fn(),
    } as any)

    vi.mocked(streamHooks.useStreamableCatalog).mockReturnValue({
      isPlexConnected: true,
      items: [],
      streamableIds: new Set(['1', '3']),
      isLoading: false,
      isError: false,
    })

    const { container } = render(
      <MediaSection
        title="Trending Movies"
        mediaType="movie"
        listType="trending"
        activeIntent="streamable"
      />,
    )

    expect(container.firstChild).toBeNull()
  })
})
