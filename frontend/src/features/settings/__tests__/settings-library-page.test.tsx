import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SettingsLibraryPage } from '../pages/settings-library-page'

// Mock dependencies
vi.mock('@/features/plugins/pages/plugins-page', () => ({
  getPluginAPI: vi.fn(() => null),
}))

vi.mock('@/lib/modals', () => ({
  useModal: () => ({ openModal: vi.fn() }),
}))

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(() => Promise.resolve({ data: { items: [], hasMore: false } })),
  },
}))

vi.mock('@/components/path-picker', () => ({
  usePickFolder: () => ({ pick: vi.fn().mockResolvedValue(null) }),
}))

vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

vi.mock('../hooks/use-settings-hash-scroll', () => ({
  useSettingsHashScroll: () => {},
}))

vi.mock('@/features/proposals/pages/proposals-page', () => ({
  ProposalsPage: () => <div>Match Proposals</div>,
}))

describe('SettingsLibraryPage Sort Feature', () => {
  const mockGames = [
    {
      id: 'local-1',
      title: 'Zelda',
      platform: 'switch',
      providerName: 'switch',
      lastPlayedAt: '2025-01-01T00:00:00Z',
      playtimeMinutes: 120,
      otixMediaId: 'media-1',
    },
    {
      id: 'local-2',
      title: 'Alpha Protocol',
      platform: 'pc',
      providerName: 'steam',
      lastPlayedAt: '2026-02-01T00:00:00Z',
      playtimeMinutes: 500,
      otixMediaId: null,
      otixMatchSuggestion: { id: 'sugg-1' },
    },
    {
      id: 'local-3',
      title: 'Cyberpunk 2077',
      platform: 'pc',
      providerName: 'gog',
      lastPlayedAt: '2024-05-01T00:00:00Z',
      playtimeMinutes: 50,
      otixMediaId: null,
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    ;(window as any).desktopAPI = {
      getLocalGames: vi.fn().mockResolvedValue(mockGames),
      onGamesUpdated: vi.fn(() => () => {}),
    }
  })

  it('renders library settings with sort dropdown and direction toggle', async () => {
    render(<SettingsLibraryPage />)

    await waitFor(() => {
      expect(screen.getByText('Zelda')).toBeInTheDocument()
    })

    // Check that Sort dropdown label exists
    expect(screen.getByText('Sort: Title')).toBeInTheDocument()

    // Check that Ascending / Descending button exists
    const sortDirBtn = screen.getByTitle(/Ascending \(Click for Descending\)/i)
    expect(sortDirBtn).toBeInTheDocument()
  })

  it('toggles sort direction when direction button is clicked', async () => {
    render(<SettingsLibraryPage />)

    await waitFor(() => {
      expect(screen.getByText('Zelda')).toBeInTheDocument()
    })

    const sortDirBtn = screen.getByTitle(/Ascending \(Click for Descending\)/i)
    fireEvent.click(sortDirBtn)

    await waitFor(() => {
      expect(screen.getByTitle(/Descending \(Click for Ascending\)/i)).toBeInTheDocument()
    })
  })

  it('renders correctly sorted items by title by default', async () => {
    render(<SettingsLibraryPage />)

    await waitFor(() => {
      expect(screen.getByText('Zelda')).toBeInTheDocument()
    })

    const titles = screen.getAllByRole('button').map((btn) => btn.textContent).filter(Boolean)
    const alphaIdx = titles.findIndex((t) => t?.includes('Alpha Protocol'))
    const cyberpunkIdx = titles.findIndex((t) => t?.includes('Cyberpunk 2077'))
    const zeldaIdx = titles.findIndex((t) => t?.includes('Zelda'))

    expect(alphaIdx).toBeLessThan(cyberpunkIdx)
    expect(cyberpunkIdx).toBeLessThan(zeldaIdx)
  })

  it('deduplicates games from local scan and backend API', async () => {
    const { apiClient } = await import('@/lib/api/client')
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/library/steam') {
        return Promise.resolve({
          data: {
            items: [
              {
                id: 'sugg-1',
                title: 'Alpha Protocol',
                mediaType: 'game',
                steamPlaytimeForever: 500,
              },
            ],
            hasMore: false,
          },
        } as any)
      }
      return Promise.resolve({ data: { items: [], hasMore: false } } as any)
    })

    render(<SettingsLibraryPage />)

    await waitFor(() => {
      expect(screen.getByText('Alpha Protocol')).toBeInTheDocument()
    })

    const alphaElements = screen.getAllByText('Alpha Protocol')
    expect(alphaElements.length).toBe(1)
  })

  it('collapses regional, playtest, and beta title variants of the same game', async () => {
    ;(window as any).desktopAPI.getLocalGames.mockResolvedValue([
      { id: 'ava-1', title: 'Alliance of Valiant Arms', platform: 'steam' },
      { id: 'ava-2', title: 'A.V.A. Alliance of Valiant Arms', platform: 'steam' },
      { id: 'ava-3', title: 'Alliance of Valiant Arms Global', platform: 'steam' },
      { id: 'ava-4', title: 'Alliance of Valiant Arms - Test Server', platform: 'steam' },
      { id: 'ava-5', title: 'Alliance of Valiant Arms (Playtest)', platform: 'steam' },
      { id: 'ava-6', title: 'Alliance of Valiant Arms Beta', platform: 'steam' },
    ])

    render(<SettingsLibraryPage />)

    await waitFor(() => {
      expect(screen.getByText('Alliance of Valiant Arms')).toBeInTheDocument()
    })

    const avaButtons = screen.getAllByRole('button').filter((btn) => btn.textContent?.includes('Valiant Arms'))
    expect(avaButtons.length).toBe(1)
  })
})
