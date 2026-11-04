import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ViewScannedGamesModal } from '../components/organisms/view-scanned-games-modal'
import { apiClient } from '@/lib/api/client'

const mockToast = vi.fn()
vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: mockToast }),
  useOptionalToast: () => ({ toast: mockToast }),
}))

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

const mockDesktopGames = [
  {
    id: 'pc_1',
    title: 'Cyberpunk 2077',
    exePath: 'C:\\Games\\Cyberpunk 2077\\bin\\x64\\Cyberpunk2077.exe',
    installDir: 'C:\\Games\\Cyberpunk 2077',
    platform: 'pc',
    sizeBytes: 75161927680,
    posterUrl: 'https://images.example.com/cyberpunk-poster.jpg',
    backdropUrl: 'https://images.example.com/cyberpunk-backdrop.jpg',
    overview: 'An open-world action-adventure RPG set in the megalopolis of Night City.',
    matched: true,
    confidence: 1.0,
    data: {
      id: 'igdb:1877',
      title: 'Cyberpunk 2077',
      year: 2020,
    },
  },
  {
    id: 'pc_2',
    title: 'Hollow Knight Silksong',
    exePath: 'C:\\Games\\Silksong\\Silksong.exe',
    installDir: 'C:\\Games\\Silksong',
    platform: 'pc',
    sizeBytes: 8589934592,
    posterUrl: null,
    backdropUrl: null,
    overview: null,
    matched: false,
    confidence: null,
  },
  {
    id: 'iso_1',
    title: 'Gran Turismo 4',
    exePath: 'D:\\ISOs\\Gran Turismo 4.iso',
    installDir: 'D:\\ISOs',
    platform: 'iso',
    sizeBytes: 4500000000,
    posterUrl: 'https://images.example.com/gt4-poster.jpg',
    backdropUrl: null,
    overview: 'Legendary driving simulator.',
    matched: true,
    confidence: 0.95,
  },
]

const mockCandidate = {
  id: 'igdb:99999',
  title: 'Hollow Knight: Silksong',
  slug: 'hollow-knight-silksong',
  posterUrl: 'https://images.example.com/silksong-poster.jpg',
  backdropUrl: 'https://images.example.com/silksong-backdrop.jpg',
  overview: 'Play as Hornet, princess-protector of Hallownest.',
  releaseDate: '2025-06-01',
  mediaType: 'game',
}

describe('ViewScannedGamesModal', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
    // Mock desktop API on window
    ;(window as any).desktopAPI = {
      getLocalGames: vi.fn().mockResolvedValue(mockDesktopGames),
      acceptSuggestion: vi.fn().mockResolvedValue(undefined),
    }

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('search')) {
        return {
          ok: true,
          json: async () => ({ items: [mockCandidate] }),
        } as any
      }
      return { ok: false } as any
    })
  })

  const renderComponent = (props = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ViewScannedGamesModal
          open={true}
          nodeName="Desktop Gaming PC"
          {...props}
        />
      </QueryClientProvider>,
    )
  }

  it('renders fully hydrated game cards with posters, badges, overview, and paths', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Cyberpunk 2077')).toBeInTheDocument()
    })

    // Check release year, format, and size
    expect(screen.getByText('2020')).toBeInTheDocument()
    expect(screen.getAllByText('PC').length).toBeGreaterThan(0)
    expect(screen.getByText('70.0 GB')).toBeInTheDocument()

    // Check matched pill with confidence and overview
    expect(screen.getAllByText(/Matched \(100%\)/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/An open-world action-adventure RPG/i)).toBeInTheDocument()
    expect(screen.getByText('C:\\Games\\Cyberpunk 2077')).toBeInTheDocument()

    // Check unmatched card
    expect(screen.getByText('Hollow Knight Silksong')).toBeInTheDocument()
    expect(screen.getByText('Unmatched')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Match Game/i })).toBeInTheDocument()
  })

  it('filters items using tabs (All, Matched, Unmatched, ISOs)', async () => {
    const user = userEvent.setup()
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Cyberpunk 2077')).toBeInTheDocument()
    })

    // Click Unmatched tab
    const unmatchedTab = screen.getByRole('button', { name: /Unmatched \(1\)/i })
    await user.click(unmatchedTab)

    expect(screen.getByText('Hollow Knight Silksong')).toBeInTheDocument()
    expect(screen.queryByText('Cyberpunk 2077')).not.toBeInTheDocument()
    expect(screen.queryByText('Gran Turismo 4')).not.toBeInTheDocument()

    // Click ISOs tab
    const isoTab = screen.getByRole('button', { name: /ISOs \(1\)/i })
    await user.click(isoTab)

    expect(screen.getByText('Gran Turismo 4')).toBeInTheDocument()
    expect(screen.queryByText('Cyberpunk 2077')).not.toBeInTheDocument()
    expect(screen.queryByText('Hollow Knight Silksong')).not.toBeInTheDocument()

    // Click Matched tab
    const matchedTab = screen.getByRole('button', { name: /Matched \(2\)/i })
    await user.click(matchedTab)

    expect(screen.getByText('Cyberpunk 2077')).toBeInTheDocument()
    expect(screen.getByText('Gran Turismo 4')).toBeInTheDocument()
    expect(screen.queryByText('Hollow Knight Silksong')).not.toBeInTheDocument()
  })

  it('filters items using search query input', async () => {
    const user = userEvent.setup()
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Cyberpunk 2077')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText(/Search scanned titles, formats, or paths/i)
    await user.type(searchInput, 'Silksong')

    expect(screen.getByText('Hollow Knight Silksong')).toBeInTheDocument()
    expect(screen.queryByText('Cyberpunk 2077')).not.toBeInTheDocument()
    expect(screen.queryByText('Gran Turismo 4')).not.toBeInTheDocument()
  })

  it('opens inline search drawer for unmatched title and successfully matches candidate', async () => {
    const user = userEvent.setup()

    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url.includes('/search')) {
        return { data: { items: [mockCandidate] } } as any
      }
      return { data: [] } as any
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Hollow Knight Silksong')).toBeInTheDocument()
    })

    // Click "Match Game" button
    const matchBtn = screen.getByRole('button', { name: /Match Game/i })
    await user.click(matchBtn)

    // Verify inline search pane opened with game title
    await waitFor(() => {
      expect(screen.getByText('Match with Catalog')).toBeInTheDocument()
      expect(screen.getByText('Hollow Knight: Silksong')).toBeInTheDocument()
    })

    // Click candidate "Match" button
    const confirmMatchBtn = screen.getByRole('button', { name: /^Match$/i })
    await user.click(confirmMatchBtn)

    // Verify desktop API acceptSuggestion was called
    await waitFor(() => {
      expect((window as any).desktopAPI.acceptSuggestion).toHaveBeenCalledWith(
        'pc_2',
        expect.objectContaining({
          id: 'igdb:99999',
          title: 'Hollow Knight: Silksong',
          posterUrl: 'https://images.example.com/silksong-poster.jpg',
        }),
      )
    })

    // Verify success toast was triggered
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Game matched',
        variant: 'success',
      }),
    )

    // Verify card is now marked as Matched in the modal
    await waitFor(() => {
      expect(screen.getByText('Hollow Knight: Silksong')).toBeInTheDocument()
      expect(screen.getByText('Play as Hornet, princess-protector of Hallownest.')).toBeInTheDocument()
    })
  })

  it('triggers onOpenChange and onClose when Close button is clicked', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const onClose = vi.fn()

    renderComponent({ onOpenChange, onClose })

    await waitFor(() => {
      expect(screen.getByText('Cyberpunk 2077')).toBeInTheDocument()
    })

    const closeBtn = screen.getByRole('button', { name: /^Close$/i })
    await user.click(closeBtn)

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onClose).toHaveBeenCalled()
  })
})
