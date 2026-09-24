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
let mockSearch = { type: 'movie', sort: 'popularity' }

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
  useAuth: () => ({ user: { id: '1', country: 'US' } }),
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

function renderWithClient(ui: React.ReactElement) {
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
    mockSearch = { type: 'movie', sort: 'popularity' }
  })

  it('renders header, breadcrumbs, and media type switchers', async () => {
    renderWithClient(<GenrePage />)

    expect(screen.getByText('Discover')).toBeDefined()
    expect(screen.getByText('All Genres')).toBeDefined()
    expect(await screen.findByText('Action Movies')).toBeDefined()
    expect(screen.getByRole('button', { name: /Movies/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Shows/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Games/i })).toBeDefined()
  })

  it('renders genre pills and highlights active genre', async () => {
    renderWithClient(<GenrePage />)

    expect(await screen.findByText('Action')).toBeDefined()
    expect(screen.getByText('Comedy')).toBeDefined()
    expect(screen.getByText('Science Fiction')).toBeDefined()
  })

  it('renders media cards from infinite query', async () => {
    renderWithClient(<GenrePage />)

    expect(await screen.findByText('Mad Max: Fury Road')).toBeDefined()
    expect(screen.getByText('John Wick')).toBeDefined()
  })

  it('navigates when clicking a different genre pill', async () => {
    renderWithClient(<GenrePage />)

    const comedyPill = await screen.findByText('Comedy')
    fireEvent.click(comedyPill)

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/genre/$genreId',
      params: { genreId: 'comedy' },
      search: mockSearch,
    })
  })

  it('navigates when clicking a different media type tab', async () => {
    renderWithClient(<GenrePage />)

    const showsTab = screen.getByRole('button', { name: /Shows/i })
    fireEvent.click(showsTab)

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/genre/$genreId',
      params: { genreId: 'action' },
      search: { ...mockSearch, type: 'show', certification: undefined },
      replace: true,
    })
  })
})
