import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NodeMassMatchModal } from '../components/organisms/node-mass-match-modal'
import type { ScannedGameItem } from '../utils/scanned-summary'

vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

// Mock searchCatalogGames and matchScannedGameItem
vi.mock('../utils/scanned-summary', () => ({
  searchCatalogGames: vi.fn().mockImplementation(async (query: string) => {
    if (query.toLowerCase().includes('witcher')) {
      return [
        {
          id: '101',
          title: 'The Witcher 3: Wild Hunt',
          releaseYear: 2015,
          posterUrl: '/witcher.jpg',
        },
      ]
    }
    if (query.toLowerCase().includes('cyberpunk')) {
      return [
        {
          id: '102',
          title: 'Cyberpunk 2077',
          releaseYear: 2020,
          posterUrl: '/cyberpunk.jpg',
        },
      ]
    }
    return []
  }),
  matchScannedGameItem: vi.fn().mockImplementation(async (game, candidate, platform) => {
    return {
      ...game,
      title: candidate.title,
      platform,
      matched: true,
      mediaId: candidate.id,
    }
  }),
}))

const mockGames: ScannedGameItem[] = [
  {
    id: 1,
    title: 'The Witcher 3 Wild Hunt GOTY',
    path: 'D:/Games/Witcher3/bin/x64/witcher3.exe',
    platform: 'pc',
    sizeBytes: 45000000000,
  },
  {
    id: 2,
    title: 'Unknown Title XYZ 999',
    path: 'D:/Games/Unknown/game.exe',
    platform: 'pc',
    sizeBytes: 1000000000,
  },
]

describe('NodeMassMatchModal', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    vi.clearAllMocks()
  })

  it('renders modal and analyzes games into bulk review table', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <NodeMassMatchModal
          open={true}
          onClose={vi.fn()}
          unmatchedGames={mockGames}
        />
      </QueryClientProvider>,
    )

    // Initially shows Mass Match Games title
    expect(screen.getByText('Mass Match Games')).toBeInTheDocument()

    // Waits for analysis to finish and review table to appear
    await waitFor(() => {
      expect(screen.getByText('The Witcher 3 Wild Hunt GOTY')).toBeInTheDocument()
      expect(screen.getByText('Unknown Title XYZ 999')).toBeInTheDocument()
    })

    // High confidence match is pre-selected and shows candidate
    expect(screen.getByText('The Witcher 3: Wild Hunt')).toBeInTheDocument()
    expect(screen.getByText('No candidate')).toBeInTheDocument()

    // Filter tabs are present
    expect(screen.getByText(/All \(2\)/)).toBeInTheDocument()
    expect(screen.getByText(/Ready \(1\)/)).toBeInTheDocument()
    expect(screen.getByText(/Unmatched \(1\)/)).toBeInTheDocument()
  })

  it('toggles selection and batch selection filters', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <NodeMassMatchModal
          open={true}
          onClose={vi.fn()}
          unmatchedGames={mockGames}
        />
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('The Witcher 3 Wild Hunt GOTY')).toBeInTheDocument()
    })

    // Clear selection
    const clearBtn = screen.getByRole('button', { name: /Clear/i })
    fireEvent.click(clearBtn)

    await waitFor(() => {
      expect(screen.getByText(/Ready \(0\)/)).toBeInTheDocument()
    })

    // High Conf selection
    const highConfBtn = screen.getByRole('button', { name: /High Conf/i })
    fireEvent.click(highConfBtn)

    await waitFor(() => {
      expect(screen.getByText(/Ready \(1\)/)).toBeInTheDocument()
    })
  })

  it('applies matches and transitions to completed state', async () => {
    const onMatchSuccess = vi.fn()
    const onFinish = vi.fn()

    render(
      <QueryClientProvider client={queryClient}>
        <NodeMassMatchModal
          open={true}
          onClose={vi.fn()}
          unmatchedGames={mockGames}
          onMatchSuccess={onMatchSuccess}
          onFinish={onFinish}
        />
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText(/Apply Matches \(1\)/i)).toBeInTheDocument()
    })

    const applyBtn = screen.getByRole('button', { name: /Apply Matches \(1\)/i })
    fireEvent.click(applyBtn)

    // Should transition to completed
    await waitFor(() => {
      expect(screen.getByText('Mass Matching Finished!')).toBeInTheDocument()
    })

    expect(onMatchSuccess).toHaveBeenCalledTimes(1)
  })

  it('allows manual candidate searching via inline search dialog', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <NodeMassMatchModal
          open={true}
          onClose={vi.fn()}
          unmatchedGames={mockGames}
        />
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Unknown Title XYZ 999')).toBeInTheDocument()
    })

    // Click "Search" on the unmatched row
    const searchBtns = screen.getAllByRole('button', { name: /Search/i })
    fireEvent.click(searchBtns[0])

    // Inline search dialog opens
    await waitFor(() => {
      expect(screen.getByText('Search Catalog Candidate')).toBeInTheDocument()
    })

    // Input new search term "cyberpunk"
    const searchInput = screen.getByPlaceholderText(/Search title on IGDB/i)
    fireEvent.change(searchInput, { target: { value: 'cyberpunk' } })
    fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' })

    // Candidate appears in dialog
    await waitFor(() => {
      expect(screen.getByText('Cyberpunk 2077')).toBeInTheDocument()
    })

    // Click Select
    const selectBtn = screen.getByRole('button', { name: /Select/i })
    fireEvent.click(selectBtn)

    // Dialog closes and row candidate is now Cyberpunk 2077
    await waitFor(() => {
      expect(screen.queryByText('Search Catalog Candidate')).not.toBeInTheDocument()
      expect(screen.getByText('Cyberpunk 2077')).toBeInTheDocument()
    })
  })
})
