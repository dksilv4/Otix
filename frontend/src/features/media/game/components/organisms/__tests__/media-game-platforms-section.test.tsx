import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MediaGamePlatformsSection } from '../media-game-platforms-section'
import type { MediaItemDetail } from '@media'

const mockUseQuery = vi.fn()

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    useQuery: (...args: any[]) => mockUseQuery(...args),
  }
})

vi.mock('@media', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    useMediaParams: () => ({ mediaType: 'game', mediaId: 'game-1' }),
    mediaQueries: {
      detail: () => ({ queryKey: ['media', 'detail', 'game', 'game-1'] }),
    },
  }
})

const mockDetailWithPlatforms: MediaItemDetail = {
  id: 'game-1',
  title: 'Elden Ring',
  mediaType: 'game',
  platforms: [
    { id: 'plat-1', platform: { id: 'p1', name: 'PlayStation 5', slug: 'ps5' } },
    { id: 'plat-2', platform: { id: 'p2', name: 'PC (Microsoft Windows)', slug: 'windows' } },
    { id: 'plat-3', platform: { id: 'p3', name: 'Xbox Series X/S', slug: 'xbox' } },
  ],
}

describe('MediaGamePlatformsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseQuery.mockReturnValue({ data: null })
  })

  it('renders null when platforms is empty', () => {
    const detailWithoutPlatforms: MediaItemDetail = {
      id: 'game-2',
      title: 'Unknown Title',
      mediaType: 'game',
      platforms: [],
    }

    const { container } = render(<MediaGamePlatformsSection detail={detailWithoutPlatforms} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders platforms section when platforms are available', () => {
    render(<MediaGamePlatformsSection detail={mockDetailWithPlatforms} />)

    expect(screen.getByRole('heading', { name: /^platforms$/i })).toBeInTheDocument()
    expect(screen.getByText('PS5')).toBeInTheDocument()
    expect(screen.getByTitle('PlayStation 5')).toBeInTheDocument()
    expect(screen.getByTitle('PC (Microsoft Windows)')).toBeInTheDocument()
  })

  it('falls back to query data when detail prop is not provided', () => {
    mockUseQuery.mockReturnValue({ data: mockDetailWithPlatforms })

    render(<MediaGamePlatformsSection />)

    expect(screen.getByTestId('media-game-platforms-section')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^platforms$/i })).toBeInTheDocument()
    expect(screen.getByText('PS5')).toBeInTheDocument()
  })

  it('applies custom className to the card', () => {
    render(<MediaGamePlatformsSection detail={mockDetailWithPlatforms} className="custom-test-class" />)

    const card = screen.getByTestId('media-game-platforms-section')
    expect(card).toHaveClass('custom-test-class')
  })
})
