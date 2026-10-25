import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

// Mock framer-motion to render children synchronously in jsdom
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
  motion: {
    div: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) =>
      React.createElement('div', props, children),
  },
}))

import { DkToastProvider } from '@ui/molecules/toast'
import { SettingsPathsSection } from '../components/organisms/settings-paths-section'
import { clearDesktopAPICache } from '@/lib/desktop/api'

// Mock auth
vi.mock('@/lib/providers/auth', () => ({
  useAuth: () => ({
    user: { id: 1, email: 'test@example.com' },
    isAuthenticated: true,
    isLoading: false,
  }),
}))

vi.mock('@/features/downloads/use-server-downloads', () => ({
  useGameServers: () => ({ data: [], isLoading: false }),
}))

// Mock downloads
vi.mock('@/features/downloads/use-downloads', () => ({
  useDownloadConfig: () => ({
    config: {
      id: 'default',
      userId: '1',
      downloadPath: '/server/isos',
    },
    saveConfig: vi.fn().mockResolvedValue({}),
    isLoading: false,
  }),
}))

describe('SettingsPathsSection with Real Toast Provider', () => {
  beforeEach(() => {
    clearDesktopAPICache()
    vi.clearAllMocks()
    localStorage.clear()
    ;(window as any).desktopAPI = {
      getScanPaths: vi.fn().mockResolvedValue([
        { path: '/games/steam', type: 'game' },
      ]),
      saveScanPaths: vi.fn().mockResolvedValue(undefined),
      scanPaths: vi.fn().mockResolvedValue([]),
      getDesktopSettings: vi.fn().mockResolvedValue({ gamesDownloadPath: '/downloads/games' }),
      setDesktopSettings: vi.fn().mockResolvedValue({ gamesDownloadPath: '/downloads/games' }),
      selectDirectory: vi.fn().mockResolvedValue('/picked/folder'),
    }
  })

  it('renders real toasts and never crashes the page when adding, selecting, or removing paths', async () => {
    const user = userEvent.setup()

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <DkToastProvider>
          <SettingsPathsSection />
        </DkToastProvider>
      </QueryClientProvider>,
    )

    // Wait for initial render
    await waitFor(() => {
      expect(screen.getByText('/games/steam')).toBeInTheDocument()
    })

    // 1. Test adding a path -> real toast appears and page does NOT go black
    await user.click(screen.getByRole('button', { name: /add folder/i }))
    const addInput = screen.getByPlaceholderText(/e\.g\. D:\\Games\\Steam or ~\/Games|e\.g\. \/media\/games/)
    await user.type(addInput, '/new/games{Enter}')

    await waitFor(() => {
      expect(screen.getByText('Scan Path Added')).toBeInTheDocument()
      expect(screen.getByText('Added /new/games to monitored scan paths.')).toBeInTheDocument()
    })

    // 2. Test assigning installation role -> real toast appears
    const rolesBtn = screen.getAllByRole('button', { name: /manage roles for/i })[0]
    await user.click(rolesBtn)
    const installButtons = screen.getAllByRole('button', { name: /toggle installation for/i })
    await user.click(installButtons[0])

    await waitFor(() => {
      expect(screen.getByText('Installation Directory Updated')).toBeInTheDocument()
    })

    // 3. Test assigning download role -> real toast appears
    const downloadButtons = screen.getAllByRole('button', { name: /assign download for/i })
    await user.click(downloadButtons[0])

    await waitFor(() => {
      expect(screen.getByText('Games Directory Updated')).toBeInTheDocument()
    })

    // 4. Test deleting a path -> real toast appears and page does NOT go black
    const removeButtons = screen.getAllByRole('button', { name: /remove/i })
    await user.click(removeButtons[0])

    await waitFor(() => {
      expect(screen.getByText('Path Removed')).toBeInTheDocument()
    })

    // The section heading is still in the document (page has NOT crashed or turned black)
    expect(screen.getByRole('heading', { name: 'Paths' })).toBeInTheDocument()
  })
})
