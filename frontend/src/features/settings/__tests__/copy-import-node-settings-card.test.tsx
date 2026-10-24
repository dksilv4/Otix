import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CopyImportNodeSettingsCard } from '../components/organisms/copy-import-node-settings-card'
import { ModalProvider, ModalRoot } from '@/lib/modals'
import { apiClient } from '@/lib/api/client'

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}))

const mockToast = vi.fn()
vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

describe('CopyImportNodeSettingsCard', () => {
  const mockServers = [
    { id: 1, name: 'Home Server', primaryUrl: 'http://192.168.1.50:8090', isOnline: true },
    { id: 2, name: 'Living Room PC', primaryUrl: 'http://192.168.1.60:8090', isOnline: true },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        namingTemplate: '{Title} ({Year})/{Title}.{ext}',
        autoOrganizeEnabled: true,
        postProcessEnabled: true,
      },
    } as any)
    vi.mocked(apiClient.post).mockResolvedValue({ data: { success: true } } as any)
  })

  it('renders card header, active node, source options, and category switches', () => {
    render(
      <ModalProvider>
        <CopyImportNodeSettingsCard currentNodeId={1} servers={mockServers} />
        <ModalRoot />
      </ModalProvider>,
    )

    expect(
      screen.getByRole('heading', { name: 'Copy & Import Node Settings' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Import into Active Node')).toBeInTheDocument()
    expect(screen.getByText('Home Server')).toBeInTheDocument()
    expect(screen.getByText('Folder Naming & Rules')).toBeInTheDocument()
    expect(screen.getByText('Automation Preferences')).toBeInTheDocument()
    expect(screen.getByText('Search & Repacker Filters')).toBeInTheDocument()
    expect(screen.getByText('Monitored Library Paths')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /import into this node/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy to other nodes/i })).toBeInTheDocument()
  })

  it('imports settings from source node when clicked', async () => {
    const user = userEvent.setup()
    const onSettingsImported = vi.fn()
    const mockDlConfig = {
      namingTemplate: '{Title} ({Year})/{Title}.{ext}',
      autoOrganizeEnabled: true,
      postProcessEnabled: true,
    } as any

    render(
      <ModalProvider>
        <CopyImportNodeSettingsCard
          currentNodeId={1}
          servers={mockServers}
          dlConfig={mockDlConfig}
          onSettingsImported={onSettingsImported}
        />
        <ModalRoot />
      </ModalProvider>,
    )

    const importBtn = screen.getByRole('button', { name: /import into this node/i })
    await user.click(importBtn)

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        '/library/servers/1/organize',
        expect.objectContaining({
          namingTemplate: '{Title} ({Year})/{Title}.{ext}',
          autoOrganizeEnabled: true,
        }),
      )
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Settings Imported',
          variant: 'success',
        }),
      )
      expect(onSettingsImported).toHaveBeenCalled()
    })
  })

  it('opens copy modal when clicking Copy to Other Nodes button', async () => {
    const user = userEvent.setup()

    render(
      <ModalProvider>
        <CopyImportNodeSettingsCard currentNodeId={1} servers={mockServers} />
        <ModalRoot />
      </ModalProvider>,
    )

    const copyBtn = screen.getByRole('button', { name: /copy to other nodes/i })
    await user.click(copyBtn)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Copy Node Settings' })).toBeInTheDocument()
    })
  })
})
