import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SettingsMachinePage } from '../pages/settings-machine-page'
import { SettingsSoftwarePage } from '../pages/settings-software-page'
import { SettingsOverlayPage } from '../pages/settings-overlay-page'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: any) => <a href={String(to ?? '')} {...props}>{children}</a>,
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/settings/nodes' }),
}))

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({
      data: {
        platform: 'windows',
        supported: true,
        launch_on_startup: true,
        auto_backup_on_exit: true,
        game_tracking: true,
        overlay_enabled: true,
      },
    }),
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
}))

vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

const mockAuth = {
  isAuthenticated: true,
  user: { id: 1, email: 'test@otix.app' },
  isLoading: false,
}

vi.mock('@/lib/providers/auth', () => ({
  useAuth: () => mockAuth,
}))

const mockNodeContext = {
  servers: [
    {
      id: 1,
      name: 'Main Rig',
      primaryUrl: 'http://192.168.1.10:8090',
      isOnline: true,
      isLocalDesktop: false,
    },
  ],
  selectedNode: {
    id: 1,
    name: 'Main Rig',
    primaryUrl: 'http://192.168.1.10:8090',
    isOnline: true,
    isLocalDesktop: false,
  },
  selectedNodeId: 1,
  setSelectedNodeId: vi.fn(),
  refreshServers: vi.fn(),
}

vi.mock('../context/settings-node-context', () => ({
  useSettingsNode: () => mockNodeContext,
}))

vi.mock('../hooks/use-node-sharing', () => ({
  useNodeShares: () => ({
    shares: [],
    loading: false,
    error: null,
    refreshShares: vi.fn(),
    createShare: vi.fn(),
    revokeShare: vi.fn(),
  }),
}))

describe('SettingsMachinePage, SettingsSoftwarePage, and SettingsOverlayPage', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.isAuthenticated = true
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {ui}
      </QueryClientProvider>,
    )
  }

  it('renders Machine & Hardware page with host telemetry header and active server badge', async () => {
    renderWithProviders(<SettingsMachinePage />)

    expect(screen.getByRole('heading', { level: 1, name: /Machine & Hardware/i })).toBeInTheDocument()
    expect(screen.getByText('Main Rig')).toBeInTheDocument()
    expect(screen.getByText(/Detected CPU, GPU, memory, disks/i)).toBeInTheDocument()
  })

  it('renders Services & Sharing page with daemon and save backup settings', async () => {
    renderWithProviders(<SettingsSoftwarePage />)

    expect(screen.getByRole('heading', { level: 1, name: /Services & Sharing/i })).toBeInTheDocument()
    expect(screen.getByText('Main Rig')).toBeInTheDocument()
    expect(await screen.findByText(/Node Daemon & Service Behavior/i)).toBeInTheDocument()
    expect(screen.getByText(/Launch on startup/i)).toBeInTheDocument()
    expect(screen.getByText(/Auto-backup game saves/i)).toBeInTheDocument()
    expect(screen.queryByText(/Scan library on startup/i)).not.toBeInTheDocument()
  })

  it('renders Overlay & HUD page with process tracking and overlay HUD settings', async () => {
    renderWithProviders(<SettingsOverlayPage />)

    expect(screen.getByRole('heading', { level: 1, name: /In-Game Overlay & HUD/i })).toBeInTheDocument()
    expect(screen.getByText('Main Rig')).toBeInTheDocument()
    expect(await screen.findByText(/Game Detection & Process Tracking/i)).toBeInTheDocument()
    expect(screen.getByText(/Game process auto-detection/i)).toBeInTheDocument()
    expect(screen.getByText(/In-game performance overlay/i)).toBeInTheDocument()
  })

  it('allows unauthenticated users to access Machine page without lock', () => {
    mockAuth.isAuthenticated = false
    renderWithProviders(<SettingsMachinePage />)

    expect(screen.queryByText(/Sign in required/i)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: /Machine & Hardware/i })).toBeInTheDocument()
  })

  it('allows unauthenticated users to access Software page without lock', () => {
    mockAuth.isAuthenticated = false
    renderWithProviders(<SettingsSoftwarePage />)

    expect(screen.queryByText(/Sign in required/i)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: /Services & Sharing/i })).toBeInTheDocument()
  })

  it('allows unauthenticated users to access Overlay page without lock', () => {
    mockAuth.isAuthenticated = false
    renderWithProviders(<SettingsOverlayPage />)

    expect(screen.queryByText(/Sign in required/i)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: /In-Game Overlay & HUD/i })).toBeInTheDocument()
  })
})
