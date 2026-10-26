import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MatchReviewCenterModal } from '../components/organisms/match-review-center-modal'
import { apiClient } from '@/lib/api/client'

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

const mockRecords = [
  {
    id: 1,
    canonicalKey: 'hash:1111',
    rawTitle: 'Hades.v1.0.Setup',
    cleanedTitle: 'Hades',
    relativePath: 'Hades/setup.exe',
    formatCategory: 'installer',
    filesize: 104857600,
    sha256Head: '1111',
    matchStatus: 'needs_review',
    confidence: 0.8,
    candidates: [
      {
        mediaId: 'game-101',
        title: 'Hades',
        slug: 'hades',
        posterUrl: 'https://img.test/hades.jpg',
        releaseYear: 2020,
        confidence: 0.8,
      },
    ],
    userOverride: false,
    mediaItemId: null,
    media: null,
    storageShareName: 'NAS Pool',
    nodeName: 'Main Server',
  },
  {
    id: 2,
    canonicalKey: 'hash:2222',
    rawTitle: 'Unknown.Game.2023',
    cleanedTitle: 'Unknown Game',
    relativePath: 'Unknown/game.iso',
    formatCategory: 'iso',
    filesize: 2147483648,
    sha256Head: '2222',
    matchStatus: 'unmatched',
    confidence: 0.2,
    candidates: [],
    userOverride: false,
    mediaItemId: null,
    media: null,
    storageShareName: null,
    nodeName: 'Desktop Companion',
  },
  {
    id: 3,
    canonicalKey: 'hash:3333',
    rawTitle: 'Portal.2',
    cleanedTitle: 'Portal 2',
    relativePath: 'Portal 2/portal2.exe',
    formatCategory: 'installed_game',
    filesize: 8589934592,
    sha256Head: '3333',
    matchStatus: 'matched',
    confidence: 0.95,
    candidates: [],
    userOverride: true,
    mediaItemId: 'game-202',
    media: {
      id: 'game-202',
      title: 'Portal 2',
      slug: 'portal-2',
      posterUrl: 'https://img.test/portal2.jpg',
      releaseDate: '2011-04-18',
    },
    storageShareName: 'NAS Pool',
    nodeName: 'Main Server',
  },
]

describe('MatchReviewCenterModal', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    ;(apiClient.get as any).mockImplementation((url: string) => {
      if (url.startsWith('/library/matches')) {
        return Promise.resolve({ data: mockRecords })
      }
      if (url.startsWith('/search')) {
        return Promise.resolve({
          data: [
            { id: 999, title: 'Custom Searched Game', releaseDate: '2024-01-01' },
          ],
        })
      }
      return Promise.resolve({ data: [] })
    })
    ;(apiClient.post as any).mockResolvedValue({ data: { status: 'ok' } })
  })

  it('renders filter tabs with counts and lists pending review games', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MatchReviewCenterModal open={true} onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    )

    expect(screen.getByText('Game Match Review Center')).toBeInTheDocument()

    // Wait for records to load
    await waitFor(() => {
      expect(screen.getAllByText('Hades').length).toBeGreaterThanOrEqual(1)
    })

    expect(screen.getByRole('button', { name: /^needs review/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^unmatched/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^matched/i })).toBeInTheDocument()
    expect(screen.getByText('NAS Pool')).toBeInTheDocument()
    expect(screen.getByText(/80% match/i)).toBeInTheDocument()
  })

  it('confirms a suggested candidate match when Match button is clicked', async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={queryClient}>
        <MatchReviewCenterModal open={true} onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(screen.getAllByText('Hades')[0]).toBeInTheDocument()
    })

    const matchBtn = screen.getByRole('button', { name: /^match$/i })
    await user.click(matchBtn)

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/library/matches/1/confirm', {
        mediaItemId: 'game-101',
      })
    })
  })

  it('switches to matched tab and can unmatch a record', async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={queryClient}>
        <MatchReviewCenterModal open={true} onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^matched/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /^matched/i }))

    await waitFor(() => {
      expect(screen.getAllByText('Portal 2')[0]).toBeInTheDocument()
      expect(screen.getByText('Canonical Match Confirmed')).toBeInTheDocument()
    })

    const unmatchBtn = screen.getByRole('button', { name: /^unmatch$/i })
    await user.click(unmatchBtn)

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/library/matches/3/unmatch')
    })
  })
})
