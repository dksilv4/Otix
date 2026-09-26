import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PlexStorageOptimizerModal } from '../PlexStorageOptimizerModal'

const mockServers = [
  {
    id: 1,
    name: 'Home NAS',
    machine_identifier: 'nas-1',
    product: 'Plex Media Server',
    platform: 'Linux',
    owned: true,
    base_url: 'http://192.168.1.50:32400',
    item_count: 140,
  },
]

const mockSummary = {
  server_id: 1,
  total_bytes: 85_000_000_000,
  total_files: 150,
  total_items: 140,
  potential_savings_bytes: 25_000_000_000,
  watch_status: {
    watched_bytes: 55_000_000_000,
    unwatched_bytes: 30_000_000_000,
  },
  breakdown_by_library: [
    {
      library_id: 1,
      title: 'Movies',
      library_type: 'movie',
      total_bytes: 60_000_000_000,
      file_count: 100,
      item_count: 95,
    },
  ],
  breakdown_by_resolution: [
    { resolution: '1080p HD', total_bytes: 50_000_000_000, file_count: 90 },
    { resolution: '4K UHD', total_bytes: 35_000_000_000, file_count: 60 },
  ],
  breakdown_by_codec: [
    { codec: 'H.264 (AVC)', total_bytes: 45_000_000_000, file_count: 80 },
    { codec: 'HEVC (H.265)', total_bytes: 40_000_000_000, file_count: 70 },
  ],
  categories_summary: {
    duplicates: { count: 3, reclaimable_bytes: 12_000_000_000 },
    transcode: { count: 8, estimated_savings_bytes: 10_000_000_000 },
    unwatched: { count: 5, reclaimable_bytes: 6_000_000_000 },
    watched_shows: { count: 2, total_bytes: 8_000_000_000 },
  },
}

const mockDuplicates = {
  category: 'duplicates',
  total_count: 1,
  items: [
    {
      id: 101,
      server_id: 1,
      server_name: 'Home NAS',
      library_id: 1,
      library_title: 'Movies',
      library_type: 'movie',
      rating_key: 'rk-101',
      title: 'Blade Runner 2049',
      year: 2017,
      media_type: 'movie',
      viewed: true,
      view_count: 2,
      duration: 9800000,
      last_viewed_at: null,
      added_at: null,
      total_size: 40_000_000_000,
      parts: [
        {
          part_id: 'p1',
          file: '/movies/BR2049/BR2049.4k.mkv',
          size: 30_000_000_000,
          duration: 9800000,
          container: 'mkv',
          video_codec: 'hevc',
          video_codec_label: 'HEVC (H.265)',
          video_resolution: '4k',
          video_resolution_label: '4K UHD',
          audio_codec: 'truehd',
          audio_channels: 8,
          bitrate: 25000,
        },
        {
          part_id: 'p2',
          file: '/movies/BR2049/BR2049.1080p.mkv',
          size: 10_000_000_000,
          duration: 9800000,
          container: 'mkv',
          video_codec: 'h264',
          video_codec_label: 'H.264 (AVC)',
          video_resolution: '1080',
          video_resolution_label: '1080p HD',
          audio_codec: 'dts',
          audio_channels: 6,
          bitrate: 8000,
        },
      ],
      primary_codec: 'hevc',
      primary_codec_label: 'HEVC (H.265)',
      primary_resolution: '4k',
      primary_resolution_label: '4K UHD',
      reclaimable_bytes: 10_000_000_000,
      redundant_files: [
        {
          part_id: 'p2',
          file: '/movies/BR2049/BR2049.1080p.mkv',
          size: 10_000_000_000,
        },
      ],
    },
  ],
}

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn().mockImplementation((url: string) => {
      if (url === '/integrations/plex/storage/servers') {
        return Promise.resolve({ data: { servers: mockServers } })
      }
      if (url === '/integrations/plex/storage/summary') {
        return Promise.resolve({ data: mockSummary })
      }
      if (url === '/integrations/plex/storage/recommendations') {
        return Promise.resolve({ data: mockDuplicates })
      }
      return Promise.resolve({ data: {} })
    }),
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
}))

vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

function renderModal(props: Partial<React.ComponentProps<typeof PlexStorageOptimizerModal>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <PlexStorageOptimizerModal
        open={true}
        onOpenChange={vi.fn()}
        {...props}
      />
    </QueryClientProvider>
  )
}

describe('PlexStorageOptimizerModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders header, metric cards, and potential savings', async () => {
    renderModal()

    expect(await screen.findByText('Plex Storage Optimizer')).toBeInTheDocument()
    expect(await screen.findByText(/Total Scanned Storage/i)).toBeInTheDocument()
    expect(await screen.findByText(/Reclaimable Storage/i)).toBeInTheDocument()
    expect(await screen.findByText(/Up to 23.3 GB/i)).toBeInTheDocument()
  })

  it('renders category tabs with counts', async () => {
    renderModal()

    expect(await screen.findByText('Duplicates & Multi-Versions')).toBeInTheDocument()
    expect(screen.getByText('Transcode Candidates')).toBeInTheDocument()
    expect(screen.getByText('Dead Weight (Unwatched)')).toBeInTheDocument()
    expect(screen.getByText('Watched TV Series')).toBeInTheDocument()
    expect(screen.getByText('Space Hogs (Largest)')).toBeInTheDocument()
  })

  it('displays duplicate items with redundant file savings', async () => {
    renderModal()

    expect(await screen.findByText('Blade Runner 2049')).toBeInTheDocument()
    expect(await screen.findByText(/Save 9.3 GB/i)).toBeInTheDocument()
    expect(screen.getByText(/2 files detected/i)).toBeInTheDocument()
  })

  it('allows copying file paths and exporting CSV', async () => {
    renderModal()

    await screen.findByText('Blade Runner 2049')

    const copyBtn = screen.getByRole('button', { name: /Copy Paths/i })
    expect(copyBtn).toBeInTheDocument()

    const exportBtn = screen.getByRole('button', { name: /Export CSV/i })
    expect(exportBtn).toBeInTheDocument()
  })

  it('handles pure camelCase transformed API responses seamlessly', async () => {
    const { apiClient } = await import('@/lib/api/client')
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url === '/integrations/plex/storage/servers') {
        return Promise.resolve({ data: { servers: mockServers } })
      }
      if (url === '/integrations/plex/storage/summary') {
        return Promise.resolve({
          data: {
            serverId: 1,
            totalBytes: 100_000_000_000,
            totalFiles: 200,
            totalItems: 180,
            potentialSavingsBytes: 40_000_000_000,
            watchStatus: {
              watchedBytes: 60_000_000_000,
              unwatchedBytes: 40_000_000_000,
            },
            breakdownByLibrary: [],
            breakdownByResolution: [],
            breakdownByCodec: [],
            categoriesSummary: {},
          },
        })
      }
      if (url === '/integrations/plex/storage/recommendations') {
        return Promise.resolve({ data: { category: 'duplicates', totalCount: 0, items: [] } })
      }
      return Promise.resolve({ data: {} })
    })

    renderModal()
    expect(await screen.findByText('Plex Storage Optimizer')).toBeInTheDocument()
    expect(await screen.findByText(/Watched: 55.9 GB/i)).toBeInTheDocument()
    expect(await screen.findByText(/Unwatched: 37.3 GB/i)).toBeInTheDocument()
  })
})
