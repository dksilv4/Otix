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

  it('does not render button while loading library status', () => {
    vi.spyOn(useRequestMediaModule, 'useRequestMedia').mockReturnValue({
      ...baseMockState,
      loading: true,
      loadingLabel: 'Checking Radarr…',
      disabledReason: 'Checking Radarr library status…',
      instances: [],
    })

    const { container } = render(<RequestMediaButton />)

    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByText('Checking Radarr…')).not.toBeInTheDocument()
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

  it('hides when hideIfAvailable is true and instance is downloaded', () => {
    vi.spyOn(useRequestMediaModule, 'useRequestMedia').mockReturnValue({
      ...baseMockState,
      instances: [
        { id: '1:radarr1', name: '4K Radarr', status: 'downloaded', file: null },
      ],
    })

    const { container } = render(<RequestMediaButton hideIfAvailable />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders interactive Stream button when onWatch is provided and item is downloaded', async () => {
    const onWatch = vi.fn()
    vi.spyOn(useRequestMediaModule, 'useRequestMedia').mockReturnValue({
      ...baseMockState,
      instances: [
        { id: '1:radarr1', name: '4K Radarr', status: 'downloaded', file: null },
      ],
    })

    render(<RequestMediaButton onWatch={onWatch} />)

    const btn = screen.getByRole('button', { name: /stream.*available/i })
    expect(btn).toBeInTheDocument()
    btn.click()
    expect(onWatch).toHaveBeenCalledTimes(1)
  })

  it('hides when hideIfAvailable is true even if item is requested (keeps single Play CTA on hero)', () => {
    vi.spyOn(useRequestMediaModule, 'useRequestMedia').mockReturnValue({
      ...baseMockState,
      mediaType: 'show',
      instances: [
        { id: '1:sonarr1', name: 'Sonarr', status: 'requested', file: null },
      ],
    })

    const { container } = render(<RequestMediaButton hideIfAvailable />)
    expect(container).toBeEmptyDOMElement()
  })

  it('hides when hideIfAvailable is true for partially available show', () => {
    vi.spyOn(useRequestMediaModule, 'useRequestMedia').mockReturnValue({
      ...baseMockState,
      mediaType: 'show',
      instances: [
        { id: '1:sonarr1', name: 'Sonarr', status: 'partially_available', file: null },
      ],
    })

    const { container } = render(<RequestMediaButton hideIfAvailable />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders single Stream button when onWatch is provided for partially available show without external play widget', () => {
    const onWatch = vi.fn()
    vi.spyOn(useRequestMediaModule, 'useRequestMedia').mockReturnValue({
      ...baseMockState,
      mediaType: 'show',
      instances: [
        { id: '1:sonarr1', name: 'Sonarr', status: 'partially_available', file: null },
      ],
    })

    render(<RequestMediaButton onWatch={onWatch} />)
    const streamBtn = screen.getByRole('button', { name: /stream.*available/i })
    expect(streamBtn).toBeInTheDocument()
    streamBtn.click()
    expect(onWatch).toHaveBeenCalledTimes(1)
  })
})



