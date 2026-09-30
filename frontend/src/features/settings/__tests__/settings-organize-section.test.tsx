import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ModalProvider, ModalRoot } from '@/lib/modals'
import { SettingsSaveProvider } from '../context/settings-save-context'
import { SettingsOrganizeSection } from '../components/organisms/settings-organize-section'
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
      { id: 1, name: 'Home Server', primaryUrl: 'http://192.168.1.50:8090', isOnline: true },
    ],
    isLoading: false,
  }),
}))

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

describe('SettingsOrganizeSection', () => {
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

  function renderSection(nodeId = 1) {
    return render(
      <QueryClientProvider client={queryClient}>
        <SettingsSaveProvider>
          <ModalProvider>
            <SettingsOrganizeSection nodeId={nodeId} />
            <ModalRoot />
          </ModalProvider>
        </SettingsSaveProvider>
      </QueryClientProvider>,
    )
  }

  it('renders the Folder Structure & ISO Library card with presets and color-coded token chips', async () => {
    renderSection()

    expect(
      screen.getByRole('heading', { name: 'Folder Structure & ISO Library' }),
    ).toBeInTheDocument()
    expect(screen.getByText('ISO File Directory')).toBeInTheDocument()
    expect(screen.getByText('Standard (arr-style)')).toBeInTheDocument()
    expect(screen.getByText('Clean Game Folder')).toBeInTheDocument()
    expect(screen.getByText('Scene Release Format')).toBeInTheDocument()

    // Color-coded token chips
    expect(screen.getByRole('button', { name: '{Title}' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '{Year}' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '{Platform}' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '{ReleaseGroup}' })).toBeInTheDocument()

    // Live preview
    expect(screen.getByText('Live Sample Previews')).toBeInTheDocument()
  })

  it('updates the template and live preview when clicking a preset card', async () => {
    const user = userEvent.setup()
    renderSection()

    await user.click(screen.getByText('Clean Game Folder'))

    const input = screen.getByPlaceholderText('{Title} ({Year})/{Title}.{ext}')
    expect(input).toHaveValue('{Title} ({Year})/{Title}.{ext}')
  })

  it('inserts clicked token chip into the template input', async () => {
    const user = userEvent.setup()
    renderSection()

    const tokenChip = screen.getByRole('button', { name: '{Edition}' })
    await user.click(tokenChip)

    const input = screen.getByPlaceholderText('{Title} ({Year})/{Title}.{ext}')
    expect(input.getAttribute('value')).toContain('{Edition}')
  })

  it('opens Organize Test Run modal and displays current vs target paths and folders to create', async () => {
    const user = userEvent.setup()
    vi.mocked(apiClient.post).mockResolvedValue({
      data: [
        {
          sourcePath: 'D:\\Downloads\\Elden.Ring.Shadow.of.the.Erdtree.REPACK-RUNE.iso',
          sourceFilename: 'Elden.Ring.Shadow.of.the.Erdtree.REPACK-RUNE.iso',
          type: 'iso',
          matched: true,
          extracted: {
            Title: 'Elden Ring Shadow of the Erdtree',
            Year: '2022',
            ReleaseGroup: 'RUNE',
          },
          targetPath: 'D:\\Games\\ISOs\\Elden Ring (2022) [PC]\\Elden.Ring.Shadow.of.the.Erdtree.REPACK-RUNE.iso',
          foldersToCreate: ['Elden Ring (2022) [PC]'],
          status: 'rename_and_move',
        },
      ],
    } as unknown as ReturnType<typeof apiClient.post>)

    renderSection()

    const testRunButton = screen.getByRole('button', { name: /test run/i })
    await user.click(testRunButton)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Organize Test Run' })).toBeInTheDocument()
      expect(screen.getByText(/read-only dry run/i)).toBeInTheDocument()
      expect(screen.getByText('+ Elden Ring (2022) [PC]')).toBeInTheDocument()
      expect(screen.getByText(/Organizes into/i)).toBeInTheDocument()
    })
  })

  it('allows toggling between real files and sample scene releases in test run modal', async () => {
    const user = userEvent.setup()
    renderSection()

    const testRunButton = screen.getByRole('button', { name: /test run/i })
    await user.click(testRunButton)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Organize Test Run' })).toBeInTheDocument()
    })

    const sampleToggleButton = screen.getByRole('button', { name: /sample/i })
    expect(sampleToggleButton).toBeInTheDocument()

    // Cyberpunk 2077 sample is present in sample releases
    expect(screen.getByText(/Cyberpunk 2077/i)).toBeInTheDocument()
  })
})
