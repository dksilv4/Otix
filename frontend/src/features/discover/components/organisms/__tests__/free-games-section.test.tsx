import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
  Link: ({ children, to, ...props }: any) => (
    <a href={typeof to === 'string' ? to : '#'} {...props}>
      {children}
    </a>
  ),
}))

const mockGet = vi.fn()

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: (...args: any[]) => mockGet(...args),
  },
}))

import { FreeGamesSection } from '../free-games-section'

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

describe('FreeGamesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when there are no free games', async () => {
    mockGet.mockResolvedValueOnce({
      data: { current: [], upcoming: [], total: 0 },
    })

    const { container } = renderWithClient(<FreeGamesSection />)

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/free-games')
      expect(container.firstChild).toBeNull()
    })
  })

  it('renders active free games with price and claim link', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        current: [
          {
            id: 'epic:astrea',
            store: 'epic',
            storeName: 'Epic Games Store',
            title: 'Astrea: Six-Sided Oracles',
            originalPrice: '$24.99',
            isFreeNow: true,
            claimUrl: 'https://store.epicgames.com/p/astrea',
            posterUrl: 'https://img.epic.com/astrea.jpg',
            endDate: '2026-10-01T15:00:00Z',
          },
          {
            id: 'steam:4059370',
            store: 'steam',
            storeName: 'Steam',
            title: 'Explosive Odds - Supporter Pack',
            originalPrice: '$1.99',
            isFreeNow: true,
            claimUrl: 'https://store.steampowered.com/app/4059370',
            posterUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/4059370/capsule_616x353.jpg',
            externalId: '4059370',
          },
        ],
        upcoming: [],
        total: 2,
      },
    })

    renderWithClient(<FreeGamesSection />)

    await waitFor(() => {
      expect(screen.getByText('Astrea: Six-Sided Oracles')).toBeInTheDocument()
    })

    expect(screen.getByText('Free Games')).toBeInTheDocument()
    expect(screen.getByText('2 Free Now')).toBeInTheDocument()
    expect(screen.getByText('$24.99')).toBeInTheDocument()
    expect(screen.getByText('100% OFF')).toBeInTheDocument()
    expect(screen.getByText('Explosive Odds - Supporter Pack')).toBeInTheDocument()

    // Spotlight: unmatched → claim is primary CTA
    const claimLink = screen.getByRole('link', { name: /claim on epic/i })
    expect(claimLink).toHaveAttribute('href', 'https://store.epicgames.com/p/astrea')
  })

  it('hydrates matched games through MediaCard with catalog artwork', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        current: [
          {
            id: 'epic:portal',
            store: 'epic',
            storeName: 'Epic Games Store',
            title: 'Portal',
            originalPrice: '$9.99',
            isFreeNow: true,
            claimUrl: 'https://store.epicgames.com/p/portal',
            posterUrl: 'https://img.epic.com/portal.jpg',
            matched: true,
            mediaItem: {
              id: '42',
              mediaType: 'game',
              title: 'Portal',
              slug: 'portal',
              posterUrl: 'https://cdn.otix/portal-poster.jpg',
              textlessPosterUrl: null,
              backdropUrl: 'https://cdn.otix/portal-backdrop.jpg',
              logoUrl: 'https://cdn.otix/portal-logo.png',
              logoColorGuess: null,
              releaseDate: '2007-10-10',
              popularity: 90,
              avgRating: 9.2,
              ratingCount: 120,
              likeCount: 0,
              watchlistCount: 0,
              watchedCount: 0,
              playedCount: 0,
              viewCount: 0,
            },
          },
        ],
        upcoming: [],
        total: 1,
      },
    })

    renderWithClient(<FreeGamesSection />)

    await waitFor(() => {
      expect(screen.getByText('Portal')).toBeInTheDocument()
    })

    expect(screen.queryByText('In Otix')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open in otix/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /claim on epic/i })).toBeInTheDocument()
  })

  it('shows free-now and coming-soon titles together without tabs', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        current: [
          {
            id: 'epic:astrea',
            store: 'epic',
            storeName: 'Epic Games Store',
            title: 'Astrea: Six-Sided Oracles',
            originalPrice: '$24.99',
            isFreeNow: true,
            claimUrl: 'https://store.epicgames.com/p/astrea',
          },
        ],
        upcoming: [
          {
            id: 'epic:system-shock-2',
            store: 'epic',
            storeName: 'Epic Games Store',
            title: 'System Shock 2: 25th Anniversary Remaster',
            originalPrice: '$29.99',
            isFreeNow: false,
            claimUrl: 'https://store.epicgames.com/p/system-shock-2',
            startDate: '2026-10-03T15:00:00Z',
          },
        ],
        total: 2,
      },
    })

    renderWithClient(<FreeGamesSection />)

    await waitFor(() => {
      expect(screen.getByText('Astrea: Six-Sided Oracles')).toBeInTheDocument()
    })

    expect(screen.getByText('System Shock 2: 25th Anniversary Remaster')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /coming soon/i })).not.toBeInTheDocument()
    expect(screen.getByText('SOON')).toBeInTheDocument()
  })

  it('renders GOG free game with GOG store label and claim link', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        current: [
          {
            id: 'gog_1455194922',
            store: 'gog',
            storeName: 'GOG',
            title: 'Bounty Train',
            originalPrice: '$9.99',
            isFreeNow: true,
            claimUrl: 'https://www.gog.com/en/game/bounty_train',
            posterUrl: 'https://images.gog.com/bounty.jpg',
            matched: false,
            mediaItem: null,
          },
        ],
        upcoming: [],
        total: 1,
      },
    })

    renderWithClient(<FreeGamesSection />)

    expect(await screen.findByText('Bounty Train')).toBeInTheDocument()
    expect(screen.getAllByText('GOG').length).toBeGreaterThan(0)
    const claimLink = screen.getByRole('link', { name: /claim on gog/i })
    expect(claimLink).toHaveAttribute('href', 'https://www.gog.com/en/game/bounty_train')
  })
})
