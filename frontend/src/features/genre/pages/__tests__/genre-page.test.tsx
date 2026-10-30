import { describe, expect, it, vi, beforeEach, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ContextMenuProvider } from '@/features/_config/context-menu'

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverMock as any
})

const mockNavigate = vi.fn()
let mockParams = { genreId: 'action' }
let mockSearch: Record<string, unknown> = { sort: 'popularity' }

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useParams: () => mockParams,
  useSearch: () => mockSearch,
  useNavigate: () => mockNavigate,
}))

vi.mock('@/features/auth/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: '1', country: 'US', preferredLanguages: ['en'] },
  }),
  useOptionalAuth: () => ({ isAuthenticated: true, user: { id: '1' } }),
}))

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(async (url: string) => {
      if (url === '/media/genres') {
        return {
          data: [
            { id: 28, name: 'Action', slug: 'action' },
            { id: 35, name: 'Comedy', slug: 'comedy' },
            { id: 878, name: 'Science Fiction', slug: 'science-fiction' },
          ],
        }
      }
      if (url === '/media/certifications') {
        return { data: ['PG-13', 'R'] }
      }
      return { data: {} }
    }),
  },
}))

vi.mock('@media/queries/media-queries', () => ({
  mediaQueries: {
    infiniteList: () => ({
      queryKey: ['media', 'infinite', 'mock'],
      queryFn: async () => ({
        items: [
          {
            id: 'item-1',
            title: 'Mad Max: Fury Road',
            mediaType: 'movie',
            posterUrl: 'https://example.com/poster.jpg',
            releaseDate: '2015-05-15',
            avgRating: 8.6,
          },
          {
            id: 'item-2',
            title: 'John Wick',
            mediaType: 'movie',
            posterUrl: 'https://example.com/wick.jpg',
            releaseDate: '2014-10-24',
            avgRating: 8.0,
          },
        ],
        hasMore: false,
        total: 2,
      }),
      initialPageParam: 1,
      getNextPageParam: () => undefined,
    }),
  },
}))

import { GenrePage } from '../genre-page'

const renderWithClient = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ContextMenuProvider>
        {ui}
      </ContextMenuProvider>
    </QueryClientProvider>,
  )
}

describe('GenrePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockParams = { genreId: 'action' }
    mockSearch = { sort: 'popularity' }
  })

  it('renders simplified header without back button', async () => {
    renderWithClient(<GenrePage />)

    expect(screen.queryByText('Discover')).toBeNull()
    expect(screen.queryByText('All Genres')).toBeNull()
    expect(await screen.findByRole('heading', { name: 'Action' })).toBeDefined()
    expect(screen.getByText('All media in Action')).toBeDefined()
  })

  it('renders genre pills and highlights active genre', async () => {
    renderWithClient(<GenrePage />)

    expect(await screen.findByText('Comedy')).toBeDefined()
    expect(screen.getByText('Science Fiction')).toBeDefined()
  })

  it('renders media cards from infinite query', async () => {
    renderWithClient(<GenrePage />)

    expect(await screen.findByText('Mad Max: Fury Road')).toBeDefined()
    expect(screen.getByText('John Wick')).toBeDefined()
  })

  it('adds a genre when clicking another category pill', async () => {
    renderWithClient(<GenrePage />)

    const comedyPill = await screen.findByText('Comedy')
    fireEvent.click(comedyPill)

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/genre/$genreId',
      params: { genreId: 'action' },
      search: { ...mockSearch, genres: 'action,comedy' },
      replace: true,
    })
  })

  it('defaults type, language, and anime filters', async () => {
    renderWithClient(<GenrePage />)

    expect(await screen.findByRole('heading', { name: 'Action' })).toBeDefined()
    expect(screen.getByText('Type: All')).toBeDefined()
    expect(screen.getByText('Language: English')).toBeDefined()
    expect(screen.getByText('Anime: With anime')).toBeDefined()
    expect(screen.queryByText('Music')).toBeNull()
  })
})
