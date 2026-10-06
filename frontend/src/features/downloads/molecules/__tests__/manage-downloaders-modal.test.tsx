import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ModalProvider, ModalRoot } from '@/lib/modals'
import { ManageDownloadersModal } from '../manage-downloaders-modal'
import { SettingsSaveProvider } from '@/features/settings/context/settings-save-context'

const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

let mockGameServers: Array<{ id: number; name: string; isOnline: boolean }> = []
vi.mock('../../use-server-downloads', () => ({
  useGameServers: () => ({ data: mockGameServers, isLoading: false }),
}))

let mockUsenetConfig: any = null
const mockTestSabnzbd = vi.fn()

vi.mock('../../use-server-usenet', () => ({
  useServerUsenetConfig: () => ({ data: mockUsenetConfig, isLoading: false }),
  useTestSabnzbd: () => ({ mutateAsync: mockTestSabnzbd, isPending: false }),
}))

const renderModal = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsSaveProvider>
        <ModalProvider>
          <ManageDownloadersModal onClose={vi.fn()} />
          <ModalRoot />
        </ModalProvider>
      </SettingsSaveProvider>
    </QueryClientProvider>,
  )
}

describe('ManageDownloadersModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGameServers = [
      { id: 1, name: 'Homelab Alpha', isOnline: true },
    ]
    mockUsenetConfig = {
      sabnzbd: {
        host: '10.0.0.50',
        port: 8080,
        category: 'games',
        configured: true,
      },
    }
  })

  it('renders a SABnzbd instance per Otix node without a target picker', () => {
    renderModal()

    expect(screen.getByRole('heading', { name: 'Manage Downloaders' })).toBeInTheDocument()
    expect(screen.getAllByText('SABnzbd Downloader').length).toBeGreaterThan(0)
    expect(screen.getByText('Homelab Alpha')).toBeInTheDocument()
    expect(screen.getAllByText(/On Homelab Alpha \(10\.0\.0\.50:8080\)/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Target Otix node/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Prowlarr')).not.toBeInTheDocument()
    expect(screen.queryByText('Radarr')).not.toBeInTheDocument()
    expect(screen.queryByText('Sonarr')).not.toBeInTheDocument()
  })

  it('handles testing connection with success feedback', async () => {
    mockTestSabnzbd.mockResolvedValueOnce({ ok: true, message: 'SABnzbd 4.2.1 operational.' })
    const user = userEvent.setup()
    renderModal()

    const testBtn = screen.getAllByRole('button', { name: /test connection/i })[0]
    await user.click(testBtn)

    await waitFor(() => {
      expect(mockTestSabnzbd).toHaveBeenCalled()
      expect(screen.getByText('SABnzbd 4.2.1 operational.')).toBeInTheDocument()
    })
  })

  it('navigates to connections page and closes modal when requested', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <SettingsSaveProvider>
          <ModalProvider>
            <ManageDownloadersModal onClose={onClose} />
            <ModalRoot />
          </ModalProvider>
        </SettingsSaveProvider>
      </QueryClientProvider>,
    )

    await user.click(screen.getByRole('button', { name: /go to connections/i }))
    expect(onClose).toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/settings/connections' })
  })
})
