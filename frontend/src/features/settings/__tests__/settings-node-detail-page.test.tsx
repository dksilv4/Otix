import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ModalProvider, ModalRoot } from '@/lib/modals'
import { SettingsSaveProvider } from '../context/settings-save-context'
import { SettingsNodeDetailPage } from '../pages/settings-node-detail-page'

let mockAuthUser: any = { id: 1, isAdmin: true }

vi.mock('@/lib/providers/auth', () => ({
  useAuth: () => ({
    user: mockAuthUser,
    isAuthenticated: Boolean(mockAuthUser),
    isLoading: false,
  }),
}))

const mockNavigate = vi.fn()
let mockHash = ''
let mockNodeId: string | null = '1'
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ hash: mockHash, pathname: `/settings/nodes/${mockNodeId}` }),
  useParams: () => ({ nodeId: mockNodeId }),
  Link: ({ children }: any) => <a>{children}</a>,
}))

vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

const mockSetSelectedNodeId = vi.fn()
vi.mock('../context/settings-node-context', () => ({
  useSettingsNode: () => ({
    servers: [
      { id: 1, name: 'Living Room PC', primaryUrl: 'http://192.168.1.100:8000', isOnline: true },
    ],
    selectedNode: { id: 1, name: 'Living Room PC' },
    selectedNodeId: 1,
    setSelectedNodeId: mockSetSelectedNodeId,
    isLoading: false,
  }),
}))

describe('SettingsNodeDetailPage', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    mockHash = ''
    mockNodeId = '1'
    mockAuthUser = { id: 1, isAdmin: true }
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderPage = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <SettingsSaveProvider>
          <ModalProvider>
            <SettingsNodeDetailPage />
            <ModalRoot />
          </ModalProvider>
        </SettingsSaveProvider>
      </QueryClientProvider>,
    )
  }

  it('renders node details and sets active node in context', () => {
    mockNodeId = '1'
    renderPage()

    expect(mockSetSelectedNodeId).toHaveBeenCalledWith(1)
    expect(screen.getByText('Living Room PC')).toBeInTheDocument()
    expect(screen.getByText('http://192.168.1.100:8000')).toBeInTheDocument()
  })

  it('renders not found state when node does not exist', () => {
    mockNodeId = '999'
    renderPage()

    expect(screen.getByText('Node Not Found')).toBeInTheDocument()
    expect(screen.getByText(/The requested node is no longer connected/)).toBeInTheDocument()
  })

  it('shows sign-in locked state when unauthenticated', () => {
    mockAuthUser = null
    renderPage()

    expect(screen.getByText('Sign in required')).toBeInTheDocument()
    expect(
      screen.getByText('Sign in to inspect and configure individual node details.'),
    ).toBeInTheDocument()
  })
})
