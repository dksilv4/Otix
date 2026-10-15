import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ModalProvider, ModalRoot } from '@/lib/modals'
import { ConnectNodeModal } from '../connect-node-modal'
import type { PendingNode } from '../../pending-nodes'

let mockGameServers: Array<{ id: number; name: string; isOnline: boolean; localUrl?: string; primaryUrl?: string; authToken?: string }> = []
let mockPendingNodes: PendingNode[] = []
const mockClaimMutateAsync = vi.fn().mockResolvedValue({ id: 10, name: 'Claimed Node', isOnline: true })
const mockCreateMutateAsync = vi.fn().mockResolvedValue({ id: 11, name: 'Manual Node', isOnline: true })
const mockUnclaimMutateAsync = vi.fn().mockResolvedValue(true)

vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

vi.mock('../../use-server-downloads', () => ({
  useGameServers: () => ({ data: mockGameServers, isLoading: false }),
  usePendingGameServers: () => ({ data: mockPendingNodes, isLoading: false }),
  useClaimGameServer: () => ({ mutateAsync: mockClaimMutateAsync, isPending: false }),
  useCreateGameServer: () => ({ mutateAsync: mockCreateMutateAsync, isPending: false }),
  useUnclaimLocalNode: () => ({ mutateAsync: mockUnclaimMutateAsync, isPending: false }),
}))

const renderModal = (props: { isOpen: boolean; onClose: () => void }) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ModalProvider>
        <ConnectNodeModal {...props} />
        <ModalRoot />
      </ModalProvider>
    </QueryClientProvider>,
  )
}

describe('ConnectNodeModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGameServers = []
    mockPendingNodes = []
  })

  it('renders modal when open with claim and manual tabs', () => {
    renderModal({ isOpen: true, onClose: vi.fn() })
    expect(screen.getByText('Connect Otix Node')).toBeInTheDocument()
    expect(screen.getByText(/Claim with PIN/i)).toBeInTheDocument()
    expect(screen.getByText(/Manual URL & Token/i)).toBeInTheDocument()
    expect(screen.getByText(/Want direct account login instead/i)).toBeInTheDocument()
  })

  it('renders detected unclaimed node and populates PIN when clicking Use PIN', async () => {
    const user = userEvent.setup()
    mockPendingNodes = [
      {
        serverName: 'Local Rig',
        localUrl: 'http://127.0.0.1:8090',
        claimCode: 'ABC123',
        claimed: false,
      },
    ]

    renderModal({ isOpen: true, onClose: vi.fn() })

    expect(screen.getByText(/Detected Node: Local Rig/i)).toBeInTheDocument()
    expect(screen.getByText('ABC123')).toBeInTheDocument()

    const usePinBtn = screen.getByRole('button', { name: /Use PIN/i })
    await user.click(usePinBtn)

    const pinInput = screen.getByPlaceholderText('OTX-XXXX') as HTMLInputElement
    expect(pinInput.value).toBe('ABC123')
  })

  it('renders orphaned node banner and triggers reset when clicked', async () => {
    const user = userEvent.setup()
    mockPendingNodes = [
      {
        serverName: 'Old Rig',
        localUrl: 'http://127.0.0.1:8090',
        authToken: 'old_secret_token',
        claimed: true,
      },
    ]
    mockGameServers = [
      { id: 1, name: 'Other Server', localUrl: 'http://192.168.1.50:8090', isOnline: true },
    ]

    renderModal({ isOpen: true, onClose: vi.fn() })

    expect(screen.getByText(/Local node linked to deleted or different account/i)).toBeInTheDocument()
    const resetBtn = screen.getByRole('button', { name: /Reset Node/i })
    await user.click(resetBtn)

    expect(mockUnclaimMutateAsync).toHaveBeenCalledWith('old_secret_token')
  })
})
