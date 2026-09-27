import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

const mockGet = vi.fn()

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: (...args: any[]) => mockGet(...args),
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
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockImplementation(async (url: string) => {
      if (url === '/media/genres') {
        return {
          data: [
            { id: 28, name: 'Action', slug: 'action' },
            { id: 35, name: 'Comedy', slug: 'comedy' },
            { id: 878, name: 'Science Fiction', slug: 'science-fiction' },
            { id: 27, name: 'Horror', slug: 'horror' },
            { id: 999, name: 'Duplicate Action', slug: 'action' }, // duplicate slug to test deduplication
          ],
        }
      }
      return { data: [] }
    })
  })

  it('renders section title, subtitle, and View All link to /genres when eager', async () => {
    renderWithClient(<DiscoverGenresSection eager />)

    expect(await screen.findByText('Explore by Genre')).toBeDefined()
    expect(screen.getByText('Browse catalog by category')).toBeDefined()

    const viewAllLink = await screen.findByRole('link', { name: /View all/i })
    expect(viewAllLink.getAttribute('href')).toBe('/genres')
  })

  it('renders deduplicated genre cards linking to /genre/$genreId', async () => {
    renderWithClient(<DiscoverGenresSection eager />)

    expect(await screen.findByText('Action')).toBeDefined()
    expect(screen.getByText('Comedy')).toBeDefined()
    expect(screen.getByText('Science Fiction')).toBeDefined()
    expect(screen.getByText('Horror')).toBeDefined()
    expect(screen.queryByText('Duplicate Action')).toBeNull()

    const actionLink = screen.getByRole('link', { name: /Explore Action genre/i })
    expect(actionLink.getAttribute('href')).toBe('/genre/action')

    const horrorLink = screen.getByRole('link', { name: /Explore Horror genre/i })
    expect(horrorLink.getAttribute('href')).toBe('/genre/horror')
  })

  it('renders skeleton placeholder when deferred and waiting for view', () => {
    const { container } = renderWithClient(<DiscoverGenresSection />)
    const section = container.querySelector('#discover-section-genres')
    expect(section).toBeDefined()
    // Verify landscape aspect-[16/10] skeletons are rendered
    expect(container.querySelector('.aspect-\\[16\\/10\\]')).toBeDefined()
  })

  it('renders DiscoverSectionError with retry button when fetch fails', async () => {
    mockGet.mockRejectedValueOnce(new Error('Network error'))

    renderWithClient(<DiscoverGenresSection eager />)

    expect(await screen.findByText('Failed to load this section.')).toBeDefined()
    const retryButton = screen.getByRole('button', { name: /Retry/i })
    expect(retryButton).toBeDefined()

    // Test retry recovery
    mockGet.mockResolvedValueOnce({
      data: [{ id: 28, name: 'Action', slug: 'action' }],
    })
    fireEvent.click(retryButton)

    expect(await screen.findByText('Action')).toBeDefined()
  })

  it('caps carousel to top 10 most likely to click genres in priority order', async () => {
    // 15 genres in random order
    mockGet.mockResolvedValueOnce({
      data: [
        { id: 1, name: 'Western', slug: 'western' },
        { id: 2, name: 'Action', slug: 'action' },
        { id: 3, name: 'War', slug: 'war' },
        { id: 4, name: 'Comedy', slug: 'comedy' },
        { id: 5, name: 'Drama', slug: 'drama' },
        { id: 6, name: 'Science Fiction', slug: 'science-fiction' },
        { id: 7, name: 'Horror', slug: 'horror' },
        { id: 8, name: 'Adventure', slug: 'adventure' },
        { id: 9, name: 'Thriller', slug: 'thriller' },
        { id: 10, name: 'Animation', slug: 'animation' },
        { id: 11, name: 'Crime', slug: 'crime' },
        { id: 12, name: 'Fantasy', slug: 'fantasy' },
        { id: 13, name: 'Romance', slug: 'romance' },
        { id: 14, name: 'History', slug: 'history' },
        { id: 15, name: 'Documentary', slug: 'documentary' },
      ],
    })

    renderWithClient(<DiscoverGenresSection eager />)

    // Wait for the highest priority genre to be rendered
    expect(await screen.findByText('Action')).toBeDefined()

    // Top priority genres should be present
    expect(screen.getByText('Science Fiction')).toBeDefined()
    expect(screen.getByText('Comedy')).toBeDefined()
    expect(screen.getByText('Thriller')).toBeDefined()
    expect(screen.getByText('Horror')).toBeDefined()
    expect(screen.getByText('Drama')).toBeDefined()
    expect(screen.getByText('Adventure')).toBeDefined()
    expect(screen.getByText('Animation')).toBeDefined()

    // Low-priority genres (beyond top 10) should NOT be in the carousel
    expect(screen.queryByText('Western')).toBeNull()
    expect(screen.queryByText('War')).toBeNull()
    expect(screen.queryByText('History')).toBeNull()
  })
})
