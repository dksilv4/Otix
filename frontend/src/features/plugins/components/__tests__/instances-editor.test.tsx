import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { InstancesEditor } from '../organisms/instances-editor'
import type { PluginConfigField } from '@/features/plugins/types/plugins'
import type { PluginAPI } from '@/features/plugins/api'

function makeField(): PluginConfigField {
  return {
    type: 'instances',
    label: 'Radarr Instances',
    connection: { method: 'probe', fields: ['url', 'apiKey'] },
    items: {
      name: { type: 'string', label: 'Name' },
      url: { type: 'serverUrl', label: 'Server URL', parts: ['host', 'port', 'useSsl', 'baseUrl'] },
      apiKey: { type: 'secret', label: 'API Key' },
      qualityProfile: { type: 'string', label: 'Quality Profile', fetchable: true },
      rootFolder: { type: 'string', label: 'Root Folder', fetchable: true },
      autoRequestWatchlist: { type: 'boolean', label: 'Auto-request watchlisted movies' },
    },
  }
}

describe('InstancesEditor', () => {
  let callData: ReturnType<typeof vi.fn>

  beforeEach(() => {
    callData = vi.fn()
  })

  const renderEditor = (field = makeField()) => {
    const api = { callData } as unknown as PluginAPI
    return render(<InstancesEditor field={field} pluginId="radarr" api={api} />)
  }

  it('loads and lists instances with a composed URL summary', async () => {
    callData.mockResolvedValue([
      { id: 'radarr-main', name: 'Local', host: '192.168.1.50', port: 7878, useSsl: false, baseUrl: '/radarr', enabled: true },
    ])
    renderEditor()
    expect(await screen.findByText('Local')).toBeInTheDocument()
    expect(screen.getByText('http://192.168.1.50:7878/radarr')).toBeInTheDocument()
    expect(screen.getByText('enabled')).toBeInTheDocument()
    expect(callData).toHaveBeenCalledWith('radarr', 'get-instances')
  })

  it('connects with URL + API key, shows fetchable selectors, and saves a flattened payload', async () => {
    callData.mockImplementation((pluginId: string, method: string) => {
      if (method === 'get-instances') return Promise.resolve([])
      if (method === 'probe') {
        return Promise.resolve({
          ok: true,
          version: '5.3.0',
          options: {
            qualityProfile: [{ value: 'HD-1080p', label: 'HD-1080p' }],
            rootFolder: [{ value: '/data/media', label: '/data/media' }],
          },
        })
      }
      return Promise.resolve({ success: true })
    })

    renderEditor()
    fireEvent.click(screen.getByRole('button', { name: /Add instance/ }))

    fireEvent.change(screen.getByLabelText('Server URL'), {
      target: { value: 'http://192.168.1.50:7878/radarr' },
    })
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'abc123' } })

    fireEvent.click(screen.getByRole('button', { name: /Connect & fetch/ }))
    await waitFor(() =>
      expect(callData).toHaveBeenCalledWith('radarr', 'probe', {
        host: '192.168.1.50',
        port: 7878,
        useSsl: false,
        baseUrl: '/radarr',
        apiKey: 'abc123',
      }),
    )

    // Fetchable selectors render as dropdowns fed from the probe response
    expect(await screen.findByLabelText('Quality Profile')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'HD-1080p' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '/data/media' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Quality Profile'), { target: { value: 'HD-1080p' } })
    // name auto-fills from the connected host
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('192.168.1.50')

    fireEvent.click(screen.getByRole('button', { name: 'Add instance' }))
    await waitFor(() =>
      expect(callData).toHaveBeenCalledWith('radarr', 'add-instance', {
        name: '192.168.1.50',
        host: '192.168.1.50',
        port: 7878,
        useSsl: false,
        baseUrl: '/radarr',
        apiKey: 'abc123',
        qualityProfile: 'HD-1080p',
        rootFolder: '',
        autoRequestWatchlist: false,
      }),
    )
  })

  it('rejects a malformed URL with a probe error and does not call probe', async () => {
    callData.mockResolvedValue([])
    renderEditor()
    fireEvent.click(screen.getByRole('button', { name: /Add instance/ }))
    fireEvent.change(screen.getByLabelText('Server URL'), { target: { value: 'not a url' } })
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'abc123' } })
    fireEvent.click(screen.getByRole('button', { name: /Connect & fetch/ }))
    expect(await screen.findByText(/valid URL/)).toBeInTheDocument()
    expect(callData).not.toHaveBeenCalledWith('radarr', 'probe', expect.anything())
  })
})
