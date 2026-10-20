import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SettingsProfilePage } from '../pages/settings-profile-page'
import { SettingsLauncherPage } from '../pages/settings-launcher-page'
import { apiClient } from '@/lib/api/client'

const mockUser = {
  id: '1',
  username: 'gamer',
  email: 'gamer@example.com',
  saveGameSessions: true,
  gameSessionsPrivate: true,
}

const mockRefreshUser = vi.fn()

vi.mock('@/lib/providers/auth', () => ({
  useAuth: () => ({
    user: mockUser,
    isAuthenticated: true,
    refreshUser: mockRefreshUser,
  }),
}))

vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}))

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))

vi.mock('../hooks/use-settings-hash-scroll', () => ({
  useSettingsHashScroll: vi.fn(),
}))

vi.mock('../components/molecules/launcher-theme-preview', () => ({
  LauncherThemePreview: () => <div data-testid="launcher-theme-preview" />,
}))

vi.mock('../components/molecules/settings-emulators-card', () => ({
  SettingsEmulatorsCard: () => <div data-testid="emulators-card" />,
}))

const renderWithClient = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('Game Sessions & Privacy Settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders game session settings in profile page and calls patch on toggle', async () => {
    renderWithClient(<SettingsProfilePage />)

    expect(screen.getByText('Save Gameplay Sessions')).toBeInTheDocument()
    expect(screen.getByText('Default Session Privacy')).toBeInTheDocument()

    // Find switches
    const switches = screen.getAllByRole('switch')
    expect(switches.length).toBeGreaterThanOrEqual(2)

    // The second switch is save game sessions, third is session privacy
    const saveSessionsSwitch = switches[1]
    fireEvent.click(saveSessionsSwitch)

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith('/auth/me', {
        saveGameSessions: false,
      })
    })

    const privacySwitch = switches[2]
    fireEvent.click(privacySwitch)

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith('/auth/me', {
        gameSessionsPrivate: false,
      })
    })
  })

  it('renders game session settings in launcher page and calls patch on toggle', async () => {
    renderWithClient(<SettingsLauncherPage />)

    expect(screen.getByText('Record Game Sessions')).toBeInTheDocument()
    expect(screen.getByText('Default Session Privacy')).toBeInTheDocument()

    const switches = screen.getAllByRole('switch')
    const saveSwitch = switches.find((s) => s.closest('div')?.textContent?.includes('Record Game Sessions')) || switches[1]
    fireEvent.click(saveSwitch)

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith('/auth/me', {
        saveGameSessions: false,
      })
    })
  })
})
