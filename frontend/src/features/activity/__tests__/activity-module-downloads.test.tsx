import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ActivityModuleDownloads } from '../components/molecules/activity-module-downloads'

const mockNavigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('@/lib/providers/auth', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'testuser' },
  }),
}))

let mockDownloads: any[] = []
let mockUsenetQueue: any = null
let mockSonarrQueue: any = null
let mockRadarrQueue: any = null

vi.mock('@/features/downloads/use-downloads', () => ({
  useDownloads: () => ({
    downloads: mockDownloads,
  }),
}))

vi.mock('@/features/downloads/use-server-downloads', () => ({
  useGameServers: () => ({
    data: [{ id: 1, name: 'Node 1', isActive: true }],
  }),
}))

vi.mock('@/features/downloads/use-server-usenet', () => ({
  useServerUsenetQueue: () => ({
    data: mockUsenetQueue,
  }),
}))

vi.mock('@/features/downloads/use-server-arr', () => ({
  useServerSonarrQueue: () => ({
    data: mockSonarrQueue,
  }),
  useServerRadarrQueue: () => ({
    data: mockRadarrQueue,
  }),
}))

describe('ActivityModuleDownloads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDownloads = []
    mockUsenetQueue = null
    mockSonarrQueue = null
    mockRadarrQueue = null
  })

  it('renders nothing when there are no downloads', () => {
    const { container } = render(<ActivityModuleDownloads />)
    expect(container.firstChild).toBeNull()
  })

  it('renders summary card with active count, speed, and primary episode info', () => {
    mockSonarrQueue = {
      records: [
        {
          id: 1,
          title: 'Brothers.2026.S01E02.The.Hunt.2160p.WEB-DL',
          status: 'downloading',
          showTitle: 'Brothers',
          seasonNumber: 1,
          episodeNumber: 2,
          size: 10_000_000_000,
          sizeLeft: 5_000_000_000,
        },
      ],
    }
    mockUsenetQueue = {
      speed: '38.4 MB/s',
      items: [],
    }

    render(<ActivityModuleDownloads />)

    expect(screen.getByText('Downloads')).toBeInTheDocument()
    expect(screen.getByText('1 active')).toBeInTheDocument()
    expect(screen.getByText('38.4 MB/s')).toBeInTheDocument()
    expect(screen.getByText(/Brothers S01E02/i)).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('navigates to /downloads when clicked', () => {
    mockDownloads = [
      {
        id: 'dl-1',
        status: 'downloading',
        mediaItemTitle: 'Forza Horizon 5',
        percentage: 45,
      },
    ]

    render(<ActivityModuleDownloads />)

    const card = screen.getByRole('button', { name: /open downloads manager/i })
    fireEvent.click(card)

    expect(mockNavigate).toHaveBeenCalledWith({ to: '/downloads' })
  })
})
