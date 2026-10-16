import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NodeMapCardItem } from '../node-map-card-item'
import type { NodeMapItem } from '../../../types/node-map'
import type { GameServer } from '@/features/downloads/types'
import type { UserServerMachine } from '../../../types/server-machines'

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
})
