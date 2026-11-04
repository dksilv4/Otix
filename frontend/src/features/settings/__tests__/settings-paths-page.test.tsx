import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ModalProvider, ModalRoot } from '@/lib/modals'
import { SettingsSaveProvider } from '../context/settings-save-context'
import { SettingsPathsPage } from '../pages/settings-paths-page'
import { apiClient } from '@/lib/api/client'
import { clearDesktopAPICache } from '@/lib/desktop/api'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: any) => <a href={String(to ?? '')} {...props}>{children}</a>,
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/settings/paths' }),
}))

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

vi.mock('@/lib/providers/auth', () => ({
  useAuth: () => ({ user: { id: 1 }, isAuthenticated: true, isLoading: false }),
}))

vi.mock('@/features/downloads/use-downloads', () => ({
  useDownloadConfig: () => ({
    config: {
      downloadPath: 'D:\\Downloads',
    },
    saveConfig: vi.fn(),
    isLoading: false,
  }),
}))

vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

const mockSetSelectedNodeId = vi.fn()
vi.mock('../context/settings-node-context', () => ({
  useSettingsNode: () => ({
    servers: [
      { id: 1, name: 'Home Server', primaryUrl: 'http://192.168.1.50:8090', isOnline: true },
      { id: 2, name: 'Living Room PC', primaryUrl: 'http://192.168.1.60:8090', isOnline: false },
    ],
    selectedNode: { id: 1, name: 'Home Server' },
    selectedNodeId: 1,
    setSelectedNodeId: mockSetSelectedNodeId,
    isLoading: false,
  }),
}))

describe('SettingsPathsPage', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    delete (window as unknown as { desktopAPI?: unknown }).desktopAPI
    clearDesktopAPICache()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        libraries: [{ name: 'Games', path: 'D:\\Games\\PC', kind: 'game' }],
      },
    } as unknown as ReturnType<typeof apiClient.get>)
  })

  const renderPage = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <SettingsSaveProvider>
          <ModalProvider>
            <SettingsPathsPage />
            <ModalRoot />
          </ModalProvider>
        </SettingsSaveProvider>
      </QueryClientProvider>,
    )
  }

  it('renders paths header without outer container', async () => {
    renderPage()

    expect(screen.getByRole('heading', { level: 1, name: 'Drive Locations' })).toBeInTheDocument()
    expect(
      screen.getByText(/Manage monitored folders and drive storage locations across your devices/i),
    ).toBeInTheDocument()

    // Node indicator badge
    expect(screen.getAllByText('Home Server').length).toBeGreaterThan(0)
  })

  it('renders cleanly without crashing when localStorage contains legacy string scan-paths', async () => {
    // Populate legacy string scan-paths in localStorage
    localStorage.setItem('otix:scan-paths', JSON.stringify(['C:\\LegacyGames', 'D:\\MoreGames']))
    localStorage.setItem('otix:games-install-dir', 'C:\\LegacyGames')
    localStorage.setItem('otix:games-download-dir', 'D:\\Downloads')

    expect(() => renderPage()).not.toThrow()
    expect(screen.getByRole('heading', { level: 1, name: 'Drive Locations' })).toBeInTheDocument()
  })
})
