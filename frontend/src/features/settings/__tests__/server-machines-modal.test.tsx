import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ServerMachineModal } from '../components/organisms/server-machine-modal'
import { NodesManagementModal } from '../components/organisms/nodes-management-modal'
import type { UserHome, UserServerMachine } from '../types/server-machines'
import type { GameServer } from '@/features/downloads/types'

vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

const mockCreateServerMachine = vi.fn().mockResolvedValue({ id: 10, name: 'Tower NAS' })
const mockUpdateServerMachine = vi.fn().mockResolvedValue({ id: 1, name: 'Tower NAS' })
const mockDetectDrives = vi.fn().mockResolvedValue({
  success: true,
  detectedDrives: [
    {
      id: 'drive-1',
      drive: '/mnt/user',
      label: 'Main Share',
      fileSystem: 'xfs',
      totalBytes: 1000000000000,
      freeBytes: 400000000000,
      usedBytes: 600000000000,
      type: 'hdd',
    },
  ],
  detectedOs: { name: 'Unraid OS' },
  detectedOsCode: 'unraid',
})

const mockHomes: UserHome[] = [
  {
    id: 1,
    name: 'Main Residence',
    description: 'Home Network',
    isDefault: true,
    subnetCidr: '192.168.1.0/24',
    nodesCount: 1,
    serverMachinesCount: 1,
    createdAt: '2026-10-15T00:00:00Z',
    updatedAt: '2026-10-15T00:00:00Z',
  },
]

const mockNodes: GameServer[] = [
  {
    id: 1,
    name: 'Unraid Daemon Node',
    primaryUrl: 'http://192.168.1.150:8090',
    localUrl: 'http://192.168.1.150:8090',
    isOnline: true,
    totalFiles: 42,
    storageFreeBytes: 400000000000,
    storageTotalBytes: 1000000000000,
    isActive: true,
    createdAt: '2026-10-15T00:00:00Z',
    updatedAt: '2026-10-15T00:00:00Z',
  },
]

const mockServerMachines: UserServerMachine[] = [
  {
    id: 1,
    name: 'Homelab Unraid',
    homeId: 1,
    homeName: 'Main Residence',
    os: 'unraid',
    osVersion: '6.12.8',
    host: '192.168.1.150',
    hostedNodeId: 1,
    hostedNodeName: 'Unraid Daemon Node',
    smbEnabled: true,
    smbHost: '192.168.1.150',
    smbPort: 445,
    smbShareName: 'games',
    smbNodeIds: [1],
    smbNodes: [{ id: 1, name: 'Unraid Daemon Node', primaryUrl: 'http://192.168.1.150:8090' }],
    drivesConfig: [
      {
        id: 'drive-1',
        drive: '/mnt/disk1',
        label: 'Array Disk 1',
        fileSystem: 'xfs',
        totalBytes: 14000000000000,
        freeBytes: 4000000000000,
        usedBytes: 10000000000000,
        type: 'hdd',
      },
    ],
    totalStorageBytes: 14000000000000,
    freeStorageBytes: 4000000000000,
    isOnline: true,
    createdAt: '2026-10-15T00:00:00Z',
    updatedAt: '2026-10-15T00:00:00Z',
  },
]

vi.mock('../hooks/use-server-machines', () => ({
  useUserHomes: () => ({ data: mockHomes, isLoading: false }),
  useServerMachines: () => ({ data: mockServerMachines, isLoading: false }),
  useCreateServerMachine: () => ({ mutateAsync: mockCreateServerMachine, isPending: false }),
  useUpdateServerMachine: () => ({ mutateAsync: mockUpdateServerMachine, isPending: false }),
  useDeleteServerMachine: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDetectServerDrives: () => ({ mutateAsync: mockDetectDrives, isPending: false }),
  useAssignNodeHome: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateHome: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateHome: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteHome: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('@/features/downloads/use-server-downloads', () => ({
  useGameServers: () => ({ data: mockNodes, isLoading: false }),
  usePendingGameServers: () => ({ data: [], isLoading: false }),
  useDeleteGameServer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateGameServer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePingGameServer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useProbeGameServer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUnclaimLocalNode: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

describe('ServerMachineModal and NodesManagementModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders ServerMachineModal with OS options and allows creating server machine', async () => {
    const user = userEvent.setup()
    const handleClose = vi.fn()

    render(
      <ServerMachineModal
        open={true}
        onOpenChange={handleClose}
        homes={mockHomes}
        nodes={mockNodes}
        defaultHomeId={1}
      />,
    )

    expect(screen.getAllByText('Add Server Machine')).toHaveLength(2)
    expect(screen.getByText('General & OS')).toBeInTheDocument()
    expect(screen.getByText('Hard Drives (0)')).toBeInTheDocument()
    expect(screen.getByText('SMB & Nodes')).toBeInTheDocument()

    // Fill in server name
    const nameInput = screen.getByPlaceholderText('e.g. Tower NAS, Homelab Box, TrueNAS Vault')
    await user.type(nameInput, 'TrueNAS SCALE Box')

    // Click TrueNAS OS option
    const truenasBtn = screen.getByRole('button', { name: /TrueNAS/i })
    await user.click(truenasBtn)

    // Switch to Hard Drives tab
    await user.click(screen.getByText('Hard Drives (0)'))
    expect(screen.getByText('Auto-Detect from Node')).toBeInTheDocument()

    // Add manual drive
    const addDriveBtn = screen.getByRole('button', { name: /Add Drive/i })
    await user.click(addDriveBtn)
    expect(screen.getByPlaceholderText('/mnt/disk1 or C:')).toBeInTheDocument()

    // Submit form
    const submitBtn = screen.getByRole('button', { name: 'Add Server Machine' })
    await user.click(submitBtn)

    await waitFor(() => {
      expect(mockCreateServerMachine).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'TrueNAS SCALE Box',
          os: 'truenas',
        }),
      )
    })
  })

  it('renders NodesManagementModal with tabs for Nodes, Server Machines, and Homes', async () => {
    const user = userEvent.setup()
    const handleClose = vi.fn()

    render(
      <NodesManagementModal
        open={true}
        onOpenChange={handleClose}
        initialTab="servers"
      />,
    )

    expect(screen.getByText('Nodes & Homelab')).toBeInTheDocument()
    expect(screen.getByText(/Homelab Unraid/i)).toBeInTheDocument()
    expect(screen.getByText('Unraid')).toBeInTheDocument()
    expect(screen.getByText(/Hosted Node: Unraid Daemon Node/i)).toBeInTheDocument()
    expect(screen.getByText(/SMB: \/games/i)).toBeInTheDocument()

    // Switch to Homes tab
    const homesTab = screen.getByRole('button', { name: /Homes/i })
    await user.click(homesTab)
    expect(screen.getByText('Main Residence')).toBeInTheDocument()
    expect(screen.getByText('Default')).toBeInTheDocument()

    // Switch to Nodes tab
    const nodesTab = screen.getByRole('button', { name: /Nodes/i })
    await user.click(nodesTab)
    expect(screen.getByText('Unraid Daemon Node')).toBeInTheDocument()
    expect(screen.getByText(/Hosted on: Homelab Unraid/i)).toBeInTheDocument()
  })
})
