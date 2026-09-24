import { describe, expect, it, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverMock as any

  class IntersectionObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.IntersectionObserver = IntersectionObserverMock as any
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

import { DiscoverGenresSection } from './discover-genres-section'

function renderWithClient(ui: React.ReactElement) {
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

describe('DiscoverGenresSection', () => {
  it('renders section title, subtitle, and View All link to /genres', async () => {
    renderWithClient(<DiscoverGenresSection />)

    expect(await screen.findByText('Explore by Genre')).toBeDefined()

    const viewAllLink = await screen.findByRole('link', { name: /View all/i })
    expect(viewAllLink.getAttribute('href')).toBe('/genres')
  })

  it('renders genre cards linking to /genre/$genreId', async () => {
    renderWithClient(<DiscoverGenresSection />)

    expect(await screen.findByText('Action')).toBeDefined()
    expect(screen.getByText('Comedy')).toBeDefined()
    expect(screen.getByText('Science Fiction')).toBeDefined()
    expect(screen.getByText('Horror')).toBeDefined()

    const actionLink = screen.getByRole('link', { name: /Action/i })
    expect(actionLink.getAttribute('href')).toBe('/genre/action')

    const horrorLink = screen.getByRole('link', { name: /Horror/i })
    expect(horrorLink.getAttribute('href')).toBe('/genre/horror')
  })
})
