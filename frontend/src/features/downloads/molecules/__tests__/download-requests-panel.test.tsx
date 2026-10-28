import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DownloadRequestsPanel } from '../download-requests-panel'
import * as useMediaRequestsModule from '../../use-media-requests'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

const mockRequests: useMediaRequestsModule.MediaRequestItem[] = [
  {
    id: 101,
    userId: 1,
    serverId: 5,
    serverName: 'Main Node',
    mediaType: 'movie',
    title: 'Dune: Part Two',
    year: 2024,
    tmdbId: '693134',
    posterUrl: 'https://image.tmdb.org/t/p/w500/dune.jpg',
    service: 'radarr',
    instanceName: 'Radarr 4K',
    qualityProfileName: 'Remux-2160p',
    rootFolderPath: '/data/movies',
    status: 'requested',
    progress: 0,
    searchNow: true,
    monitored: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    id: 102,
    userId: 1,
    serverId: 5,
    serverName: 'Main Node',
    mediaType: 'show',
    title: 'Severance',
    year: 2022,
    tmdbId: '93405',
    posterUrl: 'https://image.tmdb.org/t/p/w500/severance.jpg',
    service: 'sonarr',
    instanceName: 'Sonarr Standard',
    qualityProfileName: 'HD-1080p',
    rootFolderPath: '/data/tv',
    status: 'downloading',
    progress: 45,
    searchNow: true,
    monitored: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
  },
  {
    id: 103,
    userId: 1,
    serverId: 5,
    serverName: 'Main Node',
    mediaType: 'game',
    title: 'Black Myth: Wukong',
    year: 2024,
    service: 'usenet',
    instanceName: 'SABnzbd Games',
    status: 'available',
    progress: 100,
    searchNow: true,
    monitored: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
]

describe('DownloadRequestsPanel', () => {
  it('renders request cards with title, year, badges, and status', () => {
    vi.spyOn(useMediaRequestsModule, 'useMediaRequests').mockReturnValue({
      data: { items: mockRequests },
      isLoading: false,
      refetch: vi.fn(),
    } as any)

    render(<DownloadRequestsPanel />, { wrapper: createWrapper() })

    expect(screen.getByText('Dune: Part Two')).toBeInTheDocument()
    expect(screen.getByText('Severance')).toBeInTheDocument()
    expect(screen.getByText('Black Myth: Wukong')).toBeInTheDocument()

    expect(screen.getAllByText('Requested').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Downloading').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Available').length).toBeGreaterThanOrEqual(1)
  })

  it('filters by category pills (Movies, TV Shows, Games)', () => {
    vi.spyOn(useMediaRequestsModule, 'useMediaRequests').mockReturnValue({
      data: { items: mockRequests },
      isLoading: false,
      refetch: vi.fn(),
    } as any)

    render(<DownloadRequestsPanel />, { wrapper: createWrapper() })

    const moviesBtn = screen.getByRole('button', { name: /movies/i })
    fireEvent.click(moviesBtn)

    expect(screen.getByText('Dune: Part Two')).toBeInTheDocument()
    expect(screen.queryByText('Severance')).not.toBeInTheDocument()
    expect(screen.queryByText('Black Myth: Wukong')).not.toBeInTheDocument()

    const showsBtn = screen.getByRole('button', { name: /tv shows/i })
    fireEvent.click(showsBtn)

    expect(screen.queryByText('Dune: Part Two')).not.toBeInTheDocument()
    expect(screen.getByText('Severance')).toBeInTheDocument()
    expect(screen.queryByText('Black Myth: Wukong')).not.toBeInTheDocument()
  })

  it('filters requests based on search query', () => {
    vi.spyOn(useMediaRequestsModule, 'useMediaRequests').mockReturnValue({
      data: { items: mockRequests },
      isLoading: false,
      refetch: vi.fn(),
    } as any)

    render(<DownloadRequestsPanel />, { wrapper: createWrapper() })

    const input = screen.getByPlaceholderText(/search requested media/i)
    fireEvent.change(input, { target: { value: 'Wukong' } })

    expect(screen.getByText('Black Myth: Wukong')).toBeInTheDocument()
    expect(screen.queryByText('Dune: Part Two')).not.toBeInTheDocument()
    expect(screen.queryByText('Severance')).not.toBeInTheDocument()
  })

  it('renders empty state when there are no requests', () => {
    vi.spyOn(useMediaRequestsModule, 'useMediaRequests').mockReturnValue({
      data: { items: [] },
      isLoading: false,
      refetch: vi.fn(),
    } as any)

    render(<DownloadRequestsPanel />, { wrapper: createWrapper() })

    expect(screen.getByText('No requests yet')).toBeInTheDocument()
  })
})
