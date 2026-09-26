import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ModalProvider, ModalRoot, useModal } from '@/lib/modals'
import { DecideWatchModal } from '../decide-watch-modal'

const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('@auth/hooks/use-auth', () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false }),
}))

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({ data: [] }),
  },
}))

function TestOpener({ onClose }: { onClose: () => void }) {
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
}

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
})
