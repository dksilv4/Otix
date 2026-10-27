import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MediaGameModesSection } from '../media-game-modes-section'
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

const mockDetailWithModes: MediaItemDetail = {
  id: 'game-1',
  title: 'Elden Ring',
  mediaType: 'game',
  gameModes: [
    { id: 'mode-1', gameMode: { id: 'm1', name: 'Single-player', slug: 'single-player' } },
    { id: 'mode-2', gameMode: { id: 'm2', name: 'Multiplayer', slug: 'multiplayer' } },
    { id: 'mode-3', gameMode: { id: 'm3', name: 'Co-operative', slug: 'co-op' } },
  ],
}

describe('MediaGameModesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseQuery.mockReturnValue({ data: null })
  })

  it('renders null when gameModes is empty', () => {
    const detailWithoutModes: MediaItemDetail = {
      id: 'game-2',
      title: 'Unknown Title',
      mediaType: 'game',
      gameModes: [],
    }

    const { container } = render(<MediaGameModesSection detail={detailWithoutModes} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders game modes section when game modes are available', () => {
    render(<MediaGameModesSection detail={mockDetailWithModes} />)

    expect(screen.getByRole('heading', { name: /^game modes$/i })).toBeInTheDocument()
    expect(screen.getByText('Single-player')).toBeInTheDocument()
    expect(screen.getByText('Multiplayer')).toBeInTheDocument()
    expect(screen.getByText('Co-operative')).toBeInTheDocument()
  })

  it('falls back to query data when detail prop is not provided', () => {
    mockUseQuery.mockReturnValue({ data: mockDetailWithModes })

    render(<MediaGameModesSection />)

    expect(screen.getByTestId('media-game-modes-section')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^game modes$/i })).toBeInTheDocument()
    expect(screen.getByText('Single-player')).toBeInTheDocument()
  })

  it('applies custom className to the card', () => {
    render(<MediaGameModesSection detail={mockDetailWithModes} className="custom-test-class" />)

    const card = screen.getByTestId('media-game-modes-section')
    expect(card).toHaveClass('custom-test-class')
  })
})
