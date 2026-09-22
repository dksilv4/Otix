import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RequestMediaButton } from '../media-request-button'
import * as useRequestMediaModule from '../../../hooks/use-request-media'
import type { RequestMediaState } from '../../../hooks/use-request-media'

vi.mock('../media-request-confirm-modal', () => ({
  MediaRequestConfirmModal: () => null,
}))

describe('RequestMediaButton', () => {
  const baseMockState: RequestMediaState = {
    hidden: false,
    loading: false,
    mediaType: 'movie',
    mediaTitle: 'Inception',
    mediaYear: 2010,
    posterUrl: null,
    requestLabel: 'Request Movie',
    loadingLabel: 'Checking Radarr…',
    disabledReason: null,
    instances: [],
    widgets: [],
    hasLibraryStatus: false,
    requesting: null,
    queueItem: null,
    queuePercent: 0,
    activeServerName: 'Homelab',
    serverId: 1,
    handleRequest: vi.fn(),
    handleCancelQueue: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading state with dynamic label and explanatory title', () => {
    vi.spyOn(useRequestMediaModule, 'useRequestMedia').mockReturnValue({
      ...baseMockState,
      loading: true,
      loadingLabel: 'Checking Radarr…',
      disabledReason: 'Checking Radarr library status…',
      instances: [],
    })

    render(<RequestMediaButton />)

    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    expect(btn).toHaveTextContent('Checking Radarr…')
    expect(btn).toHaveAttribute('title', 'Checking Radarr library status…')
    expect(btn.className).toContain('cursor-not-allowed')
  })

  it('renders disabled button with reason when unavailable (no targets)', () => {
    vi.spyOn(useRequestMediaModule, 'useRequestMedia').mockReturnValue({
      ...baseMockState,
      instances: [],
      disabledReason: 'Failed to connect to Radarr on Homelab',
    })

    render(<RequestMediaButton />)

    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    expect(btn).toHaveTextContent('Request Unavailable')
    expect(btn).toHaveAttribute('title', 'Failed to connect to Radarr on Homelab')
    expect(btn.className).toContain('cursor-not-allowed')
  })

  it('renders In Library chip with server/instance information', () => {
    vi.spyOn(useRequestMediaModule, 'useRequestMedia').mockReturnValue({
      ...baseMockState,
      instances: [
        { id: '1:radarr1', name: '4K Radarr', status: 'downloaded', file: null },
      ],
    })

    render(<RequestMediaButton />)

    const badge = screen.getByText('Available')
    expect(badge).toBeInTheDocument()
    expect(badge.closest('div')).toHaveAttribute('title', 'Available in library on: 4K Radarr')
  })

  it('renders Requested chip with server/instance information', () => {
    vi.spyOn(useRequestMediaModule, 'useRequestMedia').mockReturnValue({
      ...baseMockState,
      instances: [
        { id: '1:radarr1', name: '1080p Radarr', status: 'requested', file: null },
      ],
    })

    render(<RequestMediaButton />)

    const badge = screen.getByText('Requested')
    expect(badge).toBeInTheDocument()
    expect(badge.closest('div')).toHaveAttribute('title', 'Requested on: 1080p Radarr')
  })

  it('renders actionable button when target is requestable', () => {
    vi.spyOn(useRequestMediaModule, 'useRequestMedia').mockReturnValue({
      ...baseMockState,
      instances: [
        { id: '1:radarr1', name: '1080p Radarr', status: 'not_exists', file: null },
      ],
    })

    render(<RequestMediaButton />)

    const btn = screen.getByRole('button')
    expect(btn).not.toBeDisabled()
    expect(btn).toHaveTextContent('Request Movie')
    expect(btn).toHaveAttribute('title', 'Request on 1080p Radarr')
  })
})
