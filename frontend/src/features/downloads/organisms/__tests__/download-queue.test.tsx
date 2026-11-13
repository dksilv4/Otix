import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DownloadQueuePage } from '../download-queue'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const renderPage = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <DownloadQueuePage />
    </QueryClientProvider>,
  )

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params, className }: any) => (
    <a href={`${to}/${params?.mediaId ?? ''}`} className={className}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}))



vi.mock('@/lib/providers/auth', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'testuser', isAdmin: true },
    isAuthenticated: true,
  }),
  useOptionalAuth: () => ({
    user: { id: 1, username: 'testuser', isAdmin: true },
    isAuthenticated: true,
  }),
}))

vi.mock('@/features/_config', () => ({
  useFeature: () => true,
}))

vi.mock('@/lib/modals', () => ({
  useModal: () => ({
    openModal: vi.fn(),
  }),
}))

vi.mock('@/lib/desktop/api', async (importOriginal) => {
  const actual = await importOriginal<Record<string, any>>()
  return {
    ...actual,
    isDesktop: () => true,
  }
})

vi.mock('react-helmet-async', () => ({
  Helmet: ({ children }: any) => <>{children}</>,
}))

vi.mock('../../use-downloads', () => ({
  useDownloads: () => ({
    downloads: [],
    loading: false,
    pollQueue: vi.fn(),
    cancelDownload: vi.fn(),
  }),
}))

vi.mock('../../use-server-downloads', () => ({
  useServerGames: () => ({
    data: {
      servers: [{ id: 1, name: 'Main Node' }],
      files: [],
    },
  }),
  useRemoteDownloads: () => ({
    activeTransfers: [],
    pauseDownload: vi.fn(),
    resumeDownload: vi.fn(),
    cancelDownload: vi.fn(),
  }),
}))

const mockQueueItems = [
  {
    nzo_id: 'SABnzbd_nzo_active1',
    filename: 'Forza Horizon 5 Premium',
    percentage: 65.4,
    size_mb: 110_000,
    size_left_mb: 38_060,
    speed: '45.2 MB/s',
    time_left: '0:14:00',
    status: 'Downloading',
  },
]

const mockHistoryItems = [
  {
    id: 1,
    nzo_id: 'SABnzbd_nzo_hist1',
    title: 'Hogwarts Legacy Deluxe',
    protocol: 'usenet',
    status: 'completed',
    percentage: 100,
    size_bytes: 85_000_000_000,
    completed_at: new Date().toISOString(),
  },
]

let currentMockQueueItems = mockQueueItems

vi.mock('../../use-server-usenet', () => ({
  useServerUsenetQueue: () => ({
    data: {
      status: 'Downloading',
      speed: '45.2 MB/s',
      time_left: '0:14:00',
      items: currentMockQueueItems,
    },
    refetch: vi.fn(),
  }),
  useServerUsenetHistory: () => ({
    data: mockHistoryItems,
    isLoading: false,
  }),
  useCancelServerQueueDownload: () => ({
    mutate: vi.fn(),
  }),
}))

let mockSonarrRecords: any[] = []
let mockRadarrRecords: any[] = []

vi.mock('../../use-server-arr', () => ({
  useServerSonarrQueue: () => ({
    data: { records: mockSonarrRecords },
    refetch: vi.fn(),
  }),
  useServerRadarrQueue: () => ({
    data: { records: mockRadarrRecords },
    refetch: vi.fn(),
  }),
  useCancelServerSonarrQueueItem: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useCancelServerRadarrQueueItem: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}))

vi.mock('../../use-media-requests', () => ({
  useMediaRequests: () => ({
    data: {
      items: [
        {
          id: 501,
          userId: 1,
          mediaType: 'movie',
          title: 'Oppenheimer',
          year: 2023,
          service: 'radarr',
          status: 'requested',
          progress: 0,
          searchNow: true,
          monitored: true,
        },
      ],
    },
    isLoading: false,
    refetch: vi.fn(),
  }),
  useDeleteMediaRequest: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}))

describe('DownloadQueuePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    currentMockQueueItems = mockQueueItems
    mockSonarrRecords = []
    mockRadarrRecords = []
  })

  it('renders active Sonarr episode downloads as rich episode cards with images and formatted data', () => {
    mockSonarrRecords = [
      {
        id: 991,
        title: 'Brothers.2026.S01E02.The.Hunt.2160p.ATVP.WEB-DL.x265',
        status: 'downloading',
        showTitle: 'Brothers',
        seasonNumber: 1,
        episodeNumber: 2,
        episodeName: 'The Hunt',
        episodeStillUrl: 'https://image.tmdb.org/t/p/w300/still.jpg',
        mediaItemId: 255737,
        size: 6_000_000_000,
        sizeLeft: 3_000_000_000,
        timeleft: '00:15:30',
        protocol: 'usenet',
        downloadClient: 'SABnzbd',
      },
    ]

    render(<DownloadQueuePage />)

    expect(screen.getByText('TV Downloads (Sonarr)')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Brothers' })).toBeInTheDocument()
    expect(screen.getByText('The Hunt')).toBeInTheDocument()
    expect(screen.getByText('S01E02')).toBeInTheDocument()
    expect(screen.getByText('50.0%')).toBeInTheDocument()
  })

  it('renders Active Downloads on the main tab and does not show history items', () => {
    render(<DownloadQueuePage />)

    // Main toolbar tabs
    expect(screen.getByRole('button', { name: /active downloads/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /download history/i })).toBeInTheDocument()

    // Active Usenet queue item is visible
    expect(screen.getByText('Forza Horizon 5 Premium')).toBeInTheDocument()
    expect(screen.getAllByText(/45.2 MB\/s/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('65.4%')).toBeInTheDocument()

    // History item should NOT be shown on the active tab
    expect(screen.queryByText('Hogwarts Legacy Deluxe')).not.toBeInTheDocument()
  })

  it('switches to the Download History tab and displays history items with full info', () => {
    render(<DownloadQueuePage />)

    const historyTab = screen.getByRole('button', { name: /download history/i })
    fireEvent.click(historyTab)

    // Now history item is visible
    expect(screen.getByText('Hogwarts Legacy Deluxe')).toBeInTheDocument()
    expect(screen.getAllByText('Completed').length).toBeGreaterThanOrEqual(1)

    // Active item should not be shown on the history tab
    expect(screen.queryByText('Forza Horizon 5 Premium')).not.toBeInTheDocument()
  })

  it('switches to the Requests tab and displays media requests sent from Otix', () => {
    renderPage()

    const requestsTab = screen.getByRole('button', { name: /requests/i })
    fireEvent.click(requestsTab)

    expect(screen.getByText('Oppenheimer')).toBeInTheDocument()
    expect(screen.getAllByText('Requested').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('Forza Horizon 5 Premium')).not.toBeInTheDocument()
  })

  it('safely renders Usenet TV episode items with camelCase nzoId without crashing or throwing replace error', () => {
    currentMockQueueItems = [
      {
        nzoId: 'SABnzbd_nzo_tv123',
        filename: 'One.Piece.1999.S19E01.WEB-DL.MULTi.1080p.x265',
        percentage: 42.5,
        sizeMb: 500,
        sizeLeftMb: 280,
        speed: '12.5 MB/s',
        timeLeft: '0:02:10',
        status: 'Downloading',
      } as any,
      {
        // Item with missing/undefined nzo_id and nzoId to test ultimate resilience
        filename: 'Monster.S02E02.2160p.WEB-DL',
        percentage: 10,
        sizeMb: 4000,
        sizeLeftMb: 3600,
        speed: '25 MB/s',
        timeLeft: '0:05:00',
        status: 'Downloading',
      } as any,
    ]

    render(<DownloadQueuePage />)

    expect(screen.getByText('Server Usenet Downloads (SABnzbd)')).toBeInTheDocument()
    expect(screen.getByText('S19E01')).toBeInTheDocument()
    expect(screen.getByText('S02E02')).toBeInTheDocument()
  })

  it('displays completed downloads during the 15-second grace window to prevent UI flicker before Plex indexing', () => {
    // 1. Initial render with active Radarr movie
    mockRadarrRecords = [
      {
        id: 777,
        title: 'Gladiator II',
        status: 'downloading',
        size: 15_000_000_000,
        sizeleft: 100_000,
        timeleft: '00:00:10',
      },
    ]

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <DownloadQueuePage />
      </QueryClientProvider>,
    )

    expect(screen.getByText('Gladiator II')).toBeInTheDocument()

    // 2. Download completes and disappears from Radarr active queue
    mockRadarrRecords = []

    rerender(
      <QueryClientProvider client={queryClient}>
        <DownloadQueuePage />
      </QueryClientProvider>,
    )

    // Grace window keeps it visible as "Download complete · Indexing in Plex library..."
    expect(screen.getByText('Gladiator II')).toBeInTheDocument()
    expect(screen.getByText(/Indexing in Plex library/i)).toBeInTheDocument()
    expect(screen.getByText('Syncing')).toBeInTheDocument()
  })
})
