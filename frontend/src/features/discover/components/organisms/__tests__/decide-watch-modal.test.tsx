import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ModalProvider, ModalRoot, useModal } from '@/lib/modals'
import { DecideWatchModal } from '../decide-watch-modal'

const mockNavigate = vi.fn().mockResolvedValue(undefined)
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))
vi.mock('@/lib/router', () => ({
  router: {
    navigate: (...args: any[]) => mockNavigate(...args),
  },
}))

vi.mock('@auth/hooks/use-auth', () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false }),
}))

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({ data: { blocked: true, created: true } }),
    delete: vi.fn().mockResolvedValue({ data: { blocked: false, unblocked: true } }),
  },
}))

const TestOpener = ({ onClose }: { onClose: () => void }) => {
  const { openModal } = useModal()
  return (
    <button
      onClick={() => {
        const close = openModal(
          <DecideWatchModal
            onClose={() => {
              onClose()
              close()
            }}
          />,
        )
      }}
    >
      Open Decide
    </button>
  )
};

describe('DecideWatchModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without immediately closing', async () => {
    const onClose = vi.fn()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <ModalProvider>
          <TestOpener onClose={onClose} />
          <ModalRoot />
        </ModalProvider>
      </QueryClientProvider>,
    )

    const user = userEvent.setup()
    await user.click(screen.getByText('Open Decide'))

    expect(await screen.findByRole('heading', { name: 'Decide for me' })).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('renders shortlist items without crashing or closing', async () => {
    const onClose = vi.fn()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { apiClient } = await import('@/lib/api/client')
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url.includes('/media/decide')) {
        return {
          data: {
            pick: {
              id: '123',
              mediaType: 'movie',
              title: 'Inception',
              posterUrl: '/poster.jpg',
            },
            shortlist: [
              {
                id: '456',
                mediaType: 'movie',
                title: 'Interstellar',
                posterUrl: '/poster2.jpg',
              },
            ],
            coldStart: false,
          },
        } as any
      }
      return { data: [] } as any
    })

    render(
      <QueryClientProvider client={queryClient}>
        <ModalProvider>
          <TestOpener onClose={onClose} />
          <ModalRoot />
        </ModalProvider>
      </QueryClientProvider>,
    )

    const user = userEvent.setup()
    await user.click(screen.getByText('Open Decide'))

    expect(await screen.findByRole('heading', { name: 'Decide for me' })).toBeInTheDocument()
    expect(await screen.findByText('Inception')).toBeInTheDocument()
    expect(await screen.findByText('Interstellar')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('allows blocking the hero recommendation and promotes next candidate', async () => {
    const onClose = vi.fn()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { apiClient } = await import('@/lib/api/client')
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url.includes('/media/decide')) {
        return {
          data: {
            pick: {
              id: '123',
              mediaType: 'movie',
              title: 'Inception',
              posterUrl: '/poster.jpg',
            },
            shortlist: [
              {
                id: '456',
                mediaType: 'movie',
                title: 'Interstellar',
                posterUrl: '/poster2.jpg',
              },
            ],
            coldStart: false,
          },
        } as any
      }
      return { data: [] } as any
    })

    render(
      <QueryClientProvider client={queryClient}>
        <ModalProvider>
          <TestOpener onClose={onClose} />
          <ModalRoot />
        </ModalProvider>
      </QueryClientProvider>,
    )

    const user = userEvent.setup()
    await user.click(screen.getByText('Open Decide'))

    expect(await screen.findByText('Inception')).toBeInTheDocument()
    const blockButton = screen.getByRole('button', { name: /don't recommend/i })
    expect(blockButton).toBeInTheDocument()

    await user.click(blockButton)

    // Verify API called to block item
    expect(apiClient.post).toHaveBeenCalledWith(
      expect.stringContaining('block-recommendation'),
    )
    // Interstellar should now be promoted to hero
    expect(await screen.findByRole('heading', { name: 'Interstellar' })).toBeInTheDocument()
  })

  it('allows blocking a shortlist item via its card action', async () => {
    const onClose = vi.fn()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { apiClient } = await import('@/lib/api/client')
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url.includes('/media/decide')) {
        return {
          data: {
            pick: {
              id: '123',
              mediaType: 'movie',
              title: 'Inception',
              posterUrl: '/poster.jpg',
            },
            shortlist: [
              {
                id: '456',
                mediaType: 'movie',
                title: 'Interstellar',
                posterUrl: '/poster2.jpg',
              },
            ],
            coldStart: false,
          },
        } as any
      }
      return { data: [] } as any
    })

    render(
      <QueryClientProvider client={queryClient}>
        <ModalProvider>
          <TestOpener onClose={onClose} />
          <ModalRoot />
        </ModalProvider>
      </QueryClientProvider>,
    )

    const user = userEvent.setup()
    await user.click(screen.getByText('Open Decide'))

    expect(await screen.findByText('Interstellar')).toBeInTheDocument()
    const blockShortlistBtn = screen.getByRole('button', {
      name: /block interstellar from recommendations/i,
    })
    expect(blockShortlistBtn).toBeInTheDocument()

    await user.click(blockShortlistBtn)

    expect(apiClient.post).toHaveBeenCalledWith(
      expect.stringContaining('block-recommendation'),
    )
  })

  it('navigates to media detail and closes modal when Open is clicked', async () => {
    const onClose = vi.fn()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { apiClient } = await import('@/lib/api/client')
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url.includes('/media/decide')) {
        return {
          data: {
            pick: {
              id: '123',
              mediaType: 'movie',
              title: 'Inception',
              posterUrl: '/poster.jpg',
            },
            shortlist: [],
            coldStart: false,
          },
        } as any
      }
      return { data: [] } as any
    })

    render(
      <QueryClientProvider client={queryClient}>
        <ModalProvider>
          <TestOpener onClose={onClose} />
          <ModalRoot />
        </ModalProvider>
      </QueryClientProvider>,
    )

    const user = userEvent.setup()
    await user.click(screen.getByText('Open Decide'))

    expect(await screen.findByRole('heading', { name: 'Inception' })).toBeInTheDocument()
    const openBtn = screen.getByRole('button', { name: 'Open' })
    expect(openBtn).toBeInTheDocument()

    await user.click(openBtn)

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/media/$mediaType/$mediaId',
      params: { mediaType: 'movie', mediaId: '123' },
    })
    expect(onClose).toHaveBeenCalled()
  })
})
