import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MediaManageModal } from '../media-manage-modal'
import type { MediaAsset } from '@/features/admin'

const mockMutateSelection = vi.fn().mockResolvedValue({})
const mockMutateMirrorKeep = vi.fn().mockResolvedValue({})
const mockMutateTextlessPick = vi.fn().mockResolvedValue({})
const mockMutateMirroring = vi.fn().mockResolvedValue({})

let mockIsAdmin = true
let mockAssets: MediaAsset[] = []
let mockMirroringEnabled = true

vi.mock('@auth/hooks/use-auth', () => ({
  useAuth: () => ({
    user: mockIsAdmin ? { id: 'admin-1', isAdmin: true, username: 'admin' } : null,
    isAuthenticated: mockIsAdmin,
  }),
}))

vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}))

vi.mock(import('@tanstack/react-query'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useQuery: () => ({
      data: {
        id: 'movie-1',
        title: 'Inception',
        mediaType: 'movie',
      },
      isLoading: false,
    }),
    useQueryClient: () => ({
      invalidateQueries: vi.fn(),
    }),
  }
})

vi.mock('@/features/admin', () => ({
  useMediaAssets: () => ({
    data: {
      items: mockAssets,
    },
    isLoading: false,
  }),
  useSetArtworkSelection: () => ({
    mutateAsync: mockMutateSelection,
    isPending: false,
    variables: null,
  }),
  useSetAssetMirrorKeep: () => ({
    mutateAsync: mockMutateMirrorKeep,
    isPending: false,
    variables: null,
  }),
  useSetTextlessPick: () => ({
    mutateAsync: mockMutateTextlessPick,
    isPending: false,
    variables: null,
  }),
}))

vi.mock('@/features/media/hooks/use-media-admin-settings', () => ({
  useMirroring: () => ({
    data: { enabled: mockMirroringEnabled },
    isSuccess: true,
  }),
  useSetMirroring: () => ({
    mutateAsync: mockMutateMirroring,
    isPending: false,
  }),
}))

describe('MediaManageModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsAdmin = true
    mockMirroringEnabled = true
    mockAssets = [
      {
        id: 'asset-poster-1',
        assetType: 'poster',
        url: 'https://example.com/poster1.jpg',
        provider: 'tmdb',
        lang: 'en',
        score: 9.5,
        width: 1000,
        height: 1500,
        selectedContext: null,
        currentContexts: ['general'],
        isTextless: false,
        keepLocal: false,
      } as unknown as MediaAsset,
      {
        id: 'asset-poster-2',
        assetType: 'poster',
        url: 'https://example.com/poster2.jpg',
        provider: 'fanart',
        lang: 'en',
        score: 8.0,
        width: 1000,
        height: 1500,
        selectedContext: null,
        currentContexts: [],
        isTextless: false,
        keepLocal: false,
      } as unknown as MediaAsset,
      {
        id: 'asset-backdrop-1',
        assetType: 'backdrop',
        url: 'https://example.com/backdrop1.jpg',
        provider: 'tmdb',
        lang: null,
        score: 9.0,
        width: 1920,
        height: 1080,
        selectedContext: null,
        currentContexts: ['general'],
        isTextless: false,
        keepLocal: false,
      } as unknown as MediaAsset,
    ]
  })

  it('renders admin access required when user is not admin', () => {
    mockIsAdmin = false
    render(
      <MediaManageModal
        open={true}
        onClose={vi.fn()}
        mediaType="movie"
        mediaId="movie-1"
      />
    )

    expect(screen.getByText('Admin access required')).toBeInTheDocument()
  })

  it('renders modal header, title, tabs, and candidates when open', () => {
    render(
      <MediaManageModal
        open={true}
        onClose={vi.fn()}
        mediaType="movie"
        mediaId="movie-1"
      />
    )

    expect(screen.getByText('Manage Artwork')).toBeInTheDocument()
    expect(screen.getByText('Inception')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Poster/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Backdrop/i })).toBeInTheDocument()
    expect(screen.getByText('Candidates (2)')).toBeInTheDocument()
  })

  it('switches between artwork tabs', async () => {
    const user = userEvent.setup()
    render(
      <MediaManageModal
        open={true}
        onClose={vi.fn()}
        mediaType="movie"
        mediaId="movie-1"
      />
    )

    const backdropTab = screen.getByRole('tab', { name: /Backdrop/i })
    await user.click(backdropTab)

    expect(screen.getByText('Candidates (1)')).toBeInTheDocument()
  })

  it('pins the active asset for a theme when clicked', async () => {
    const user = userEvent.setup()
    render(
      <MediaManageModal
        open={true}
        onClose={vi.fn()}
        mediaType="movie"
        mediaId="movie-1"
      />
    )

    const darkBtn = screen.getByRole('button', { name: /Show in Dark theme/i })
    await user.click(darkBtn)

    expect(mockMutateSelection).toHaveBeenCalledWith({
      assetId: 'asset-poster-1',
      context: 'dark',
    })
  })

  it('toggles keep on disk when keep button is clicked', async () => {
    const user = userEvent.setup()
    render(
      <MediaManageModal
        open={true}
        onClose={vi.fn()}
        mediaType="movie"
        mediaId="movie-1"
      />
    )

    const keepBtn = screen.getByRole('button', { name: /Keep on disk/i })
    await user.click(keepBtn)

    expect(mockMutateMirrorKeep).toHaveBeenCalledWith({
      assetId: 'asset-poster-1',
      keep: true,
    })
  })

  it('calls onClose when close dialog button is clicked', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <MediaManageModal
        open={true}
        onClose={onClose}
        mediaType="movie"
        mediaId="movie-1"
      />
    )

    const closeBtn = screen.getByRole('button', { name: /Close dialog/i })
    await user.click(closeBtn)

    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when Escape key is pressed', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <MediaManageModal
        open={true}
        onClose={onClose}
        mediaType="movie"
        mediaId="movie-1"
      />
    )

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalled()
  })

  it('renders correctly inside ModalProvider with openModal', async () => {
    const { ModalProvider, ModalRoot, useModal } = await import('@/lib/modals')

    const TestTrigger = () => {
      const { openModal } = useModal()
      return (
        <button
          onClick={() => {
            const close = openModal(
              <MediaManageModal
                mediaType="movie"
                mediaId="movie-1"
                onClose={() => close()}
              />
            )
          }}
        >
          Open Manager
        </button>
      )
    };

    const user = userEvent.setup()
    render(
      <ModalProvider>
        <TestTrigger />
        <ModalRoot />
      </ModalProvider>
    )

    await user.click(screen.getByText('Open Manager'))

    expect(screen.getByText('Manage Artwork')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Close dialog/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Close dialog/i }))
  })

  it('renders "How this works" help without crashing', async () => {
    const user = userEvent.setup()
    render(
      <MediaManageModal
        open={true}
        onClose={vi.fn()}
        mediaType="movie"
        mediaId="movie-1"
      />
    )

    const helpBtn = screen.getByRole('button', { name: /How this works/i })
    await user.click(helpBtn)

    expect(screen.getByText(/fallback for Dark/i)).toBeInTheDocument()
    expect(screen.getByText(/overrides General for that theme/i)).toBeInTheDocument()
  })

  it('allows clicking a candidate and pinning it via "Set as Poster"', async () => {
    const user = userEvent.setup()
    render(
      <MediaManageModal
        open={true}
        onClose={vi.fn()}
        mediaType="movie"
        mediaId="movie-1"
      />
    )

    // Initially asset-poster-1 is active (it has currentContexts: ['general'])
    expect(screen.getByText('Active Default Poster')).toBeInTheDocument()

    // Click candidate 2 (fanart)
    const candidate2Btn = screen.getByRole('button', { name: /fanart/i })
    await user.click(candidate2Btn)

    // Preview switches to candidate 2
    expect(screen.getByText('Previewing Candidate Poster')).toBeInTheDocument()
    const setPosterBtn = screen.getByRole('button', { name: /Set as Poster/i })
    expect(setPosterBtn).toBeInTheDocument()

    // Click "Set as Poster"
    await user.click(setPosterBtn)

    expect(mockMutateSelection).toHaveBeenCalledWith({
      assetId: 'asset-poster-2',
      context: 'general',
    })
  })

  it('allows double-clicking a candidate to directly set as artwork', async () => {
    const user = userEvent.setup()
    render(
      <MediaManageModal
        open={true}
        onClose={vi.fn()}
        mediaType="movie"
        mediaId="movie-1"
      />
    )

    const candidate2Btn = screen.getByRole('button', { name: /fanart/i })
    await user.dblClick(candidate2Btn)

    expect(mockMutateSelection).toHaveBeenCalledWith({
      assetId: 'asset-poster-2',
      context: 'general',
    })
  })

  it('handles numeric IDs properly when selecting and pinning', async () => {
    mockAssets = [
      {
        id: 101 as any,
        assetType: 'poster',
        url: 'https://example.com/poster1.jpg',
        provider: 'tmdb',
        lang: 'en',
        score: 9.5,
        width: 1000,
        height: 1500,
        selectedContext: null,
        currentContexts: ['general'],
        isTextless: false,
        keepLocal: false,
      } as unknown as MediaAsset,
      {
        id: 102 as any,
        assetType: 'poster',
        url: 'https://example.com/poster2.jpg',
        provider: 'fanart',
        lang: 'en',
        score: 8.0,
        width: 1000,
        height: 1500,
        selectedContext: null,
        currentContexts: [],
        isTextless: false,
        keepLocal: false,
      } as unknown as MediaAsset,
    ]

    const user = userEvent.setup()
    render(
      <MediaManageModal
        open={true}
        onClose={vi.fn()}
        mediaType="movie"
        mediaId="movie-1"
      />
    )

    const candidate2Btn = screen.getByRole('button', { name: /fanart/i })
    await user.click(candidate2Btn)

    const setPosterBtn = screen.getByRole('button', { name: /Set as Poster/i })
    await user.click(setPosterBtn)

    expect(mockMutateSelection).toHaveBeenCalledWith({
      assetId: '102',
      context: 'general',
    })
  })
})

