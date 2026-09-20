import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModalProvider, ModalRoot } from '@/lib/modals'
import { ManageDownloadersModal } from '../manage-downloaders-modal'

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

  it('renders SABnzbd as the only downloader and shows connected badge', () => {
    render(
      <ModalProvider>
        <ManageDownloadersModal onClose={vi.fn()} />
        <ModalRoot />
      </ModalProvider>,
    )

    expect(screen.getByRole('heading', { name: 'Manage Downloaders' })).toBeInTheDocument()
    expect(screen.getByText('SABnzbd Downloader')).toBeInTheDocument()
    expect(screen.getByText('Connected')).toBeInTheDocument()
    expect(screen.getByText(/Linked on Homelab Alpha \(10\.0\.0\.50:8080\)/)).toBeInTheDocument()

    // Does not include indexers or arr media tools
    expect(screen.queryByText('Prowlarr')).not.toBeInTheDocument()
    expect(screen.queryByText('Radarr')).not.toBeInTheDocument()
    expect(screen.queryByText('Sonarr')).not.toBeInTheDocument()
  })

  it('handles testing connection with success feedback', async () => {
    mockTestSabnzbd.mockResolvedValueOnce({ ok: true, message: 'SABnzbd 4.2.1 operational.' })
    const user = userEvent.setup()

    render(
      <ModalProvider>
        <ManageDownloadersModal onClose={vi.fn()} />
        <ModalRoot />
      </ModalProvider>,
    )

    const testBtn = screen.getByRole('button', { name: /test connection/i })
    await user.click(testBtn)

    await waitFor(() => {
      expect(mockTestSabnzbd).toHaveBeenCalled()
      expect(screen.getByText('SABnzbd 4.2.1 operational.')).toBeInTheDocument()
    })
  })

  it('navigates to connections page and closes modal when requested', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()

    render(
      <ModalProvider>
        <ManageDownloadersModal onClose={onClose} />
        <ModalRoot />
      </ModalProvider>,
    )

    const connectionsBtn = screen.getByRole('button', { name: /connections page/i })
    await user.click(connectionsBtn)

    expect(onClose).toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/settings/connections' })
  })
})
