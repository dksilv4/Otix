import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DownloadQueuePage } from '../download-queue'

vi.mock('@/lib/providers/auth', () => ({
  useAuth: () => ({
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

vi.mock('../../use-server-usenet', () => ({
  useServerUsenetQueue: () => ({
    data: {
      status: 'Downloading',
      speed: '45.2 MB/s',
      time_left: '0:14:00',
      items: mockQueueItems,
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
    render(<DownloadQueuePage />)

    const requestsTab = screen.getByRole('button', { name: /requests/i })
    fireEvent.click(requestsTab)

    expect(screen.getByText('Oppenheimer')).toBeInTheDocument()
    expect(screen.getAllByText('Requested').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('Forza Horizon 5 Premium')).not.toBeInTheDocument()
  })
})
