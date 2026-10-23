import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NodeMapCardItem } from '../node-map-card-item'
import type { NodeMapItem } from '../../../types/node-map'
import type { GameServer } from '@/features/downloads/types'
import type { UserServerMachine } from '../../../types/server-machines'
import type { DedicatedGameServer } from '@/features/gameservers/types'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
  useNavigate: () => vi.fn(),
}))

describe('NodeMapCardItem', () => {
  const mockNodeItem: NodeMapItem = {
    id: 'node-1',
    type: 'node',
    entityId: 1,
    name: 'Home Worker',
    data: {
      type: 'node',
      server: {
        id: 1,
        name: 'Home Worker',
        primaryUrl: 'http://192.168.1.100:8090',
        isOnline: true,
        isActive: true,
        totalFiles: 0,
        storageFreeBytes: 0,
        storageTotalBytes: 0,
        createdAt: '',
        updatedAt: '',
      } as GameServer,
    },
  }

  it('renders clean card without action buttons when not selected', () => {
    render(
      <NodeMapCardItem
        item={mockNodeItem}
        position={{ x: 100, y: 100 }}
        isSelected={false}
        isConnectingSource={false}
        isConnectingTargetCandidate={false}
        onSelect={vi.fn()}
        onDragStart={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Home Worker' })).toBeInTheDocument()
    expect(screen.getByText('http://192.168.1.100:8090')).toBeInTheDocument()

    // No action toolbar rendered when unselected
    expect(screen.queryByRole('toolbar', { name: 'Node actions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^open$/i })).not.toBeInTheDocument()
  })

  it('renders toolbar underneath card with 1rem spacing when selected', async () => {
    const user = userEvent.setup()
    const onOpenNodeSettings = vi.fn()
    const onRenameNode = vi.fn()
    const onOpenConnectPicker = vi.fn()

    render(
      <NodeMapCardItem
        item={mockNodeItem}
        position={{ x: 100, y: 100 }}
        isSelected={true}
        isConnectingSource={false}
        isConnectingTargetCandidate={false}
        onSelect={vi.fn()}
        onDragStart={vi.fn()}
        onOpenConnectPicker={onOpenConnectPicker}
        onOpenNodeSettings={onOpenNodeSettings}
        onRenameNode={onRenameNode}
      />,
    )

    // Toolbar is present with top-[calc(100%+1rem)]
    const toolbar = screen.getByRole('toolbar', { name: 'Node actions' })
    expect(toolbar).toBeInTheDocument()
    expect(toolbar.className).toContain('top-[calc(100%+1rem)]')

    // Action buttons inside toolbar
    const openBtn = screen.getByRole('button', { name: /^open$/i })
    await user.click(openBtn)
    expect(onOpenNodeSettings).toHaveBeenCalledWith(mockNodeItem.data.server)

    const renameBtn = screen.getByRole('button', { name: /rename home worker/i })
    await user.click(renameBtn)
    expect(onRenameNode).toHaveBeenCalledWith(mockNodeItem.data.server)

    const connectBtn = screen.getByRole('button', { name: /connect home worker/i })
    await user.click(connectBtn)
    expect(onOpenConnectPicker).toHaveBeenCalledWith(mockNodeItem)
  })

  it('renders server machine actions in toolbar when server is selected', async () => {
    const user = userEvent.setup()
    const onEditServer = vi.fn()
    const onDetectDrives = vi.fn()
    const onDeleteServer = vi.fn()

    const mockServerItem: NodeMapItem = {
      id: 'server-10',
      type: 'server',
      entityId: 10,
      name: 'Unraid NAS',
      data: {
        type: 'server',
        machine: {
          id: 10,
          name: 'Unraid NAS',
          os: 'unraid',
          isOnline: true,
          createdAt: '',
          updatedAt: '',
        } as UserServerMachine,
      },
    }

    render(
      <NodeMapCardItem
        item={mockServerItem}
        position={{ x: 100, y: 100 }}
        isSelected={true}
        isConnectingSource={false}
        isConnectingTargetCandidate={false}
        onSelect={vi.fn()}
        onDragStart={vi.fn()}
        onEditServer={onEditServer}
        onDetectDrives={onDetectDrives}
        onDeleteServer={onDeleteServer}
      />,
    )

    const toolbar = screen.getByRole('toolbar', { name: 'Node actions' })
    expect(toolbar).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /edit unraid nas/i }))
    expect(onEditServer).toHaveBeenCalledWith(mockServerItem.data.machine)

    await user.click(screen.getByRole('button', { name: /detect drives/i }))
    expect(onDetectDrives).toHaveBeenCalledWith(mockServerItem.data.machine)

    await user.click(screen.getByRole('button', { name: /delete unraid nas/i }))
    expect(onDeleteServer).toHaveBeenCalledWith(mockServerItem.data.machine)
  })

  it('renders at-a-glance information for online dedicated game server node', async () => {
    const user = userEvent.setup()
    const onCopyGameServerAddress = vi.fn()
    const onOpenGameServerDrawer = vi.fn()

    const mockGameServer: DedicatedGameServer = {
      id: 1,
      name: 'DK VALHEIM',
      gameTitle: 'Valheim',
      serverType: 'steam_source',
      host: '77.101.86.247',
      port: 2456,
      connectionAddress: '77.101.86.247:2456',
      status: 'online',
      currentPlayers: 4,
      maxPlayers: 20,
      playerList: ['Odin', 'Thor'],
      pingMs: 24,
      currentMap: 'ValheimWorld',
      password: 'secretpassword',
      serverMachineId: 1,
      serverMachineName: 'SERVER',
      ownerUsername: 'admin',
      isOwner: true,
      userPermission: 'admin',
      isPublicLink: true,
      createdAt: '',
      updatedAt: '',
    }

    const mockGameServerItem: NodeMapItem = {
      id: 'game-server-1',
      type: 'game_server',
      entityId: 1,
      name: 'DK VALHEIM',
      data: {
        type: 'game_server',
        gameServer: mockGameServer,
      },
    }

    render(
      <NodeMapCardItem
        item={mockGameServerItem}
        position={{ x: 200, y: 150 }}
        isSelected={false}
        isConnectingSource={false}
        isConnectingTargetCandidate={false}
        onSelect={vi.fn()}
        onDragStart={vi.fn()}
        onCopyGameServerAddress={onCopyGameServerAddress}
        onOpenGameServerDrawer={onOpenGameServerDrawer}
      />,
    )

    // Name and game title are visible at a glance
    expect(screen.getByRole('heading', { name: 'DK VALHEIM' })).toBeInTheDocument()
    expect(screen.getByText('Valheim')).toBeInTheDocument()

    // Ping / latency is visible
    expect(screen.getByText('24ms')).toBeInTheDocument()

    // Player count is visible
    expect(screen.getByText('4/20')).toBeInTheDocument()

    // Current map is visible
    expect(screen.getByText('ValheimWorld')).toBeInTheDocument()

    // Connection address is displayed and clickable to copy
    const copyAddrBtn = screen.getByRole('button', { name: /77\.101\.86\.247:2456/i })
    expect(copyAddrBtn).toBeInTheDocument()
    await user.click(copyAddrBtn)
    expect(onCopyGameServerAddress).toHaveBeenCalledWith(mockGameServer, expect.anything())

    // Host machine tag is visible
    expect(screen.getByText('SERVER')).toBeInTheDocument()
  })

  it('renders offline standalone game server with appropriate status indicators', () => {
    const mockOfflineGameServer: DedicatedGameServer = {
      id: 2,
      name: 'MINECRAFT SURVIVAL',
      gameTitle: 'Minecraft',
      serverType: 'minecraft',
      host: '192.168.1.50',
      port: 25565,
      connectionAddress: '192.168.1.50:25565',
      status: 'offline',
      currentPlayers: 0,
      maxPlayers: 10,
      playerList: [],
      pingMs: null,
      serverMachineId: null,
      serverMachineName: null,
      ownerUsername: 'admin',
      isOwner: true,
      userPermission: 'admin',
      isPublicLink: false,
      createdAt: '',
      updatedAt: '',
    }

    const mockItem: NodeMapItem = {
      id: 'game-server-2',
      type: 'game_server',
      entityId: 2,
      name: 'MINECRAFT SURVIVAL',
      data: {
        type: 'game_server',
        gameServer: mockOfflineGameServer,
      },
    }

    render(
      <NodeMapCardItem
        item={mockItem}
        position={{ x: 200, y: 150 }}
        isSelected={false}
        isConnectingSource={false}
        isConnectingTargetCandidate={false}
        onSelect={vi.fn()}
        onDragStart={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'MINECRAFT SURVIVAL' })).toBeInTheDocument()
    expect(screen.getByText('Minecraft')).toBeInTheDocument()
    expect(screen.getByText('Offline')).toBeInTheDocument()
    expect(screen.getByText('Standalone')).toBeInTheDocument()
  })
})
