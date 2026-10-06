import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ModalProvider, ModalRoot } from '@/lib/modals'
import { SettingsSaveProvider } from '../context/settings-save-context'
import { SettingsDesktopPage } from '../pages/settings-desktop-page'
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
  useCreateGameServer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteGameServer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePingGameServer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateGameServer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useClaimGameServer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useProbeGameServer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePendingGameServers: () => ({ data: [], isLoading: false }),
}))

const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ hash: '', pathname: '/settings/nodes' }),
  Link: ({ children, to, params, hash, ...props }: any) => {
    let href = String(to ?? '')
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        href = href.replace(`$${key}`, String(value))
      }
    }
    if (hash) href = `${href}#${hash}`
    return <a href={href} {...props}>{children}</a>
  },
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

vi.mock('@/features/downloads/use-server-usenet', () => ({
  useServerUsenetConfig: () => ({ data: null, isLoading: false }),
  useTestSabnzbd: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

describe('SettingsDesktopPage', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    delete (window as any).desktopAPI
    clearDesktopAPICache()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderPage = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <SettingsSaveProvider>
          <ModalProvider>
            <SettingsDesktopPage />
            <ModalRoot />
          </ModalProvider>
        </SettingsSaveProvider>
      </QueryClientProvider>,
    )
  }

  it('opens node settings from the list instead of showing a page-level picker', async () => {
    renderPage()

    expect(screen.getAllByText('Living Room PC').length).toBeGreaterThan(0)
    expect(screen.queryByText('Managing node')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open living room pc/i })).toHaveAttribute(
      'href',
      '/settings/nodes/1',
    )
    expect(screen.getAllByText('Open').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /Living Room PC settings/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Machine' })).not.toBeInTheDocument()
  })

  it('navigates to the node settings page', async () => {
    renderPage()

    expect(screen.getByRole('link', { name: /open living room pc/i })).toHaveAttribute(
      'href',
      '/settings/nodes/1',
    )
    expect(screen.queryByRole('tab', { name: 'Paths' })).not.toBeInTheDocument()
  })

  it('navigates to this computer as a node when the Otix app is present', async () => {
    ;(window as any).desktopAPI = {
      platform: 'darwin',
      getDesktopSettings: vi.fn().mockResolvedValue({}),
      setDesktopSettings: vi.fn().mockResolvedValue({}),
    }
    clearDesktopAPICache()

    renderPage()

    await waitFor(() => {
      expect(screen.getAllByText('This computer').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Otix app').length).toBeGreaterThan(0)
    })

    expect(screen.getByRole('link', { name: /open this computer/i })).toHaveAttribute(
      'href',
      '/settings/nodes/-1',
    )
  })
})
