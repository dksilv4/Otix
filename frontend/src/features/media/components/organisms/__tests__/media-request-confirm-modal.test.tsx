import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MediaRequestConfirmModal } from '../media-request-confirm-modal'
import type { RequestMediaState } from '../../../hooks/use-request-media'
import type { ServerArrQueueItem } from '@/features/downloads/arr-types'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('@/features/downloads/use-media-requests', () => ({
  useCreateMediaRequest: () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  }),
}))

vi.mock('@/features/downloads/use-server-arr', () => ({
  useServerSonarrConfig: () => ({
    data: { quality_profile_id: 5, root_folder_path: '/Media/Shows' },
  }),
  useServerRadarrConfig: () => ({
    data: { quality_profile_id: 1, root_folder_path: '/Media/Movies' },
  }),
  useSaveServerRadarrConfig: () => ({ mutateAsync: vi.fn().mockResolvedValue({}), isPending: false }),
  useSaveServerSonarrConfig: () => ({ mutateAsync: vi.fn().mockResolvedValue({}), isPending: false }),
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
    mediaYear: 2025,
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

    // Inline success confirmation card
    expect(screen.getByText('Request Sent Successfully')).toBeInTheDocument()
    const doneBtn = screen.getByRole('button', { name: /Done/i })
    await userEvent.click(doneBtn)
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

  it('triggers double-check on modal open via refetchStatus', () => {
    const refetchStatus = vi.fn().mockResolvedValue(undefined)
    render(
      <MediaRequestConfirmModal
        open={true}
        onClose={vi.fn()}
        state={{
          ...mockState,
          refetchStatus,
        }}
      />,
    )

    expect(refetchStatus).toHaveBeenCalledTimes(1)
  })

  it('displays Already Requested alert and disables confirmation if title is already requested', () => {
    const requestedState: RequestMediaState = {
      ...mockState,
      instances: [
        { id: '1:default', name: 'Primary Sonarr', status: 'requested', file: null },
      ],
    }

    render(
      <MediaRequestConfirmModal
        open={true}
        onClose={vi.fn()}
        state={requestedState}
        initialInstanceId="1:default"
      />,
    )

    expect(screen.getAllByText('Already Requested')[0]).toBeInTheDocument()
    expect(screen.getByText(/already requested and monitored/i)).toBeInTheDocument()

    const disabledBtn = screen.getByRole('button', { name: 'Already Requested' })
    expect(disabledBtn).toBeDisabled()
  })

  it('displays Available in Library alert and provides Watch Now CTA if already downloaded', async () => {
    const onWatch = vi.fn()
    const downloadedState: RequestMediaState = {
      ...mockState,
      instances: [
        { id: '1:default', name: 'Primary Sonarr', status: 'downloaded', file: null },
      ],
    }

    render(
      <MediaRequestConfirmModal
        open={true}
        onClose={vi.fn()}
        state={downloadedState}
        initialInstanceId="1:default"
        onWatch={onWatch}
      />,
    )

    expect(screen.getByText('Available in Library')).toBeInTheDocument()
    expect(screen.getByText(/already downloaded on/i)).toBeInTheDocument()

    const disabledBtn = screen.getByRole('button', { name: 'Already Available' })
    expect(disabledBtn).toBeDisabled()

    const watchBtn = screen.getByRole('button', { name: /Watch Now/i })
    expect(watchBtn).toBeInTheDocument()
    await userEvent.click(watchBtn)
    expect(onWatch).toHaveBeenCalledTimes(1)
  })

  it('displays live downloading progress bar when queue item is present', () => {
    const queueState: RequestMediaState = {
      ...mockState,
      instances: [
        { id: '1:default', name: 'Primary Sonarr', status: 'requested', file: null },
      ],
      queueItem: {
        id: 99,
        title: 'The Darwin Incident S01E01',
        status: 'Downloading',
        size: 1000000,
        sizeleft: 500000,
      } as unknown as ServerArrQueueItem,
      queuePercent: 50,
    }

    render(
      <MediaRequestConfirmModal
        open={true}
        onClose={vi.fn()}
        state={queueState}
        initialInstanceId="1:default"
      />,
    )

    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('toggles advanced options accordion smoothly', async () => {
    render(
      <MediaRequestConfirmModal
        open={true}
        onClose={vi.fn()}
        state={mockState}
      />,
    )

    expect(screen.queryByText('Custom Root Folder')).not.toBeInTheDocument()
    const advancedToggle = screen.getByRole('button', { name: /Advanced Options/i })
    await userEvent.click(advancedToggle)
    expect(screen.getByText('Custom Root Folder')).toBeInTheDocument()
    expect(screen.getByText('Search immediately')).toBeInTheDocument()
    expect(screen.getByText('Monitored')).toBeInTheDocument()
  })

  it('allows user to save new preset as default when changed', async () => {
    render(
      <MediaRequestConfirmModal
        open={true}
        onClose={vi.fn()}
        state={mockState}
      />,
    )

    // Initially with default config, preset button is not shown
    expect(screen.queryByText('Set as new default')).not.toBeInTheDocument()

    // Change profile by clicking the profile dropdown button
    const dropdownBtn = screen.getByRole('button', { name: 'Default' })
    await userEvent.click(dropdownBtn)

    const option = await screen.findByRole('option', { name: 'Default +' })
    await userEvent.click(option)

    // Now "Set as new default" appears
    const setDefaultBtn = await screen.findByRole('button', { name: /Set as new default/i })
    expect(setDefaultBtn).toBeInTheDocument()

    await userEvent.click(setDefaultBtn)
    expect(await screen.findByText('Saved as default')).toBeInTheDocument()
  })
})
