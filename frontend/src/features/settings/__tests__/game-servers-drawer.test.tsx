import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DkToastProvider } from '@ui/molecules/toast'
import { GameServersDrawer } from '../components/organisms/game-servers-drawer'
import type { DedicatedGameServer } from '@/features/gameservers'

const mockServers: DedicatedGameServer[] = [
  {
    id: 1,
    name: 'Palworld Guild World',
    gameTitle: 'Palworld',
    serverType: 'steam_source',
    host: '192.168.1.100',
    port: 8211,
    queryPort: 27015,
    isPublicLink: true,
    status: 'online',
    currentPlayers: 4,
    maxPlayers: 32,
    playerList: ['PlayerOne', 'PlayerTwo'],
    connectionAddress: '192.168.1.100:8211',
    ownerUsername: 'testuser',
    isOwner: true,
    userPermission: 'admin',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    serverMachineName: 'Homelab TrueNAS',
  },
  {
    id: 2,
    name: 'Minecraft Vanilla',
    gameTitle: 'Minecraft',
    serverType: 'minecraft',
    host: 'play.example.com',
    port: 25565,
    isPublicLink: false,
    status: 'offline',
    currentPlayers: 0,
    maxPlayers: 20,
    playerList: [],
    connectionAddress: 'play.example.com:25565',
    ownerUsername: 'testuser',
    isOwner: true,
    userPermission: 'admin',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
]

vi.mock('@/features/gameservers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/gameservers')>()
  return {
    ...actual,
    useGameServers: () => ({ data: mockServers, isLoading: false }),
    useDeleteGameServer: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useQueryGameServer: () => ({ mutateAsync: vi.fn() }),
  }
})

describe('GameServersDrawer', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    vi.clearAllMocks()
  })

  const renderComponent = (props: {
    open?: boolean
    onClose?: () => void
    focusedServerId?: number | null
    onOpenCreateServer?: () => void
  } = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <DkToastProvider>
          <GameServersDrawer
            open={props.open ?? true}
            onClose={props.onClose ?? vi.fn()}
            focusedServerId={props.focusedServerId}
            onOpenCreateServer={props.onOpenCreateServer}
          />
        </DkToastProvider>
      </QueryClientProvider>,
    )
  }

  it('renders nothing when open is false', () => {
    renderComponent({ open: false })
    expect(screen.queryByRole('dialog', { name: /dedicated game servers/i })).not.toBeInTheDocument()
  })

  it('renders drawer dialog with servers list and count when open is true', () => {
    renderComponent({ open: true })
    expect(screen.getByRole('dialog', { name: /dedicated game servers/i })).toBeInTheDocument()
    expect(screen.getByText('Palworld Guild World')).toBeInTheDocument()
    expect(screen.getByText('Minecraft Vanilla')).toBeInTheDocument()
    expect(screen.getByText('192.168.1.100:8211')).toBeInTheDocument()
    expect(screen.getByText('Homelab TrueNAS')).toBeInTheDocument()
  })

  it('filters servers by search term', async () => {
    renderComponent({ open: true })
    const searchInput = screen.getByPlaceholderText(/search by server name/i)

    fireEvent.change(searchInput, { target: { value: 'Minecraft' } })

    expect(screen.getByText('Minecraft Vanilla')).toBeInTheDocument()
    expect(screen.queryByText('Palworld Guild World')).not.toBeInTheDocument()
  })

  it('triggers onOpenCreateServer when Add Server button is clicked', () => {
    const handleAdd = vi.fn()
    renderComponent({ open: true, onOpenCreateServer: handleAdd })

    const addButtons = screen.getAllByRole('button', { name: /add server/i })
    fireEvent.click(addButtons[0])

    expect(handleAdd).toHaveBeenCalledTimes(1)
  })

  it('triggers onClose when close button is clicked', () => {
    const handleClose = vi.fn()
    renderComponent({ open: true, onClose: handleClose })

    const closeBtn = screen.getByRole('button', { name: /close game servers drawer/i })
    fireEvent.click(closeBtn)

    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it('copies address to clipboard when copy button is clicked', async () => {
    const writeTextSpy = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: { writeText: writeTextSpy },
    })

    renderComponent({ open: true })

    const copyBtn = screen.getByRole('button', { name: /192\.168\.1\.100:8211/i })
    fireEvent.click(copyBtn)

    expect(writeTextSpy).toHaveBeenCalledWith('192.168.1.100:8211')
  })
})
