import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  CreateWorkerNodeModal,
  EditWorkerNodeModal,
  CreateServerMachineModal,
  EditServerMachineModal,
  CreateHomeModal,
  EditHomeModal,
  CreateSambaShareModal,
  EditSambaShareModal,
} from '../components'
import type { GameServer } from '@/features/downloads/types'
import type { UserHome, UserServerMachine } from '../types/server-machines'
import type { SambaShareConfig } from '../types/node-map'

vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

const mockClaimGameServer = vi.fn()
const mockCreateGameServer = vi.fn()
const mockUpdateGameServer = vi.fn()
const mockDeleteGameServer = vi.fn()
const mockProbeGameServer = vi.fn()
const mockUnclaimLocalNode = vi.fn()

const mockCreateServerMachine = vi.fn()
const mockUpdateServerMachine = vi.fn()
const mockDeleteServerMachine = vi.fn()
const mockDetectServerDrives = vi.fn()
const mockAssignNodeHome = vi.fn()
const mockCreateHome = vi.fn()
const mockUpdateHome = vi.fn()
const mockDeleteHome = vi.fn()

vi.mock('@/features/downloads/use-server-downloads', () => ({
  useGameServers: () => ({ data: [], isLoading: false }),
  usePendingGameServers: () => ({ data: [], isLoading: false }),
  useClaimGameServer: () => ({ mutateAsync: mockClaimGameServer, isPending: false }),
  useCreateGameServer: () => ({ mutateAsync: mockCreateGameServer, isPending: false }),
  useUpdateGameServer: () => ({ mutateAsync: mockUpdateGameServer, isPending: false }),
  useDeleteGameServer: () => ({ mutateAsync: mockDeleteGameServer, isPending: false }),
  useProbeGameServer: () => ({ mutateAsync: mockProbeGameServer, isPending: false }),
  useUnclaimLocalNode: () => ({ mutateAsync: mockUnclaimLocalNode, isPending: false }),
}))

vi.mock('../hooks/use-server-machines', () => ({
  useUserHomes: () => ({ data: [], isLoading: false }),
  useServerMachines: () => ({ data: [], isLoading: false }),
  useCreateServerMachine: () => ({ mutateAsync: mockCreateServerMachine, isPending: false }),
  useUpdateServerMachine: () => ({ mutateAsync: mockUpdateServerMachine, isPending: false }),
  useDeleteServerMachine: () => ({ mutateAsync: mockDeleteServerMachine, isPending: false }),
  useDetectServerDrives: () => ({ mutateAsync: mockDetectServerDrives, isPending: false }),
  useAssignNodeHome: () => ({ mutateAsync: mockAssignNodeHome, isPending: false }),
  useCreateHome: () => ({ mutateAsync: mockCreateHome, isPending: false }),
  useUpdateHome: () => ({ mutateAsync: mockUpdateHome, isPending: false }),
  useDeleteHome: () => ({ mutateAsync: mockDeleteHome, isPending: false }),
}))

const sampleNode: GameServer = {
  id: 1,
  name: 'Primary Node',
  primaryUrl: 'http://192.168.1.100:8090',
  localUrl: 'http://192.168.1.100:8090',
  isOnline: true,
  totalFiles: 10,
  storageFreeBytes: 500000000,
  storageTotalBytes: 1000000000,
  isActive: true,
  createdAt: '2026-10-16T00:00:00Z',
  updatedAt: '2026-10-16T00:00:00Z',
}

const sampleHome: UserHome = {
  id: 1,
  name: 'Main Lab',
  description: 'Primary location',
  isDefault: true,
  subnetCidr: '192.168.1.0/24',
  nodesCount: 1,
  serverMachinesCount: 1,
  createdAt: '2026-10-16T00:00:00Z',
  updatedAt: '2026-10-16T00:00:00Z',
}

const sampleMachine: UserServerMachine = {
  id: 1,
  name: 'Tower 1',
  homeId: 1,
  homeName: 'Main Lab',
  os: 'unraid',
  osVersion: '6.12.8',
  host: '192.168.1.150',
  hostedNodeId: 1,
  hostedNodeName: 'Primary Node',
  smbEnabled: false,
  smbHost: '192.168.1.150',
  smbPort: 445,
  smbShareName: 'games',
  smbNodeIds: [1],
  smbNodes: [],
  drivesConfig: [],
  totalStorageBytes: 1000000000,
  freeStorageBytes: 500000000,
  isOnline: true,
  createdAt: '2026-10-16T00:00:00Z',
  updatedAt: '2026-10-16T00:00:00Z',
}

const sampleSamba: SambaShareConfig = {
  id: 'samba-1',
  serverId: 1,
  serverName: 'Tower 1',
  shareName: 'games',
  host: '192.168.1.150',
  port: 445,
  isOnline: true,
  nodeIds: [1],
}

describe('Separated Node Modals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Worker Node Modals', () => {
    it('renders CreateWorkerNodeModal with claim and manual tabs', async () => {
      const user = userEvent.setup()
      const handleClose = vi.fn()

      render(<CreateWorkerNodeModal open={true} onOpenChange={handleClose} />)

      expect(screen.getByRole('heading', { name: 'Connect Otix Node' })).toBeInTheDocument()
      expect(screen.getByPlaceholderText('OTX-XXXX')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /claim & link node/i })).toBeInTheDocument()

      // Switch to manual tab
      await user.click(screen.getByRole('button', { name: /manual url & token/i }))
      expect(screen.getByPlaceholderText('http://127.0.0.1:8090')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /connect node/i })).toBeInTheDocument()
    })

    it('renders EditWorkerNodeModal and allows editing name and home', async () => {
      const user = userEvent.setup()
      const handleClose = vi.fn()

      mockUpdateGameServer.mockResolvedValueOnce({ ...sampleNode, name: 'Renamed Node' })

      render(
        <EditWorkerNodeModal
          open={true}
          onOpenChange={handleClose}
          node={sampleNode}
          homes={[sampleHome]}
          serverMachines={[sampleMachine]}
        />,
      )

      expect(screen.getByRole('heading', { name: `Edit ${sampleNode.name}` })).toBeInTheDocument()

      const nameInput = screen.getByDisplayValue(sampleNode.name)
      await user.clear(nameInput)
      await user.type(nameInput, 'Renamed Node')

      await user.click(screen.getByRole('button', { name: /save changes/i }))

      expect(mockUpdateGameServer).toHaveBeenCalledWith(
        expect.objectContaining({
          id: sampleNode.id,
          name: 'Renamed Node',
        }),
      )
    })
  })

  describe('Server Machine Modals', () => {
    it('renders CreateServerMachineModal and allows creating machine', async () => {
      const user = userEvent.setup()
      const handleClose = vi.fn()

      mockCreateServerMachine.mockResolvedValueOnce({ id: 2, name: 'TrueNAS Core' })

      render(
        <CreateServerMachineModal
          open={true}
          onOpenChange={handleClose}
          homes={[sampleHome]}
          nodes={[sampleNode]}
        />,
      )

      expect(screen.getByRole('heading', { name: 'Add Server Machine' })).toBeInTheDocument()

      const nameInput = screen.getByPlaceholderText(/tower nas/i)
      await user.type(nameInput, 'TrueNAS Core')

      await user.click(screen.getByRole('button', { name: /add server machine/i }))

      expect(mockCreateServerMachine).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'TrueNAS Core',
        }),
      )
    })

    it('renders EditServerMachineModal and allows updating server machine', async () => {
      const user = userEvent.setup()
      const handleClose = vi.fn()

      mockUpdateServerMachine.mockResolvedValueOnce({ ...sampleMachine, name: 'Tower 1 Pro' })

      render(
        <EditServerMachineModal
          open={true}
          onOpenChange={handleClose}
          server={sampleMachine}
          homes={[sampleHome]}
          nodes={[sampleNode]}
        />,
      )

      expect(screen.getByRole('heading', { name: `Configure ${sampleMachine.name}` })).toBeInTheDocument()

      const nameInput = screen.getByDisplayValue(sampleMachine.name)
      await user.clear(nameInput)
      await user.type(nameInput, 'Tower 1 Pro')

      await user.click(screen.getByRole('button', { name: /save changes/i }))

      expect(mockUpdateServerMachine).toHaveBeenCalledWith(
        expect.objectContaining({
          id: sampleMachine.id,
          name: 'Tower 1 Pro',
        }),
      )
    })
  })

  describe('Home Environment Modals', () => {
    it('renders CreateHomeModal and creates a home location', async () => {
      const user = userEvent.setup()
      const handleClose = vi.fn()

      mockCreateHome.mockResolvedValueOnce({ id: 2, name: 'Secondary Homelab' })

      render(<CreateHomeModal open={true} onOpenChange={handleClose} />)

      expect(screen.getByText('New Home Location')).toBeInTheDocument()

      const nameInput = screen.getByPlaceholderText(/e\.g\. main residence/i)
      await user.type(nameInput, 'Secondary Homelab')

      await user.click(screen.getByRole('button', { name: /create home/i }))

      expect(mockCreateHome).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Secondary Homelab',
        }),
      )
    })

    it('renders EditHomeModal and updates an existing home', async () => {
      const user = userEvent.setup()
      const handleClose = vi.fn()

      mockUpdateHome.mockResolvedValueOnce({ ...sampleHome, name: 'Main Residence HQ' })

      render(<EditHomeModal open={true} onOpenChange={handleClose} home={sampleHome} />)

      expect(screen.getByRole('heading', { name: `Edit ${sampleHome.name}` })).toBeInTheDocument()

      const nameInput = screen.getByDisplayValue(sampleHome.name)
      await user.clear(nameInput)
      await user.type(nameInput, 'Main Residence HQ')

      await user.click(screen.getByRole('button', { name: /save changes/i }))

      expect(mockUpdateHome).toHaveBeenCalledWith(
        expect.objectContaining({
          id: sampleHome.id,
          name: 'Main Residence HQ',
        }),
      )
    })
  })

  describe('Samba Share Modals', () => {
    it('renders CreateSambaShareModal and connects share', async () => {
      const user = userEvent.setup()
      const handleClose = vi.fn()
      const handleSaveCustom = vi.fn()

      render(
        <CreateSambaShareModal
          open={true}
          onOpenChange={handleClose}
          serverMachines={[sampleMachine]}
          onSaveCustom={handleSaveCustom}
        />,
      )

      expect(screen.getByRole('heading', { name: 'Add Samba Share' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /connect share/i })).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /connect share/i }))

      expect(mockUpdateServerMachine).toHaveBeenCalledWith(
        expect.objectContaining({
          id: sampleMachine.id,
          smbEnabled: true,
          smbShareName: 'games',
        }),
      )
    })

    it('renders EditSambaShareModal and updates share settings', async () => {
      const user = userEvent.setup()
      const handleClose = vi.fn()

      render(
        <EditSambaShareModal
          open={true}
          onOpenChange={handleClose}
          samba={sampleSamba}
          serverMachines={[sampleMachine]}
        />,
      )

      expect(screen.getByRole('heading', { name: 'Configure Samba Share' })).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /save changes/i }))

      expect(mockUpdateServerMachine).toHaveBeenCalledWith(
        expect.objectContaining({
          id: sampleSamba.serverId,
          smbEnabled: true,
          smbShareName: sampleSamba.shareName,
        }),
      )
    })
  })
})
