import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { MediaActivityModal } from '../media-activity-modal'
import type { MediaActivityItem } from '../../../types/media-activity'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('../../hooks/use-quick-stream', () => ({
  useQuickStream: () => ({
    quickStream: vi.fn(),
    isStartingStream: false,
  }),
}))

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    delete: vi.fn(),
  },
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('MediaActivityModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders available media modal with supplying node details and stream button', () => {
    const activity: MediaActivityItem = {
      status: 'available',
      mediaType: 'movie',
      tmdbId: '550',
      title: 'Fight Club',
      year: 1999,
      nodeName: 'Primary Node',
      isOwned: true,
      canManage: true,
      owner: { id: 1, username: 'dk' },
    }

    render(
      <MediaActivityModal
        activity={activity}
        mediaId="tmdb:movie:550"
      />,
      { wrapper: createWrapper() },
    )

    expect(screen.getByText('Fight Club')).toBeInTheDocument()
    expect(screen.getByText('Primary Node')).toBeInTheDocument()
    expect(screen.getByText('Your Node')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Stream Now/i })).toBeInTheDocument()
  })

  it('renders processing modal with progress bar, ETA, and cancel button when canManage is true', () => {
    const activity: MediaActivityItem = {
      status: 'processing',
      mediaType: 'movie',
      tmdbId: '680',
      title: 'Pulp Fiction',
      year: 1994,
      progress: 65,
      size: 1000000000,
      sizeLeft: 350000000,
      timeleft: '00:04:15',
      nodeId: 2,
      queueId: 10,
      nodeName: "Friend's Box",
      isOwned: false,
      canManage: true, // admin share
      owner: { id: 3, username: 'alice', displayName: 'Alice' },
    }

    render(
      <MediaActivityModal
        activity={activity}
        mediaId="tmdb:movie:680"
      />,
      { wrapper: createWrapper() },
    )

    expect(screen.getByText('65%')).toBeInTheDocument()
    expect(screen.getByText(/ETA 00:04:15/i)).toBeInTheDocument()
    expect(screen.getByText('Shared by Alice')).toBeInTheDocument()
    expect(screen.getByText('Friend (Admin)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Cancel Download/i })).toBeInTheDocument()
  })

  it('hides cancel download button when canManage is false for friend node', () => {
    const activity: MediaActivityItem = {
      status: 'processing',
      mediaType: 'movie',
      tmdbId: '680',
      title: 'Pulp Fiction',
      progress: 40,
      nodeId: 2,
      queueId: 10,
      nodeName: "Bob's Server",
      isOwned: false,
      canManage: false, // read share
      owner: { id: 4, username: 'bob', displayName: 'Bob' },
    }

    render(
      <MediaActivityModal
        activity={activity}
        mediaId="tmdb:movie:680"
      />,
      { wrapper: createWrapper() },
    )

    expect(screen.queryByRole('button', { name: /Cancel Download/i })).not.toBeInTheDocument()
    expect(screen.getByText('Friend')).toBeInTheDocument()
  })
})
