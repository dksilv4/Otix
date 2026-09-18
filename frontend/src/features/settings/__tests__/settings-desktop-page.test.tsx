import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SettingsDesktopPage } from '../pages/settings-desktop-page'
import { apiClient } from '@/lib/api/client'

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
      { id: 1, name: 'Living Room PC', primaryUrl: 'http://192.168.1.100:8000' },
    ],
    isLoading: false,
  }),
}))

vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

describe('SettingsDesktopPage', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    delete (window as any).desktopAPI
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  function renderPage() {
    return render(
      <QueryClientProvider client={queryClient}>
        <SettingsDesktopPage />
      </QueryClientProvider>,
    )
  }

  it('renders web mode with connected server node badge and loads node settings', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        platform: 'windows',
        supported: true,
        launchOnStartup: true,
        minimizeToTray: false,
        closeToTray: true,
        alwaysOnTop: false,
        startMinimized: false,
      },
    } as any)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Living Room PC')).toBeInTheDocument()
      expect(screen.getByText('windows')).toBeInTheDocument()
    })

    expect(apiClient.get).toHaveBeenCalledWith('/library/servers/1/desktop')
  })

  it('toggles settings and sends POST to server node in web mode', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        platform: 'linux',
        supported: true,
        launchOnStartup: false,
        minimizeToTray: false,
        closeToTray: false,
        alwaysOnTop: false,
        startMinimized: false,
      },
    } as any)

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

    await waitFor(() => {
      expect(screen.getByText('Living Room PC')).toBeInTheDocument()
    })

    // Find switches - the first switch is Launch on startup
    const switches = screen.getAllByRole('switch')
    expect(switches.length).toBeGreaterThan(0)

    fireEvent.click(switches[0])

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/library/servers/1/desktop', {
        launchOnStartup: true,
      })
    })
  })

  it('falls back to localStorage when server node is offline', async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('Network error'))

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Launch on startup')).toBeInTheDocument()
    })

    const switches = screen.getAllByRole('switch')
    fireEvent.click(switches[1]) // minimize to tray

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('otix:desktop-settings') || '{}')
      expect(stored.minimizeToTray).toBe(true)
    })
  })

  it('uses native desktopAPI in desktop mode and hides server node banner', async () => {
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
      getDesktopSettings: mockGet,
      setDesktopSettings: mockSet,
    }

    renderPage()

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalled()
      expect(screen.queryByText('Living Room PC')).not.toBeInTheDocument()
    })

    const switches = screen.getAllByRole('switch')
    fireEvent.click(switches[1]) // minimize to tray

    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith({ minimizeToTray: false })
    })
  })
})
