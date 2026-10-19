import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DiscoverHero } from '../discover-hero'

// Mock react-router Link
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params, className }: any) => {
    let href = to
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        href = href.replace(`$${k}`, String(v))
      })
    }
    return (
      <a href={href} className={className}>
        {children}
      </a>
    )
  },
  useNavigate: () => vi.fn(),
}))


const mockMovie = {
  id: 'movie-1',
  title: 'Interstellar Odyssey',
  mediaType: 'movie',
  releaseDate: '2024-11-05',
  popularity: 120,
  avgRating: 8.8,
  ratingCount: 1500,
  posterUrl: 'https://example.com/poster1.jpg',
  backdropUrl: 'https://example.com/backdrop1.jpg',
}

const mockShow = {
  id: 'show-1',
  title: 'Arcane Chrono',
  mediaType: 'show',
  releaseDate: '2024-09-12',
  popularity: 150,
  avgRating: 9.1,
  ratingCount: 2200,
  posterUrl: 'https://example.com/poster2.jpg',
  backdropUrl: 'https://example.com/backdrop2.jpg',
}

const mockGame = {
  id: 'game-1',
  title: 'Cyber Protocol 2088',
  mediaType: 'game',
  releaseDate: '2025-02-18',
  popularity: 200,
  avgRating: 9.4,
  ratingCount: 3500,
  posterUrl: 'https://example.com/poster3.jpg',
  backdropUrl: 'https://example.com/backdrop3.jpg',
}

vi.mock('@discover/queries/discover-queries', () => ({
  discoverQueries: {
    hero: () => ({
      queryKey: ['discover', 'hero'],
      queryFn: async () => ({ items: [mockMovie, mockShow, mockGame] }),
      initialPageParam: '',
      getNextPageParam: () => undefined,
    }),
    list: (mediaType: string) => ({
      queryKey: ['discover', 'list', mediaType],
      queryFn: async () => {
        if (mediaType === 'movie') return { items: [mockMovie] }
        if (mediaType === 'show') return { items: [mockShow] }
        if (mediaType === 'game') return { items: [mockGame] }
        return { items: [] }
      },
      initialPageParam: '',
      getNextPageParam: () => undefined,
    }),
  },
}))

vi.mock('@media/queries/media-queries', () => ({
  mediaQueries: {
    detail: (mediaType: string, id: string) => ({
      queryKey: ['media', 'detail', mediaType, id],
      queryFn: async () => ({
        id,
        mediaType,
        title: id === 'game-1' ? 'Cyber Protocol 2088' : id === 'show-1' ? 'Arcane Chrono' : 'Interstellar Odyssey',
        overview: 'Epic futuristic journey with unforgettable storytelling.',
        platforms: [{ id: 'p1', platform: { id: 'plat-1', name: 'PC', slug: 'windows' } }],
      }),
    }),
  },
}))

describe('DiscoverHero', () => {
  it('renders clean multi-media switcher with Movies, TV Shows, and Games', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    queryClient.setQueryData(['discover', 'hero'], {
      pages: [{ items: [mockMovie, mockShow, mockGame] }],
      pageParams: [''],
    })
    queryClient.setQueryData(['discover', 'list', 'movie'], {
      pages: [{ items: [mockMovie] }],
      pageParams: [''],
    })
    queryClient.setQueryData(['discover', 'list', 'show'], {
      pages: [{ items: [mockShow] }],
      pageParams: [''],
    })
    queryClient.setQueryData(['discover', 'list', 'game'], {
      pages: [{ items: [mockGame] }],
      pageParams: [''],
    })

    render(
      <QueryClientProvider client={queryClient}>
        <DiscoverHero />
      </QueryClientProvider>,
    )

    // Category switcher buttons (without 'featured')
    expect(screen.getByRole('button', { name: /^all$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /movies/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /tv shows/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /games/i })).toBeInTheDocument()

    // Title, actions, and meta pill
    expect(screen.getByText('Interstellar Odyssey')).toBeInTheDocument()
    expect(screen.getByText(/View Details/i)).toBeInTheDocument()
    expect(screen.getByText('2024')).toBeInTheDocument()
    expect(screen.getByText('88%')).toBeInTheDocument()
  })

  it('switches to games when games category button is clicked', async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    queryClient.setQueryData(['discover', 'hero'], {
      pages: [{ items: [mockMovie, mockShow, mockGame] }],
      pageParams: [''],
    })
    queryClient.setQueryData(['discover', 'list', 'movie'], {
      pages: [{ items: [mockMovie] }],
      pageParams: [''],
    })
    queryClient.setQueryData(['discover', 'list', 'show'], {
      pages: [{ items: [mockShow] }],
      pageParams: [''],
    })
    queryClient.setQueryData(['discover', 'list', 'game'], {
      pages: [{ items: [mockGame] }],
      pageParams: [''],
    })

    render(
      <QueryClientProvider client={queryClient}>
        <DiscoverHero />
      </QueryClientProvider>,
    )

    const gamesBtn = screen.getByRole('button', { name: /games/i })
    await user.click(gamesBtn)

    expect(screen.getByText('Cyber Protocol 2088')).toBeInTheDocument()
    expect(screen.getByLabelText('PC')).toBeInTheDocument()
    expect(screen.getByTitle('PC')).toBeInTheDocument()
    expect(screen.queryByText(/^pc$/i)).not.toBeInTheDocument()
  })

  it('renders View Details link targeting the active item', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    queryClient.setQueryData(['discover', 'hero'], {
      pages: [{ items: [mockMovie] }],
      pageParams: [''],
    })

    render(
      <QueryClientProvider client={queryClient}>
        <DiscoverHero />
      </QueryClientProvider>,
    )

    const detailsLink = screen.getByRole('link', { name: /view details/i })
    expect(detailsLink).toBeInTheDocument()
    expect(detailsLink).toHaveAttribute('href', '/media/movie/movie-1')
  })
})
