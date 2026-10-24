import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ModalProvider, ModalRoot } from '@/lib/modals'
import { SettingsSaveProvider } from '../context/settings-save-context'
import { SettingsOrganizePage } from '../pages/settings-organize-page'
import { apiClient } from '@/lib/api/client'
import { clearDesktopAPICache } from '@/lib/desktop/api'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: any) => <a href={String(to ?? '')} {...props}>{children}</a>,
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/settings/organize' }),
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
      namingTemplate: '{Title} ({Year}) [{Platform}]/{OriginalName}.{ext}',
      autoOrganizeEnabled: true,
      postProcessEnabled: true,
      preferredRepackers: 'FitGirl, DODI',
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

describe('SettingsOrganizePage', () => {
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
        namingTemplate: '{Title} ({Year}) [{Platform}]/{OriginalName}.{ext}',
        isoDownloadPath: 'D:\\Games\\ISOs',
        autoOrganizeEnabled: true,
        postProcessEnabled: true,
        preferredRepackers: 'FitGirl, DODI',
      },
    } as unknown as ReturnType<typeof apiClient.get>)
  })

  const renderPage = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <SettingsSaveProvider>
          <ModalProvider>
            <SettingsOrganizePage />
            <ModalRoot />
          </ModalProvider>
        </SettingsSaveProvider>
      </QueryClientProvider>,
    )
  }

  it('renders node tabs and organize section without outer header container', async () => {
    renderPage()

    // Outer page header and subtitle are removed
    expect(screen.queryByRole('heading', { level: 1, name: 'Organize' })).not.toBeInTheDocument()
    expect(
      screen.queryByText(/Configure folder structures, naming rules, and automated sorting/i),
    ).not.toBeInTheDocument()

    // Node tabs
    expect(screen.getByRole('tab', { name: /Default Node Profile/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Home Server/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Living Room PC/i })).toBeInTheDocument()

    // Target directory selector
    expect(screen.getByText('Target Directory')).toBeInTheDocument()
    expect(screen.getByText('All Directories (Default)')).toBeInTheDocument()

    // Simplified organize section presets and preview
    expect(screen.getByText('Folder Structure Presets')).toBeInTheDocument()
    expect(screen.getByText('Live Sample Previews')).toBeInTheDocument()
    expect(screen.getByText('Auto-organize')).toBeInTheDocument()
  })
})
