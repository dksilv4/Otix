import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NodeMapActionDock } from '../node-map-action-dock'
import type { NodeMapItem } from '../../../types/node-map'
import type { GameServer } from '@/features/downloads/types'
import type { UserServerMachine } from '../../../types/server-machines'
import type { PendingNode } from '@/features/downloads/pending-nodes'

describe('NodeMapActionDock', () => {
  it('renders nothing when selectedItem is null', () => {
    const { container } = render(<NodeMapActionDock selectedItem={null} onClose={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders worker node actions and triggers callbacks', async () => {
    const user = userEvent.setup()
    const onOpenNodeSettings = vi.fn()
    const onRenameNode = vi.fn()
    const onOpenConnectPicker = vi.fn()
    const onClose = vi.fn()

    const nodeItem: NodeMapItem = {
      id: 'node-1',
      type: 'node',
      entityId: 1,
      name: 'Main Worker',
      data: {
        type: 'node',
        server: {
          id: 1,
          name: 'Main Worker',
          primaryUrl: 'http://localhost:8090',
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

    render(
      <NodeMapActionDock
        selectedItem={nodeItem}
        onClose={onClose}
        onOpenConnectPicker={onOpenConnectPicker}
        onOpenNodeSettings={onOpenNodeSettings}
        onRenameNode={onRenameNode}
      />,
    )

    expect(screen.getByText('Main Worker')).toBeInTheDocument()
    expect(screen.getByText('Online')).toBeInTheDocument()

    // Test Open button
    await user.click(screen.getByRole('button', { name: /^open$/i }))
    expect(onOpenNodeSettings).toHaveBeenCalledWith(nodeItem.data.server)

    // Test Rename button
    await user.click(screen.getByRole('button', { name: /rename main worker/i }))
    expect(onRenameNode).toHaveBeenCalledWith(nodeItem.data.server)

    // Test Connect button
    await user.click(screen.getByRole('button', { name: /connect main worker/i }))
    expect(onOpenConnectPicker).toHaveBeenCalledWith(nodeItem)

    // Test Deselect button
    await user.click(screen.getByRole('button', { name: /deselect/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('renders server machine actions and triggers detect drives and edit', async () => {
    const user = userEvent.setup()
    const onEditServer = vi.fn()
    const onDetectDrives = vi.fn()
    const onDeleteServer = vi.fn()

    const serverItem: NodeMapItem = {
      id: 'server-10',
      type: 'server',
      entityId: 10,
      name: 'Tower NAS',
      data: {
        type: 'server',
        machine: {
          id: 10,
          name: 'Tower NAS',
          os: 'unraid',
          isOnline: true,
          smbEnabled: true,
          createdAt: '',
          updatedAt: '',
        } as UserServerMachine,
      },
    }

    render(
      <NodeMapActionDock
        selectedItem={serverItem}
        onClose={vi.fn()}
        onEditServer={onEditServer}
        onDetectDrives={onDetectDrives}
        onDeleteServer={onDeleteServer}
      />,
    )

    expect(screen.getByText('Tower NAS')).toBeInTheDocument()
    expect(screen.getByText('Unraid')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /edit tower nas/i }))
    expect(onEditServer).toHaveBeenCalledWith(serverItem.data.machine)

    await user.click(screen.getByRole('button', { name: /detect drives/i }))
    expect(onDetectDrives).toHaveBeenCalledWith(serverItem.data.machine)

    await user.click(screen.getByRole('button', { name: /delete tower nas/i }))
    expect(onDeleteServer).toHaveBeenCalledWith(serverItem.data.machine)
  })

  it('renders unclaimed node claim action', async () => {
    const user = userEvent.setup()
    const onClaimPendingNode = vi.fn()

    const unclaimedItem: NodeMapItem = {
      id: 'unclaimed-node-0',
      type: 'unclaimed_node',
      entityId: -100,
      name: 'Discovered Node',
      data: {
        type: 'unclaimed_node',
        pending: {
          serverName: 'Discovered Node',
          localUrl: 'http://192.168.1.200:8090',
          claimCode: '123456',
          claimed: false,
        } as PendingNode,
      },
    }

    render(
      <NodeMapActionDock
        selectedItem={unclaimedItem}
        onClose={vi.fn()}
        onClaimPendingNode={onClaimPendingNode}
      />,
    )

    await user.click(screen.getByRole('button', { name: /claim node/i }))
    expect(onClaimPendingNode).toHaveBeenCalledWith(unclaimedItem.data.pending)
  })
})
