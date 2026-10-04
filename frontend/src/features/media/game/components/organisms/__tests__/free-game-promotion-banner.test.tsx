import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FreeGamePromotionBanner } from '../free-game-promotion-banner'
import type { MediaItemDetail } from '@media'

const mockDetailWithPromo: MediaItemDetail = {
  id: '882',
  title: 'System Shock 2: 25th Anniversary Remaster',
  mediaType: 'game',
  releaseDate: '2025-06-26',
  posterUrl: 'https://example.com/poster.jpg',
  freePromotions: [
    {
      id: 'epic-ss2',
      store: 'epic',
      storeName: 'Epic Games Store',
      claimUrl: 'https://store.epicgames.com/p/system-shock-2-remastered',
      isFreeNow: true,
      originalPrice: '$29.99',
      endDate: '2026-10-15T15:00:00Z',
    },
  ],
}

const mockDetailUpcoming: MediaItemDetail = {
  id: '1116',
  title: 'Out of Sight',
  mediaType: 'game',
  releaseDate: '2025-10-01',
  posterUrl: 'https://example.com/poster.jpg',
  freePromotions: [
    {
      id: 'epic-oos',
      store: 'epic',
      storeName: 'Epic Games Store',
      claimUrl: 'https://store.epicgames.com/p/out-of-sight',
      isFreeNow: false,
      startDate: '2026-10-16T15:00:00Z',
    },
  ],
}

const mockDetailNoPromo: MediaItemDetail = {
  id: '999',
  title: 'Regular Game',
  mediaType: 'game',
  releaseDate: '2024-01-01',
  posterUrl: 'https://example.com/poster.jpg',
  freePromotions: [],
}

// Mock desktop platform window open
const mockOpenSessionWindow = vi.fn()
vi.mock('@/lib/desktop/platform', () => ({
  getDesktopPlatform: () => ({ platform: 'darwin', isDesktop: true, isElectron: true }),
  openSessionWindow: (url: string) => mockOpenSessionWindow(url),
}))
vi.mock('@/lib/utils/open-external', () => ({
  openSessionWindow: (url: string) => mockOpenSessionWindow(url),
}))

// Mock notifications toast
const mockShowToast = vi.fn()
vi.mock('@ui/molecules/toast', () => ({
  showToast: (args: unknown) => mockShowToast(args),
}))

// Mock react-query discoverQueries so useGameFreePromotions doesn't invoke real fetch
vi.mock('@/features/discover/queries/discover-queries', () => ({
  discoverQueries: {
    freeGames: () => ({
      queryKey: ['discover', 'free-games'],
      queryFn: async () => ({ current: [], upcoming: [] }),
    }),
  },
}))

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('FreeGamePromotionBanner', () => {
  it('renders nothing when game has no free promotions', () => {
    const { container } = renderWithClient(<FreeGamePromotionBanner detail={mockDetailNoPromo} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders active giveaway promotion banner with pricing and claim button', () => {
    renderWithClient(<FreeGamePromotionBanner detail={mockDetailWithPromo} />)

    expect(screen.getByText(/Free Giveaway/i)).toBeInTheDocument()
    expect(screen.getByText('Epic Games Store')).toBeInTheDocument()
    expect(screen.getByText('Claim this game for free!')).toBeInTheDocument()
    expect(screen.getByText('$29.99')).toBeInTheDocument()
    expect(screen.getByText(/100% OFF · FREE/i)).toBeInTheDocument()

    const claimBtn = screen.getByRole('button', { name: /Claim on Epic Games Store/i })
    expect(claimBtn).toBeInTheDocument()

    fireEvent.click(claimBtn)
    expect(mockOpenSessionWindow).toHaveBeenCalledWith(
      'https://store.epicgames.com/p/system-shock-2-remastered',
    )
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Opening Store Page',
      }),
    )
  })

  it('renders upcoming giveaway promotion banner', () => {
    renderWithClient(<FreeGamePromotionBanner detail={mockDetailUpcoming} />)

    expect(screen.getByText(/Upcoming Giveaway/i)).toBeInTheDocument()
    expect(screen.getByText('Free giveaway coming soon!')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /View on Epic Games Store/i })).toBeInTheDocument()
  })
})
