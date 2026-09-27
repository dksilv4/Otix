import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsNodeEpicSection } from '../settings-node-epic-section'
import { apiClient } from '@/lib/api/client'
import { ModalProvider } from '@/lib/modals'
import type { GameServer } from '@/features/downloads/types'

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
}))

vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

describe('SettingsNodeEpicSection', () => {
  const onlineWorkerServer: GameServer = {
    id: 10,
    name: 'Otix Worker Node',
    primaryUrl: 'http://192.168.1.50:8000',
    isOnline: true,
    isLocal: false,
    machineId: 'worker-node-1',
  }

  const offlineWorkerServer: GameServer = {
    ...onlineWorkerServer,
    isOnline: false,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders offline warning when worker node is offline', async () => {
    render(
      <ModalProvider>
        <SettingsNodeEpicSection server={offlineWorkerServer} />
      </ModalProvider>
    )

    expect(screen.getByText('Node is Offline')).toBeInTheDocument()
    expect(
      screen.getByText(/is currently offline/i)
    ).toBeInTheDocument()
  })

  it('fetches status and renders connected Epic account details and actions', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        connected: true,
        displayName: 'GamerEpic99',
        accountId: 'epic-acc-12345',
      },
    })

    render(
      <ModalProvider>
        <SettingsNodeEpicSection server={onlineWorkerServer} />
      </ModalProvider>
    )

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/integrations/epic/status', {
        params: { node_id: 10 },
      })
      expect(screen.getByText(/Linked as GamerEpic99 \(epic-acc-12345\)/i)).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /scan library/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /resolve with steamgrid/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /disconnect/i })).toBeInTheDocument()
  })

  it('handles library scan on connected node', async () => {
    const user = userEvent.setup()
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        connected: true,
        displayName: 'GamerEpic99',
        accountId: 'epic-acc-12345',
      },
    })
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: {
        totalInEpic: 15,
        matchedInOtix: 12,
        failed: 3,
      },
    })

    render(
      <ModalProvider>
        <SettingsNodeEpicSection server={onlineWorkerServer} />
      </ModalProvider>
    )

    await waitFor(() => {
      expect(screen.getByText(/Linked as GamerEpic99/i)).toBeInTheDocument()
    })

    const scanBtn = screen.getByRole('button', { name: /scan library/i })
    await user.click(scanBtn)

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/integrations/epic/scan', {
        node_id: 10,
      })
      expect(
        screen.getByText('Found 12 matches out of 15 Epic games. 3 could not be matched.')
      ).toBeInTheDocument()
    })
  })

  it('handles disconnect on connected node', async () => {
    const user = userEvent.setup()
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        connected: true,
        displayName: 'GamerEpic99',
        accountId: 'epic-acc-12345',
      },
    })
    vi.mocked(apiClient.delete).mockResolvedValueOnce({
      data: { success: true },
    })

    render(
      <ModalProvider>
        <SettingsNodeEpicSection server={onlineWorkerServer} />
      </ModalProvider>
    )

    await waitFor(() => {
      expect(screen.getByText(/Linked as GamerEpic99/i)).toBeInTheDocument()
    })

    const disconnectBtn = screen.getByRole('button', { name: /disconnect/i })
    await user.click(disconnectBtn)

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith('/auth/oauth/epic/disconnect', {
        data: { node_id: 10 },
      })
      expect(screen.getByText('Epic Games account unlinked.')).toBeInTheDocument()
    })
  })
})
