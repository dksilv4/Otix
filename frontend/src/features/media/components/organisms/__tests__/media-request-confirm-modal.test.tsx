import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MediaRequestConfirmModal } from '../media-request-confirm-modal'
import type { RequestMediaState } from '../../../hooks/use-request-media'

vi.mock('@/features/downloads/use-server-arr', () => ({
  useServerSonarrConfig: () => ({
    data: { quality_profile_id: 5, root_folder_path: '/Media/Shows' },
  }),
  useServerRadarrConfig: () => ({
    data: { quality_profile_id: 1, root_folder_path: '/Media/Movies' },
  }),
  useServerSonarrQualityProfiles: () => ({
    data: [
      { id: 5, name: 'Default' },
      { id: 8, name: 'Default +' },
    ],
    isLoading: false,
  }),
  useServerRadarrQualityProfiles: () => ({
    data: [{ id: 1, name: 'HD-1080p' }],
    isLoading: false,
  }),
  useServerSonarrRootFolders: () => ({
    data: [{ id: 2, path: '/Media/Shows', freeSpace: 107374182400 }],
    isLoading: false,
  }),
  useServerRadarrRootFolders: () => ({
    data: [{ id: 1, path: '/Media/Movies', freeSpace: 53687091200 }],
    isLoading: false,
  }),
}))

describe('MediaRequestConfirmModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockState: RequestMediaState = {
    hidden: false,
    loading: false,
    mediaType: 'show',
    mediaTitle: 'The Darwin Incident',
    mediaYear: '2025',
    posterUrl: 'https://image.tmdb.org/t/p/w500/darwin.jpg',
    requestLabel: 'Request Show',
    instances: [
      { id: '1:default', name: 'Primary Sonarr', status: 'not_exists', file: null },
      { id: '1:4k', name: '4K Sonarr', status: 'not_exists', file: null },
    ],
    widgets: [],
    hasLibraryStatus: false,
    requesting: null,
    queueItem: null,
    queuePercent: 0,
    activeServerName: 'Primary Server',
    serverId: 1,
    handleRequest: vi.fn().mockResolvedValue(undefined),
    handleCancelQueue: vi.fn(),
  }

  it('renders media details, profiles, and allows confirmation', async () => {
    const onClose = vi.fn()
    render(
      <MediaRequestConfirmModal
        open={true}
        onClose={onClose}
        state={mockState}
        initialInstanceId="1:default"
      />,
    )

    expect(screen.getByText('Confirm Request: The Darwin Incident')).toBeInTheDocument()
    expect(screen.getByText('The Darwin Incident')).toBeInTheDocument()
    expect(screen.getByText('2025')).toBeInTheDocument()
    expect(screen.getByText('TV Series · Sonarr')).toBeInTheDocument()

    // Submit request
    const confirmBtn = screen.getByRole('button', { name: /Confirm Request/i })
    expect(confirmBtn).toBeInTheDocument()
    await userEvent.click(confirmBtn)

    expect(mockState.handleRequest).toHaveBeenCalledWith({
      instanceId: '1:default',
      qualityProfileId: 5,
      rootFolderPath: '/Media/Shows',
      searchNow: true,
      monitored: true,
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('cancels without calling handleRequest', async () => {
    const onClose = vi.fn()
    render(
      <MediaRequestConfirmModal
        open={true}
        onClose={onClose}
        state={mockState}
      />,
    )

    const cancelBtn = screen.getByRole('button', { name: /Cancel/i })
    await userEvent.click(cancelBtn)

    expect(mockState.handleRequest).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})
