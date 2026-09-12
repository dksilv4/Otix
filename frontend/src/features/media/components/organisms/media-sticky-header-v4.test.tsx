import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MediaStickyHeaderV4 } from './media-sticky-header-v4'
import type { MediaItemDetail } from '@media'

// Mocks
vi.mock('@/old-features/auth', () => ({
  useAuth: () => ({ isAuthenticated: true }),
}))

vi.mock('@/lib/modals', () => ({
  useModal: () => ({ openModal: vi.fn(), modals: [], closeAll: vi.fn() }),
}))

vi.mock('@/lib/desktop/platform', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/desktop/platform')>()
  return {
    ...actual,
    useDesktopPlatform: () => ({ isDesktop: false }),
  }
})

vi.mock('@/features/interaction/interaction-queries', () => ({
  useToggleInteraction: () => ({ mutate: vi.fn() }),
  useUserInteractions: () => ({ data: { liked: true, watchlisted: false, watched: true } }),
}))

vi.mock('@/features/media/hooks/use-media-detail-plugin-actions', () => ({
  useMediaDetailPluginActions: () => ({
    playWidgets: [],
    requesting: false,
    handleRequest: vi.fn(),
    handlePlay: vi.fn(),
  }),
}))

vi.mock('@/features/navigation', () => ({
  useNavPillsVisibility: () => ({ showLeft: true, showRight: true, setOverride: vi.fn() }),
}))

const mockDetail: MediaItemDetail = {
  id: 'test-movie-1',
  title: 'Inception',
  mediaType: 'movie',
  releaseDate: '2010-07-16',
  posterUrl: 'https://example.com/poster.jpg',
  overallRating: 88,
  videos: [
    {
      id: 't1',
      url: 'https://www.youtube.com/watch?v=YoHD9XEInc0',
      videoType: 'Trailer',
      title: 'Official Trailer',
    },
  ],
  overview: 'A thief who steals corporate secrets through the use of dream-sharing technology.',
}

describe('MediaStickyHeaderV4', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.scrollY = 0
    window.innerWidth = 1200
  })

  it('renders title, release year, and score badge', () => {
    render(<MediaStickyHeaderV4 detail={mockDetail} mediaType="movie" />)

    expect(screen.getByText('Inception')).toBeInTheDocument()
    expect(screen.getByText('(2010)')).toBeInTheDocument()
    expect(screen.getByText('88%')).toBeInTheDocument()
  })

  it('applies Otix pill styling tokens (rounded-[2rem], backdrop-blur-[16px])', () => {
    render(<MediaStickyHeaderV4 detail={mockDetail} mediaType="movie" />)

    const header = screen.getByTestId('media-sticky-header')
    expect(header).toBeInTheDocument()
    expect(header.className).toContain('rounded-[2rem]')
    expect(header.className).toContain('backdrop-blur-[16px]')
  })

  it('becomes visible when scrolled past 340px', () => {
    render(<MediaStickyHeaderV4 detail={mockDetail} mediaType="movie" />)

    const header = screen.getByTestId('media-sticky-header')
    expect(header.className).toContain('opacity-0')

    act(() => {
      window.scrollY = 400
      fireEvent.scroll(window)
    })

    expect(header.className).toContain('opacity-100')
  })

  it('adapts placement to "between" on wide viewports with enough space', () => {
    window.innerWidth = 1400
    render(<MediaStickyHeaderV4 detail={mockDetail} mediaType="movie" />)

    const header = screen.getByTestId('media-sticky-header')
    expect(header.getAttribute('data-placement')).toBe('between')
  })

  it('adapts placement to "below" on narrow viewports to clear nav pills', () => {
    window.innerWidth = 600
    render(<MediaStickyHeaderV4 detail={mockDetail} mediaType="movie" />)

    const header = screen.getByTestId('media-sticky-header')
    expect(header.getAttribute('data-placement')).toBe('below')
  })

  it('renders primary trailer CTA button', () => {
    render(<MediaStickyHeaderV4 detail={mockDetail} mediaType="movie" />)

    const trailerBtn = screen.getByRole('button', { name: /trailer/i })
    expect(trailerBtn).toBeInTheDocument()
  })
})
