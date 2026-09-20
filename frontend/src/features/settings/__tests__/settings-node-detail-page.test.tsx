import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ModalProvider, ModalRoot } from '@/lib/modals'
import { SettingsSaveProvider } from '../context/settings-save-context'
import { SettingsNodeDetailPage } from '../pages/settings-node-detail-page'
import { apiClient } from '@/lib/api/client'
import { clearDesktopAPICache } from '@/lib/desktop/api'

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

vi.mock('@/lib/desktop/platform', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/desktop/platform')>()
  return {
    ...actual,
    useDesktopPlatform: () => ({ isDesktop: false, platform: 'web' }),
    getDesktopPlatform: () => ({ platform: 'web', isDesktop: false, isElectron: false }),
  }
})

vi.mock('@/features/downloads/use-server-downloads', () => ({
  useGameServers: () => ({
    data: [
      { id: 1, name: 'Living Room PC', primaryUrl: 'http://192.168.1.100:8000', isOnline: true },
    ],
    isLoading: false,
  }),
}))

const mockNavigate = vi.fn()
let mockHash = ''
let mockNodeId = '1'
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ hash: mockHash, pathname: `/settings/nodes/${mockNodeId}` }),
  useParams: () => ({ nodeId: mockNodeId }),
  Link: ({ children }: any) => <a>{children}</a>,
}))

vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

vi.mock('@/lib/providers/auth', () => ({
  useAuth: () => ({ user: { id: 1 }, isAuthenticated: true, isLoading: false }),
}))

vi.mock('@/features/downloads/use-downloads', () => ({
  useDownloadConfig: () => ({
    config: { downloadPath: '' },
    saveConfig: vi.fn(),
    isLoading: false,
  }),
}))

vi.mock('@/components/path-picker', () => ({
  PathInput: () => <input aria-label="path" />,
}))

vi.mock('../components/organisms/settings-paths-section', () => ({
  SettingsPathsSection: ({ nodeId }: { nodeId?: number }) => <div>Paths for {nodeId}</div>,
}))

vi.mock('../components/organisms/settings-organize-section', () => ({
  SettingsOrganizeSection: ({ nodeId }: { nodeId?: number }) => <div>Organize for {nodeId}</div>,
}))

vi.mock('@/features/downloads/use-server-usenet', () => ({
  useServerUsenetConfig: () => ({ data: null, isLoading: false }),
  useTestSabnzbd: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

describe('SettingsNodeDetailPage', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockHash = ''
    mockNodeId = '1'
    delete (window as any).desktopAPI
    clearDesktopAPICache()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    vi.mocked(apiClient.get).mockResolvedValue({ data: {} } as any)
  })

  function renderPage() {
    return render(
      <QueryClientProvider client={queryClient}>
        <SettingsSaveProvider>
          <ModalProvider>
            <SettingsNodeDetailPage />
            <ModalRoot />
          </ModalProvider>
        </SettingsSaveProvider>
      </QueryClientProvider>,
    )
  }

  it('renders tabs for a worker node', () => {
    renderPage()

    expect(screen.getByRole('heading', { name: 'Living Room PC' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Paths' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Organize' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Downloaders' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Machine' })).toBeInTheDocument()
    expect(screen.getByText('Paths for 1')).toBeInTheDocument()
  })

  it('goes back to the nodes list', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /nodes/i }))
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/settings/nodes' })
  })

  it('loads machine settings on the node page', async () => {
    const user = userEvent.setup()
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (String(url).includes('/desktop')) {
        return {
          data: {
            platform: 'windows',
            supported: true,
            launchOnStartup: true,
            minimizeToTray: false,
            closeToTray: true,
            alwaysOnTop: false,
            startMinimized: false,
          },
        } as any
      }
      return { data: {} } as any
    })

    renderPage()
    await user.click(screen.getByRole('tab', { name: 'Machine' }))

    await waitFor(() => {
      expect(screen.getByText('Launch on startup')).toBeInTheDocument()
      expect(apiClient.get).toHaveBeenCalledWith('/library/servers/1/desktop')
    })
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/settings/nodes/$nodeId',
      params: { nodeId: '1' },
      hash: 'machine',
      replace: true,
    })
  })

  it('toggles settings and sends POST to the node', async () => {
    const user = userEvent.setup()
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (String(url).includes('/desktop')) {
        return {
          data: {
            platform: 'linux',
            supported: true,
            launchOnStartup: false,
            minimizeToTray: false,
            closeToTray: false,
            alwaysOnTop: false,
            startMinimized: false,
          },
        } as any
      }
      return { data: {} } as any
    })
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: {
        platform: 'linux',
        supported: true,
        launchOnStartup: true,
        minimizeToTray: false,
        closeToTray: false,
        alwaysOnTop: false,
        startMinimized: false,
      },
    } as any)

    renderPage()
    await user.click(screen.getByRole('tab', { name: 'Machine' }))

    await waitFor(() => {
      expect(screen.getByText('Launch on startup')).toBeInTheDocument()
    })

    const switches = screen.getAllByRole('switch')
    await user.click(switches[0])

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/library/servers/1/desktop', {
        launchOnStartup: true,
      })
    })
  })

  it('uses native desktopAPI for this computer', async () => {
    const user = userEvent.setup()
    mockNodeId = '-1'
    const mockGet = vi.fn().mockResolvedValue({
      launchOnStartup: true,
      minimizeToTray: true,
      closeToTray: false,
      alwaysOnTop: false,
      startMinimized: false,
    })
    const mockSet = vi.fn().mockResolvedValue({
      launchOnStartup: true,
      minimizeToTray: false,
      closeToTray: false,
      alwaysOnTop: false,
      startMinimized: false,
    })

    ;(window as any).desktopAPI = {
      platform: 'darwin',
      getDesktopSettings: mockGet,
      setDesktopSettings: mockSet,
    }
    clearDesktopAPICache()

    renderPage()

    expect(screen.getByRole('heading', { name: 'This computer' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Machine' }))

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalled()
      expect(screen.getByText('Launch on startup')).toBeInTheDocument()
    })

    const switches = screen.getAllByRole('switch')
    await user.click(switches[0])

    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith({ launchOnStartup: false })
    })
  })

  it('shows a not-found state for unknown nodes', () => {
    mockNodeId = '99'
    renderPage()

    expect(screen.getByRole('heading', { name: 'Node not found' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /back to nodes/i })).toBeInTheDocument()
  })
})
