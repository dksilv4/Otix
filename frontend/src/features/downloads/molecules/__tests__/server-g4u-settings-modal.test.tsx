import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { ServerG4USettingsModal } from '../server-g4u-settings-modal'

vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

let mockGameServers: Array<{ id: number; name: string }> = []
let mockUsenetConfig: any = null
const saveG4U = vi.fn()
const testG4U = vi.fn()

vi.mock('@/features/downloads/use-server-downloads', () => ({
  useGameServers: () => ({ data: mockGameServers, isLoading: false }),
}))

vi.mock('@/features/downloads/use-server-usenet', () => ({
  useServerUsenetConfig: () => ({ data: mockUsenetConfig, isLoading: false }),
  useNodeUsenetConfig: () => ({ data: mockUsenetConfig, isLoading: false }),
  useSaveServerG4UConfig: () => ({ mutateAsync: saveG4U, isPending: false }),
  useSaveNodeG4UConfig: () => ({ mutateAsync: saveG4U, isPending: false }),
  useTestG4U: () => ({ mutateAsync: testG4U, isPending: false }),
}))

describe('ServerG4USettingsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGameServers = [{ id: 1, name: 'Node' }]
    mockUsenetConfig = {
      g4u: {
        url: 'https://g4u.to/api/',
        api_key: 'saved-key',
        enabled: true,
        configured: true,
      },
    }
    saveG4U.mockResolvedValue({ status: 'saved' })
    testG4U.mockResolvedValue({ ok: true, message: 'Connected to g4u successfully' })
  })

  it('renders modal with title, API URL, and copyable RSS feed section', () => {
    render(<ServerG4USettingsModal serverId={1} serverName="Node" onClose={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'g4u.to' })).toBeInTheDocument()
    expect(screen.getByLabelText(/API URL/i)).toHaveValue('https://g4u.to/api/')
    expect(screen.getByText(/Copy Feed URL/i)).toBeInTheDocument()
  })

  it('runs connection test and calls testG4U mutation', async () => {
    const user = userEvent.setup()
    render(<ServerG4USettingsModal serverId={1} serverName="Node" onClose={vi.fn()} />)

    const testBtn = screen.getByRole('button', { name: /Test Connection/i })
    await user.click(testBtn)

    await waitFor(() => {
      expect(testG4U).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://g4u.to/api/',
          api_key: 'saved-key',
        })
      )
    })
  })

  it('saves updated settings when submitting form', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<ServerG4USettingsModal serverId={1} serverName="Node" onClose={onClose} />)

    const urlInput = screen.getByLabelText(/API URL/i)
    await user.clear(urlInput)
    await user.type(urlInput, 'https://custom-mirror.to/api/')

    const saveBtn = screen.getByRole('button', { name: /^Save$/i })
    await user.click(saveBtn)

    await waitFor(() => {
      expect(saveG4U).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://custom-mirror.to/api/',
          api_key: 'saved-key',
          enabled: true,
        })
      )
      expect(onClose).toHaveBeenCalled()
    })
  })
})
