import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddNodeModal } from '../add-node-modal'
import type { PendingNode } from '@/features/downloads/pending-nodes'

describe('AddNodeModal', () => {
  it('renders all four node types and triggers onSelectType', async () => {
    const user = userEvent.setup()
    const onSelectType = vi.fn()
    const onOpenChange = vi.fn()

    render(
      <AddNodeModal
        open={true}
        onOpenChange={onOpenChange}
        onSelectType={onSelectType}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Add Node' })).toBeInTheDocument()
    expect(screen.getByText('Otix Worker Node')).toBeInTheDocument()
    expect(screen.getByText('Machine')).toBeInTheDocument()
    expect(screen.getByText('Home Environment')).toBeInTheDocument()
    expect(screen.getByText('Samba Share (SMB)')).toBeInTheDocument()

    await user.click(screen.getByText('Otix Worker Node'))
    expect(onSelectType).toHaveBeenCalledWith('worker')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('displays discovered local nodes and allows selecting/claiming one', async () => {
    const user = userEvent.setup()
    const onClaimNode = vi.fn()
    const onOpenChange = vi.fn()
    const pendingNodes: PendingNode[] = [
      {
        serverName: 'Local Dev Node',
        localUrl: 'http://127.0.0.1:8090',
        claimCode: '123456',
        claimed: false,
      },
    ]

    render(
      <AddNodeModal
        open={true}
        onOpenChange={onOpenChange}
        unclaimedNodes={pendingNodes}
        onSelectType={vi.fn()}
        onClaimNode={onClaimNode}
      />,
    )

    expect(screen.getByText(/Discovered Local Nodes \(1\)/i)).toBeInTheDocument()
    expect(screen.getByText('Local Dev Node')).toBeInTheDocument()
    expect(screen.getByText('PIN: 123456')).toBeInTheDocument()

    const addBtn = screen.getByRole('button', { name: /add this node/i })
    await user.click(addBtn)

    expect(onClaimNode).toHaveBeenCalledWith(pendingNodes[0])
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
