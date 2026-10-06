import { describe, expect, it, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverMock as any
})

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params, ...props }: any) => {
    let href = to
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        href = href.replace(`$${key}`, value)
      }
    }
    return (
      <a href={href} {...props}>
        {children}
      </a>
    )
  },
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
            { id: 27, name: 'Horror', slug: 'horror' },
          ],
        }
      }
      return { data: [] }
    }),
  },
}))

import { GenresDirectoryPage } from '../genres-directory-page'

const renderWithClient = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
  )
}

describe('GenresDirectoryPage', () => {
  it('renders simplified header without back button', async () => {
    renderWithClient(<GenresDirectoryPage />)

    expect(screen.queryByText('Back to Discover')).toBeNull()
    expect(await screen.findByRole('heading', { name: 'Genres' })).toBeDefined()
    expect(screen.getByText('Browse the catalog by genre')).toBeDefined()
    expect(screen.queryByText('Music')).toBeNull()
  })

  it('renders genre cards in a grid', async () => {
    renderWithClient(<GenresDirectoryPage />)

    expect(await screen.findByText('Action')).toBeDefined()
    expect(screen.getByText('Comedy')).toBeDefined()
    expect(screen.getByText('Science Fiction')).toBeDefined()
    expect(screen.getByText('Horror')).toBeDefined()
  })

  it('filters genre cards by search query', async () => {
    renderWithClient(<GenresDirectoryPage />)

    await screen.findByText('Action')

    const searchInput = screen.getByPlaceholderText('Filter genres...')
    fireEvent.change(searchInput, { target: { value: 'scien' } })

    expect(screen.getByText('Science Fiction')).toBeDefined()
    expect(screen.queryByText('Action')).toBeNull()
    expect(screen.queryByText('Comedy')).toBeNull()
  })

  it('links genre cards to /genre/$genreId', async () => {
    renderWithClient(<GenresDirectoryPage />)

    await screen.findByText('Action')
    const actionLink = screen.getByRole('link', { name: /Action/i })
    expect(actionLink.getAttribute('href')).toBe('/genre/action')
  })
})
