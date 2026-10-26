import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ModalProvider, ModalRoot } from '@/lib/modals'
import { SettingsNodesPage } from '../pages/settings-desktop-page'
import { SettingsSaveProvider } from '../context/settings-save-context'
import { clearDesktopAPICache } from '@/lib/desktop/api'

let mockAuthUser: any = { id: 1, email: 'test@example.com', isAdmin: true }

vi.mock('@/lib/providers/auth', () => ({
  useAuth: () => ({
    user: mockAuthUser,
    isAuthenticated: Boolean(mockAuthUser),
    isLoading: false,
  }),
}))

const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params, hash, ...props }: any) => {
    let href = String(to ?? '')
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        href = href.replace(`$${key}`, String(value))
      }
    }
    if (hash) href = `${href}#${hash}`
    return (
      <a href={href} {...props}>
        {children}
      </a>
    )
  },
  useLocation: () => ({ href: '/settings/nodes' }),
  useNavigate: () => mockNavigate,
}))

vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

const mockClaimMutateAsync = vi.fn().mockResolvedValue({ id: 5, name: 'Home Server', isOnline: true })
const mockProbeMutateAsync = vi
  .fn()
  .mockResolvedValue({ remote_accessible: true, latency_ms: 25, tested_url: 'http://1.2.3.4:8090' })
let mockGameServers: any[] = [
  { id: 1, name: 'Home Server', primaryUrl: 'http://192.168.1.100:8090', isOnline: true },
]
let mockPendingNodes: any[] = []

const mockUpdateGameServer = vi.fn().mockResolvedValue({ id: 1, name: 'Renamed Home Server' })

vi.mock('@/features/downloads/use-server-downloads', () => ({
  useGameServers: () => ({ data: mockGameServers, isLoading: false }),
  useCreateGameServer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteGameServer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePingGameServer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateGameServer: () => ({ mutateAsync: mockUpdateGameServer, isPending: false }),
  useClaimGameServer: () => ({ mutateAsync: mockClaimMutateAsync, isPending: false }),
  useProbeGameServer: () => ({ mutateAsync: mockProbeMutateAsync, isPending: false }),
  usePendingGameServers: () => ({ data: mockPendingNodes, isLoading: false }),
  useUnclaimLocalNode: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUnclaimGameServer: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

describe('SettingsNodesPage', () => {
  beforeEach(() => {
    clearDesktopAPICache()
    vi.clearAllMocks()
    localStorage.clear()
    mockPendingNodes = []
    mockAuthUser = { id: 1, email: 'test@example.com', isAdmin: true }
    mockGameServers = [
      { id: 1, name: 'Home Server', primaryUrl: 'http://192.168.1.100:8090', isOnline: true },
    ]
  })

  const renderPage = () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
      <QueryClientProvider client={queryClient}>
        <SettingsSaveProvider>
          <ModalProvider>
            <SettingsNodesPage />
            <ModalRoot />
          </ModalProvider>
        </SettingsSaveProvider>
      </QueryClientProvider>,
    )
  }

  it('allows non-admin authenticated users to view nodes and locks for unauthenticated users', () => {
    mockAuthUser = { id: 2, email: 'user@example.com', isAdmin: false }
    const { unmount } = renderPage()
    expect(screen.getByRole('heading', { name: 'Nodes' })).toBeInTheDocument()
    unmount()

    mockAuthUser = null
    renderPage()
    expect(screen.getByText('Sign in required')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Nodes' })).not.toBeInTheDocument()
  })

  it('renders page header without beta or under development tags', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Nodes' })).toBeInTheDocument()
    expect(screen.queryByText('Beta')).not.toBeInTheDocument()
    expect(screen.queryByText('Under development')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Home Server' })).toBeInTheDocument()
  })

  it('navigates to library organize tab via Open button in action dock', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('heading', { name: 'Home Server' }))
    const openButtons = screen.getAllByRole('button', { name: /^open$/i })
    await user.click(openButtons[0])
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/settings/nodes', hash: 'organize' })
  })

  it('renders claim with PIN tab when opening Connect node modal from Add Node', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /add node/i }))
    await user.click(screen.getByText('Otix Worker Node'))

    expect(screen.getByRole('heading', { name: 'Connect Otix Node' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /claim with pin/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /manual url & token/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('OTX-XXXX')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /claim & link node/i })).toBeInTheDocument()
  })

  it('renders detected unclaimed node banner and claims on click', async () => {
    mockPendingNodes = [
      {
        serverName: 'Unraid Tower',
        localUrl: 'http://192.168.1.150:8090',
        claimCode: 'OTX-9999',
        claimed: false,
      },
    ]

    const user = userEvent.setup()
    renderPage()

    expect(screen.getByText(/unclaimed otix node detected/i)).toBeInTheDocument()
    expect(screen.getByText(/PIN: OTX-9999/i)).toBeInTheDocument()

    const [claimBtn] = screen.getAllByRole('button', { name: /claim node/i })
    await user.click(claimBtn)

    expect(mockClaimMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        claim_code: 'OTX-9999',
        node_url: 'http://192.168.1.150:8090',
        server_name: 'Unraid Tower',
      }),
    )
  })

  it('opens Server Machine modal when selecting Machine from Add Node', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /add node/i }))
    await user.click(screen.getByText('Machine'))
    expect(screen.getByRole('heading', { name: 'Add Server Machine' })).toBeInTheDocument()
  })

  it('opens Home Environment modal when selecting Home from Add Node', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /add node/i }))
    await user.click(screen.getByText('Home Environment'))
    expect(screen.getByText('New Home Location')).toBeInTheDocument()
  })

  it('opens Samba Share modal when selecting Samba Share from Add Node', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /add node/i }))
    await user.click(screen.getByText('Samba Share (SMB)'))
    expect(screen.getByText('Add Samba Share')).toBeInTheDocument()
  })

  it('allows renaming a node directly via action dock', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('heading', { name: 'Home Server' }))
    const renameButtons = screen.getAllByRole('button', { name: /rename home server/i })
    await user.click(renameButtons[0])

    expect(screen.getByRole('heading', { name: 'Rename Node' })).toBeInTheDocument()
    const input = screen.getByLabelText(/node name/i)
    expect(input).toHaveValue('Home Server')

    await user.clear(input)
    await user.type(input, 'Home Server Pro')

    await user.click(screen.getByRole('button', { name: /save name/i }))

    expect(mockUpdateGameServer).toHaveBeenCalledWith({
      id: 1,
      name: 'Home Server Pro',
    })
  })

  it('unselects the node when clicking on the canvas', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(screen.queryByRole('toolbar', { name: 'Node actions' })).not.toBeInTheDocument()

    // Select the node
    await user.click(screen.getByRole('heading', { name: 'Home Server' }))
    expect(screen.getByRole('toolbar', { name: 'Node actions' })).toBeInTheDocument()

    // Click canvas background
    const canvas = screen.getByRole('region', { name: 'Nodes Topology Map' })
    await user.click(canvas)

    // Node is unselected
    expect(screen.queryByRole('toolbar', { name: 'Node actions' })).not.toBeInTheDocument()
  })

  it('renders Add Node button in toolbar and opens compatible options', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('heading', { name: 'Home Server' }))
    const addNodeBtn = screen.getByRole('button', { name: /add node to home server/i })
    expect(addNodeBtn).toBeInTheDocument()

    await user.click(addNodeBtn)
    expect(screen.getByRole('heading', { name: /connect home server/i })).toBeInTheDocument()
    expect(screen.getByText(/add & connect new node/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add machine/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add samba share/i })).toBeInTheDocument()
  })

  it('automatically centers the nodes in the canvas viewport on mount', () => {
    const { container } = renderPage()
    const nodesLayer = container.querySelector('div[style*="translate3d"]') as HTMLElement
    expect(nodesLayer).toBeInTheDocument()
    expect(nodesLayer.style.transform).toMatch(/translate3d\((-?\d+(\.\d+)?)px,\s*(-?\d+(\.\d+)?)px/)
    const match = nodesLayer.style.transform.match(/translate3d\((-?\d+(\.\d+)?)px,\s*(-?\d+(\.\d+)?)px/)
    const x = Number(match?.[1])
    const y = Number(match?.[3])
    expect(x).toBeGreaterThan(0)
    expect(y).toBeGreaterThan(0)
  })
})
