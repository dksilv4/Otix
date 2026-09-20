import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ModalProvider, ModalRoot } from '@/lib/modals'
import { SettingsSaveProvider } from '@/features/settings/context/settings-save-context'
import { ImportNodeInstancesButton } from '../import-node-instances-modal'
import { apiClient } from '@/lib/api/client'

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

let mockGameServers: Array<{ id: number; name: string; isOnline: boolean }> = []
vi.mock('../../use-server-downloads', () => ({
  useGameServers: () => ({
    data: mockGameServers,
    isLoading: false,
  }),
}))

function renderButton(destId = 1) {
  const dest = mockGameServers.find((server) => server.id === destId)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsSaveProvider>
        <ModalProvider>
          <ImportNodeInstancesButton dest={dest as any} />
          <ModalRoot />
        </ModalProvider>
      </SettingsSaveProvider>
    </QueryClientProvider>,
  )
}

describe('ImportNodeInstancesButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockGameServers = [
      { id: 1, name: 'Living Room PC', isOnline: true },
      { id: 2, name: 'Office NAS', isOnline: true },
      { id: -2, name: 'Otix backend', isOnline: true },
    ]
  })

  it('lets any node import from any other node', async () => {
    const user = userEvent.setup()
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: { ok: true, imported: ['usenet', 'radarr'], skipped: ['sonarr'], errors: [] },
    } as any)

    renderButton()
    await user.click(screen.getByRole('button', { name: /import from another node/i }))

    expect(screen.getByRole('heading', { name: 'Import instances' })).toBeInTheDocument()
    const from = screen.getByLabelText('From') as HTMLSelectElement
    const to = screen.getByLabelText('To') as HTMLSelectElement
    expect(from.value).toBe('2')
    expect(to.value).toBe('1')

    await user.selectOptions(to, '-2')
    await user.click(screen.getByRole('button', { name: /import onto otix backend/i }))

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/library/servers/-2/instances/import', {
        fromServerId: 2,
      })
    })
    const posted = vi.mocked(apiClient.post).mock.calls[0][1] as Record<string, unknown>
    expect(JSON.stringify(posted)).not.toMatch(/api[_-]?key/i)
  })

  it('disables import when from and to are the same node', async () => {
    const user = userEvent.setup()
    renderButton()
    await user.click(screen.getByRole('button', { name: /import from another node/i }))

    const from = screen.getByLabelText('From')
    const to = screen.getByLabelText('To')
    await user.selectOptions(from, '1')
    await user.selectOptions(to, '1')

    expect(screen.getByText('Pick two different nodes.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^import$/i })).toBeDisabled()
    expect(apiClient.post).not.toHaveBeenCalled()
  })

  it('hides the button until two Otix nodes are available', () => {
    mockGameServers = []
    renderButton()
    expect(screen.queryByRole('button', { name: /import from another node/i })).not.toBeInTheDocument()
  })
})
