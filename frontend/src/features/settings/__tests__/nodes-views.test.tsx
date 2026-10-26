import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  loadStoredNodesViewMode,
  saveStoredNodesViewMode,
  rememberPreviousSettingsTab,
  getPreviousSettingsTab,
  SETTINGS_PREV_TAB_STORAGE_KEY,
  flattenInfrastructureItems,
  filterInfrastructureItems,
  getNavPillsTopOffset,
  NODES_VIEW_STORAGE_KEY,
  isNodeMapItemCategoryMatch,
  isNodeMapItemStatusMatch,
  isNodeMapItemMatch,
  type UnifiedInfrastructureItem,
} from '../utils/node-views'
import {
  NodesViewProvider,
  useNodesView,
} from '../context/nodes-view-context'
import { NodesSecondarySettingsMenu } from '../components/organisms/nodes-secondary-settings-menu'
import { NodesMenuDropdownButton } from '../components/organisms/nodes-menu-dropdown-button'
import { NodesGridView } from '../components/organisms/nodes-grid-view'
import { NodesListView } from '../components/organisms/nodes-list-view'
import type { GameServer } from '@/features/downloads/types'
import type { UserServerMachine } from '../types/server-machines'
import type { DedicatedGameServer } from '@/features/gameservers/types'

const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@tanstack/react-router')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

describe('node-views utilities', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('loads and saves stored view mode in localStorage', () => {
    expect(loadStoredNodesViewMode()).toBe('map')
    saveStoredNodesViewMode('grid')
    expect(localStorage.getItem(NODES_VIEW_STORAGE_KEY)).toBe('grid')
    expect(loadStoredNodesViewMode()).toBe('grid')
    saveStoredNodesViewMode('list')
    expect(loadStoredNodesViewMode()).toBe('list')
  })

  it('remembers and restores previous non-nodes settings tab', () => {
    expect(getPreviousSettingsTab('general')).toBe('general')
    rememberPreviousSettingsTab('account')
    expect(localStorage.getItem(SETTINGS_PREV_TAB_STORAGE_KEY)).toBe('account')
    expect(getPreviousSettingsTab()).toBe('account')

    // Should ignore remembering 'nodes'
    rememberPreviousSettingsTab('nodes')
    expect(getPreviousSettingsTab()).toBe('account')

    rememberPreviousSettingsTab('library')
    expect(getPreviousSettingsTab()).toBe('library')
  })

  it('flattens heterogeneous infrastructure correctly', () => {
    const mockNodes: GameServer[] = [
      {
        id: 1,
        name: 'Worker Node 1',
        primaryUrl: 'http://192.168.1.50:8090',
        isOnline: true,
        totalFiles: 42,
        storageFreeBytes: 1000,
        storageTotalBytes: 5000,
        isActive: true,
        createdAt: '',
        updatedAt: '',
      },
    ]

    const mockMachines: UserServerMachine[] = [
      {
        id: 2,
        name: 'Homelab Server',
        os: 'ubuntu',
        host: '192.168.1.10',
        smbEnabled: true,
        smbShareName: 'nas-storage',
        smbPort: 445,
        smbNodeIds: [1],
        smbNodes: [],
        drivesConfig: [],
        totalStorageBytes: 10000,
        freeStorageBytes: 6000,
        isOnline: true,
        createdAt: '',
        updatedAt: '',
      },
    ]

    const mockGameServers: DedicatedGameServer[] = [
      {
        id: 10,
        name: 'My Minecraft Server',
        gameTitle: 'Minecraft',
        serverType: 'minecraft',
        host: '192.168.1.10',
        port: 25565,
        isPublicLink: true,
        status: 'online',
        currentPlayers: 4,
        maxPlayers: 20,
        playerList: [],
        connectionAddress: '192.168.1.10:25565',
        ownerUsername: 'admin',
        isOwner: true,
        userPermission: 'admin',
        createdAt: '',
        updatedAt: '',
      },
    ]

    const items = flattenInfrastructureItems({
      nodes: mockNodes,
      serverMachines: mockMachines,
      gameServers: mockGameServers,
    })

    expect(items.length).toBe(4) // 1 worker node + 1 server machine + 1 smb share on machine + 1 game server
    expect(items.some((i) => i.type === 'node' && i.name === 'Worker Node 1')).toBe(true)
    expect(items.some((i) => i.type === 'server' && i.name === 'Homelab Server')).toBe(true)
    expect(items.some((i) => i.type === 'samba' && i.name === '/nas-storage')).toBe(true)
    expect(items.some((i) => i.type === 'game_server' && i.name === 'My Minecraft Server')).toBe(true)
  })

  it('filters items by category, status, and query', () => {
    const mockItems: UnifiedInfrastructureItem[] = [
      {
        id: 'node-1',
        entityId: 1,
        name: 'Worker Alpha',
        type: 'node',
        typeLabel: 'Worker Node',
        isOnline: true,
        endpoint: 'http://192.168.1.10:8090',
        raw: {},
      },
      {
        id: 'server-2',
        entityId: 2,
        name: 'Media Vault',
        type: 'server',
        typeLabel: 'Ubuntu Linux',
        isOnline: false,
        endpoint: '192.168.1.20',
        raw: {},
      },
      {
        id: 'samba-3',
        entityId: 3,
        name: '/games',
        type: 'samba',
        typeLabel: 'SMB Share',
        isOnline: true,
        endpoint: '192.168.1.20:445',
        raw: {},
      },
    ]

    // Category filter
    expect(filterInfrastructureItems(mockItems, '', 'nodes', 'all')).toHaveLength(1)
    expect(filterInfrastructureItems(mockItems, '', 'machines', 'all')).toHaveLength(1)
    expect(filterInfrastructureItems(mockItems, '', 'storage', 'all')).toHaveLength(1)

    // Status filter
    expect(filterInfrastructureItems(mockItems, '', 'all', 'online')).toHaveLength(2)
    expect(filterInfrastructureItems(mockItems, '', 'all', 'offline')).toHaveLength(1)

    // Query filter
    expect(filterInfrastructureItems(mockItems, 'Alpha', 'all', 'all')).toHaveLength(1)
    expect(filterInfrastructureItems(mockItems, '192.168.1.20', 'all', 'all')).toHaveLength(2)
  })

  it('correctly matches node map items for category and status filters', () => {
    const nodeItem = {
      id: 'node-1',
      type: 'node' as const,
      entityId: 1,
      name: 'Alpha Worker',
      data: { type: 'node' as const, server: { id: 1, name: 'Alpha Worker', isOnline: true } as any },
    }
    const machineItem = {
      id: 'server-2',
      type: 'server' as const,
      entityId: 2,
      name: 'Homelab Box',
      data: { type: 'server' as const, machine: { id: 2, name: 'Homelab Box', isOnline: false } as any },
    }
    const sambaItem = {
      id: 'samba-3',
      type: 'samba' as const,
      entityId: 3,
      name: 'SMB Storage',
      data: { type: 'samba' as const, samba: { id: 'samba-3', shareName: 'SMB Storage', isOnline: true } as any },
    }
    const gsItem = {
      id: 'gs-4',
      type: 'game_server' as const,
      entityId: 4,
      name: 'Minecraft SMP',
      data: { type: 'game_server' as const, gameServer: { id: 4, name: 'Minecraft SMP', status: 'online' } as any },
    }

    // Category matches
    expect(isNodeMapItemCategoryMatch('node', 'all')).toBe(true)
    expect(isNodeMapItemCategoryMatch('node', 'nodes')).toBe(true)
    expect(isNodeMapItemCategoryMatch('server', 'nodes')).toBe(false)
    expect(isNodeMapItemCategoryMatch('server', 'machines')).toBe(true)
    expect(isNodeMapItemCategoryMatch('home', 'machines')).toBe(true)
    expect(isNodeMapItemCategoryMatch('samba', 'storage')).toBe(true)
    expect(isNodeMapItemCategoryMatch('game_server', 'game_servers')).toBe(true)

    // Status matches
    expect(isNodeMapItemStatusMatch(nodeItem, 'online')).toBe(true)
    expect(isNodeMapItemStatusMatch(nodeItem, 'offline')).toBe(false)
    expect(isNodeMapItemStatusMatch(machineItem, 'online')).toBe(false)
    expect(isNodeMapItemStatusMatch(machineItem, 'offline')).toBe(true)
    expect(isNodeMapItemStatusMatch(gsItem, 'online')).toBe(true)

    // Full match
    expect(isNodeMapItemMatch(nodeItem, 'alpha', 'nodes', 'online')).toBe(true)
    expect(isNodeMapItemMatch(nodeItem, 'beta', 'nodes', 'online')).toBe(false)
    expect(isNodeMapItemMatch(machineItem, 'homelab', 'machines', 'offline')).toBe(true)
    expect(isNodeMapItemMatch(sambaItem, '', 'storage', 'online')).toBe(true)
  })

  it('calculates nav pill clearance classes properly', () => {
    expect(getNavPillsTopOffset(true)).toBeDefined()
    expect(getNavPillsTopOffset(false)).toBeDefined()
  })
})

describe('NodesSecondarySettingsMenu & Dropdown', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    localStorage.clear()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
  })

  it('renders back button and switches view modes', async () => {
    const user = userEvent.setup()
    const handleBack = vi.fn()

    const Consumer = () => {
      const { viewMode } = useNodesView()
      return <div data-testid="active-view-mode">{viewMode}</div>
    }

    render(
      <QueryClientProvider client={queryClient}>
        <NodesViewProvider>
          <NodesSecondarySettingsMenu onBackToSettings={handleBack} />
          <Consumer />
        </NodesViewProvider>
      </QueryClientProvider>,
    )

    // Check Back button is present
    const backBtn = screen.getByRole('button', { name: /back to settings/i })
    expect(backBtn).toBeInTheDocument()
    await user.click(backBtn)
    expect(handleBack).toHaveBeenCalledTimes(1)

    // Default mode is map
    expect(screen.getByTestId('active-view-mode')).toHaveTextContent('map')

    // Click Grid
    const gridBtn = screen.getByRole('tab', { name: /grid/i })
    await user.click(gridBtn)
    expect(screen.getByTestId('active-view-mode')).toHaveTextContent('grid')

    // Click List
    const listBtn = screen.getByRole('tab', { name: /list/i })
    await user.click(listBtn)
    expect(screen.getByTestId('active-view-mode')).toHaveTextContent('list')
  })

  it('triggers search, category filter, and add infrastructure', async () => {
    const user = userEvent.setup()

    const Consumer = () => {
      const { searchQuery, categoryFilter, addModalOpen } = useNodesView()
      return (
        <div>
          <div data-testid="search-query">{searchQuery}</div>
          <div data-testid="category-filter">{categoryFilter}</div>
          <div data-testid="add-modal-open">{String(addModalOpen)}</div>
        </div>
      )
    }

    render(
      <QueryClientProvider client={queryClient}>
        <NodesViewProvider>
          <NodesSecondarySettingsMenu onBackToSettings={vi.fn()} />
          <Consumer />
        </NodesViewProvider>
      </QueryClientProvider>,
    )

    // Type search
    const searchInput = screen.getByRole('searchbox', { name: /search infrastructure/i })
    await user.type(searchInput, 'vault')
    expect(screen.getByTestId('search-query')).toHaveTextContent('vault')

    // Select category
    const serverCategoryBtn = screen.getByRole('button', { name: /server machines/i })
    await user.click(serverCategoryBtn)
    expect(screen.getByTestId('category-filter')).toHaveTextContent('machines')

    // Click Add Infrastructure
    const addBtn = screen.getByRole('button', { name: /add infrastructure/i })
    await user.click(addBtn)
    expect(screen.getByTestId('add-modal-open')).toHaveTextContent('true')
  })

  it('renders NodesMenuDropdownButton and toggles menu', async () => {
    const user = userEvent.setup()
    const handleBack = vi.fn()

    render(
      <QueryClientProvider client={queryClient}>
        <NodesViewProvider>
          <NodesMenuDropdownButton onBackToSettings={handleBack} />
        </NodesViewProvider>
      </QueryClientProvider>,
    )

    // Initially dropdown content is closed
    expect(screen.queryByText(/Nodes & Infrastructure/i)).not.toBeInTheDocument()

    // Click button to open
    const toggleBtn = screen.getByRole('button', { name: /toggle nodes menu dropdown/i })
    await user.click(toggleBtn)

    // Now menu is visible
    expect(screen.getByRole('heading', { name: /^nodes$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /back to settings/i })).toBeInTheDocument()
  })

  it('navigates to general settings by default when back button is clicked without callback', async () => {
    const user = userEvent.setup()
    mockNavigate.mockClear()

    render(
      <QueryClientProvider client={queryClient}>
        <NodesViewProvider>
          <NodesSecondarySettingsMenu />
        </NodesViewProvider>
      </QueryClientProvider>,
    )

    const backBtn = screen.getByRole('button', { name: /back to settings/i })
    await user.click(backBtn)
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/settings/general' })
  })
})

describe('NodesGridView & NodesListView', () => {
  const mockItems: UnifiedInfrastructureItem[] = [
    {
      id: 'node-1',
      entityId: 1,
      name: 'Primary Daemon',
      type: 'node',
      typeLabel: 'Worker Node',
      isOnline: true,
      endpoint: 'http://192.168.1.50:8090',
      storageSummary: '50 GB free / 500 GB',
      storagePercent: 90,
      raw: {
        node: {
          id: 1,
          name: 'Primary Daemon',
          primaryUrl: 'http://192.168.1.50:8090',
          isOnline: true,
          totalFiles: 20,
          storageFreeBytes: 50,
          storageTotalBytes: 500,
          isActive: true,
          createdAt: '',
          updatedAt: '',
        },
      },
    },
  ]

  it('renders grid view with cards and action buttons', async () => {
    const user = userEvent.setup()
    const onOpenNodeSettings = vi.fn()

    render(
      <NodesGridView
        items={mockItems}
        categoryFilter="all"
        onOpenNodeSettings={onOpenNodeSettings}
        onAddNode={vi.fn()}
      />,
    )

    expect(screen.getByText('Primary Daemon')).toBeInTheDocument()
    expect(screen.getByText('Worker Node')).toBeInTheDocument()

    const configureBtn = screen.getByRole('button', { name: /configure/i })
    await user.click(configureBtn)
    expect(onOpenNodeSettings).toHaveBeenCalledWith(mockItems[0].raw.node)
  })

  it('renders list view with rows and action buttons', async () => {
    const user = userEvent.setup()
    const onOpenNodeSettings = vi.fn()

    render(
      <NodesListView
        items={mockItems}
        onOpenNodeSettings={onOpenNodeSettings}
        onAddNode={vi.fn()}
      />,
    )

    expect(screen.getByText('Primary Daemon')).toBeInTheDocument()
    expect(screen.getByText('http://192.168.1.50:8090')).toBeInTheDocument()

    const configureBtn = screen.getByRole('button', { name: /configure/i })
    await user.click(configureBtn)
    expect(onOpenNodeSettings).toHaveBeenCalledWith(mockItems[0].raw.node)
  })

  it('renders empty state when no items match filters', () => {
    render(
      <NodesGridView
        items={[]}
        categoryFilter="all"
        onAddNode={vi.fn()}
      />,
    )

    expect(screen.getByText(/no infrastructure matches/i)).toBeInTheDocument()
  })
})
