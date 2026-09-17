import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { ServerSabnzbdSettingsModal } from '../server-sabnzbd-settings-modal'
import { ServerProwlarrSettingsModal } from '../server-prowlarr-settings-modal'
import { ServerRadarrSettingsModal } from '../server-radarr-settings-modal'
import { ServerSonarrSettingsModal } from '../server-sonarr-settings-modal'

vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

let mockGameServers: Array<{ id: number; name: string }> = []
let mockUsenetConfig: any = null
let mockRadarrConfig: any = null
let mockSonarrConfig: any = null
let mockIndexers: Array<{ id: number; name: string; protocol: string; enable: boolean }> = []
const saveSabnzbd = vi.fn()
const testSabnzbd = vi.fn()
const saveProwlarr = vi.fn()
const testProwlarr = vi.fn()
const syncProwlarr = vi.fn()
const saveRadarr = vi.fn()
const testRadarr = vi.fn()
const saveSonarr = vi.fn()
const testSonarr = vi.fn()
const refetchRadarrProfiles = vi.fn()
const refetchRadarrFolders = vi.fn()
const refetchSonarrProfiles = vi.fn()
const refetchSonarrFolders = vi.fn()

vi.mock('@/features/downloads/use-server-downloads', () => ({
  useGameServers: () => ({ data: mockGameServers, isLoading: false }),
}))

vi.mock('@/features/downloads/use-server-usenet', () => ({
  useServerUsenetConfig: () => ({ data: mockUsenetConfig, isLoading: false }),
  useSaveServerSabnzbdConfig: () => ({ mutateAsync: saveSabnzbd, isPending: false }),
  useTestSabnzbd: () => ({ mutateAsync: testSabnzbd, isPending: false }),
  useSaveServerProwlarrConfig: () => ({ mutateAsync: saveProwlarr, isPending: false }),
  useTestProwlarr: () => ({ mutateAsync: testProwlarr, isPending: false }),
  useProwlarrIndexers: () => ({ data: mockIndexers, isLoading: false, refetch: vi.fn() }),
  useSyncProwlarrIndexers: () => ({ mutateAsync: syncProwlarr, isPending: false }),
}))

vi.mock('@/features/downloads/use-server-arr', () => ({
  useServerRadarrConfig: () => ({ data: mockRadarrConfig, isLoading: false }),
  useSaveServerRadarrConfig: () => ({ mutateAsync: saveRadarr, isPending: false }),
  useTestRadarr: () => ({ mutateAsync: testRadarr, isPending: false }),
  useServerRadarrQualityProfiles: () => ({
    data: [{ id: 1, name: 'HD-1080p' }],
    refetch: refetchRadarrProfiles,
  }),
  useServerRadarrRootFolders: () => ({
    data: [{ id: 1, path: '/movies' }],
    refetch: refetchRadarrFolders,
  }),
  useServerSonarrConfig: () => ({ data: mockSonarrConfig, isLoading: false }),
  useSaveServerSonarrConfig: () => ({ mutateAsync: saveSonarr, isPending: false }),
  useTestSonarr: () => ({ mutateAsync: testSonarr, isPending: false }),
  useServerSonarrQualityProfiles: () => ({
    data: [{ id: 2, name: 'Any' }],
    refetch: refetchSonarrProfiles,
  }),
  useServerSonarrRootFolders: () => ({
    data: [{ id: 2, path: '/tv' }],
    refetch: refetchSonarrFolders,
  }),
}))

describe('integration service modals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGameServers = []
    mockUsenetConfig = null
    mockRadarrConfig = null
    mockSonarrConfig = null
    mockIndexers = []
    saveSabnzbd.mockResolvedValue({ sabnzbdLibrary: { folderLinked: true, linkedLibraryPath: '/games' } })
    testSabnzbd.mockResolvedValue({ ok: true, message: 'SABnzbd ok' })
    saveProwlarr.mockResolvedValue({ status: 'saved' })
    testProwlarr.mockResolvedValue({ ok: true, message: 'Prowlarr ok' })
    syncProwlarr.mockResolvedValue({ message: 'Synced' })
    saveRadarr.mockResolvedValue({ status: 'saved' })
    testRadarr.mockResolvedValue({ ok: true, message: 'Radarr ok' })
    saveSonarr.mockResolvedValue({ status: 'saved' })
    testSonarr.mockResolvedValue({ ok: true, message: 'Sonarr ok' })
  })

  it('shows empty-server state for SABnzbd when no game server exists', () => {
    render(<ServerSabnzbdSettingsModal onClose={vi.fn()} />)
    expect(screen.getByText('No Game Server Connected')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'SABnzbd' })).toBeInTheDocument()
  })

  it('shows empty-server state for Radarr when no game server exists', () => {
    render(<ServerRadarrSettingsModal onClose={vi.fn()} />)
    expect(screen.getByText('No Game Server Connected')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Radarr' })).toBeInTheDocument()
  })

  it('shows the target server name in the SABnzbd title description', () => {
    mockGameServers = [{ id: 9, name: 'Homelab Alpha' }]
    render(<ServerSabnzbdSettingsModal serverId={9} serverName="Homelab Alpha" onClose={vi.fn()} />)
    expect(screen.getByText(/On Homelab Alpha/i)).toBeInTheDocument()
    expect(screen.queryByText(/Configure SABnzbd/i)).not.toBeInTheDocument()
  })

  it('fills, tests, and saves SABnzbd including a path mapping', async () => {
    const user = userEvent.setup()
    mockGameServers = [{ id: 1, name: 'Node' }]
    mockUsenetConfig = { sabnzbd: { host: '127.0.0.1', port: 8080 } }
    const onClose = vi.fn()

    render(<ServerSabnzbdSettingsModal serverId={1} serverName="Node" onClose={onClose} />)

    await user.clear(screen.getByLabelText(/^Host/))
    await user.type(screen.getByLabelText(/^Host/), 'sab.local')
    await user.clear(screen.getByLabelText(/API Key/i))
    await user.type(screen.getByLabelText(/API Key/i), 'sab-key')

    await user.click(screen.getByRole('button', { name: /^Test connection$/i }))
    expect(testSabnzbd).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /Add mapping/i }))
    const remoteInputs = screen.getAllByLabelText(/Remote path/i)
    await user.type(remoteInputs[remoteInputs.length - 1], '/downloads/complete')
    const localInputs = screen.getAllByLabelText(/Local path/i)
    await user.type(localInputs[localInputs.length - 1], '/mnt/downloads')

    await user.click(screen.getByRole('button', { name: /^Save$/i }))

    await waitFor(() => {
      expect(saveSabnzbd).toHaveBeenCalled()
    })
    const payload = saveSabnzbd.mock.calls[0][0]
    expect(payload.host).toBe('sab.local')
    expect(payload.api_key).toBe('sab-key')
    expect(payload.path_mappings.some((m: { remote_path: string }) => m.remote_path === '/downloads/complete')).toBe(true)
    expect(onClose).toHaveBeenCalled()
  })

  it('tints Test connection yellow, then green or red, and resets when connection fields change', async () => {
    const user = userEvent.setup()
    mockGameServers = [{ id: 1, name: 'Node' }]
    mockUsenetConfig = { sabnzbd: { host: '127.0.0.1', port: 8080 } }

    render(<ServerSabnzbdSettingsModal serverId={1} serverName="Node" onClose={vi.fn()} />)

    const testBtn = screen.getByRole('button', { name: /^Test connection$/i })
    const saveBtn = screen.getByRole('button', { name: /^Save$/i })
    expect(testBtn.compareDocumentPosition(saveBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(testBtn.className).toMatch(/h-10/)
    expect(testBtn.className).toMatch(/rounded-xl/)
    expect(testBtn.className).toMatch(/bg-amber-400/)

    await user.click(testBtn)
    await waitFor(() => expect(testBtn.className).toMatch(/bg-emerald-500/))

    await user.type(screen.getByLabelText(/^Host/), 'x')
    expect(testBtn.className).toMatch(/bg-amber-400/)
    expect(testBtn.className).not.toMatch(/bg-emerald-500/)

    testSabnzbd.mockResolvedValueOnce({ ok: false, message: 'offline' })
    await user.click(testBtn)
    await waitFor(() => expect(testBtn.className).toMatch(/bg-rose-500/))
  })

  it('shows a discovery empty state for an undiscovered completed folder', () => {
    mockGameServers = [{ id: 1, name: 'Node' }]
    mockUsenetConfig = {
      sabnzbd: {
        host: '127.0.0.1',
        port: 8080,
        folderError: 'SABnzbd completed folder has not been discovered yet',
        folderLinked: false,
      },
    }

    render(<ServerSabnzbdSettingsModal serverId={1} serverName="Node" onClose={vi.fn()} />)

    expect(screen.getByText('Folder not found yet')).toBeInTheDocument()
    expect(screen.queryByText(/SABnzbd completed folder has not been discovered yet/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Connection' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Paths' })).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Category/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Mappings' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Mappings' }).className).toMatch(/text-center/)

    const ssl = screen.getByRole('switch', { name: /Use SSL/i })
    const category = screen.getByLabelText(/Category/i)
    expect(category.compareDocumentPosition(ssl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows folder not found from the save response when the folder is unlinked', async () => {
    const user = userEvent.setup()
    mockGameServers = [{ id: 1, name: 'Node' }]
    mockUsenetConfig = { sabnzbd: { host: '127.0.0.1', port: 8080 } }
    const onClose = vi.fn()
    saveSabnzbd.mockResolvedValue({
      sabnzbdLibrary: {
        folderLinked: false,
        folderError: 'SABnzbd completed folder has not been discovered yet',
        pathMappings: [{ remote_path: '/downloads', host_path: '', linked: false }],
      },
    })

    render(<ServerSabnzbdSettingsModal serverId={1} serverName="Node" onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: /^Save$/i }))

    await waitFor(() => expect(saveSabnzbd).toHaveBeenCalled())
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('Folder not found yet')).toBeInTheDocument()
    expect(screen.queryByText(/SABnzbd completed folder has not been discovered yet/i)).not.toBeInTheDocument()
  })

  it('locks body scroll while an integration modal is open', () => {
    mockGameServers = [{ id: 1, name: 'Node' }]
    const { unmount } = render(<ServerSabnzbdSettingsModal serverId={1} serverName="Node" onClose={vi.fn()} />)
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('exposes Prowlarr protocol tabs and a Sync button', async () => {
    const user = userEvent.setup()
    mockGameServers = [{ id: 1, name: 'Node' }]
    mockUsenetConfig = { prowlarr: { host: '127.0.0.1', port: 9696 } }

    render(<ServerProwlarrSettingsModal serverId={1} serverName="Node" onClose={vi.fn()} />)

    const protocolGroup = screen.getByRole('group', { name: /Protocol/i })
    expect(within(protocolGroup).getByRole('button', { name: /^all$/i }).className).toMatch(/bg-white/)
    expect(within(protocolGroup).getByRole('button', { name: /^torrent$/i }).className).toMatch(/bg-white/)
    expect(within(protocolGroup).getByRole('button', { name: /^usenet$/i }).className).toMatch(/bg-white/)
    expect(within(protocolGroup).queryByRole('button', { name: /^Sync$/i })).not.toBeInTheDocument()

    const heading = screen.getByRole('heading', { name: 'Indexers' })
    expect(heading.className).toMatch(/text-center/)
    const syncBtn = screen.getByRole('button', { name: /^Sync$/i })
    expect(protocolGroup.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(heading.compareDocumentPosition(syncBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(syncBtn.className).toMatch(/bg-rose-500/)
    expect(syncBtn.className).toMatch(/rounded-xl/)
    expect(syncBtn.className).not.toMatch(/bg-white/)
    expect(screen.getByText('No indexers yet')).toBeInTheDocument()
    expect(screen.getByText(/Press Sync to pull indexers from Prowlarr/i)).toBeInTheDocument()
    expect(screen.getByRole('list', { name: /Indexer list/i })).toBeInTheDocument()

    expect(screen.getByRole('button', { name: /^Console$/i, pressed: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^PC$/i, pressed: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Movies$/i, pressed: false })).toBeInTheDocument()
    expect(screen.queryByText('1000')).not.toBeInTheDocument()
    expect(screen.queryByText('4000')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Category IDs/i)).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue(/1000/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Movies$/i }))
    await user.click(syncBtn)
    expect(syncProwlarr).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /^Save$/i }))
    await waitFor(() => expect(saveProwlarr).toHaveBeenCalled())
    expect(saveProwlarr.mock.calls[0][0].categories).toEqual([1000, 2000, 4000])
  })

  it('lists discovered Prowlarr indexers in an inner container', () => {
    mockGameServers = [{ id: 1, name: 'Node' }]
    mockUsenetConfig = { prowlarr: { host: '127.0.0.1', port: 9696 } }
    mockIndexers = [
      { id: 1, name: 'NZBGeek', protocol: 'usenet', enable: true },
      { id: 2, name: '1337x', protocol: 'torrent', enable: true },
    ]

    render(<ServerProwlarrSettingsModal serverId={1} serverName="Node" onClose={vi.fn()} />)

    const list = screen.getByRole('list', { name: /Indexer list/i })
    expect(within(list).getByText('NZBGeek')).toBeInTheDocument()
    expect(within(list).getByText('1337x')).toBeInTheDocument()
    expect(within(list).getByText('Usenet')).toBeInTheDocument()
    expect(within(list).getByText('Torrent')).toBeInTheDocument()
    expect(list).toHaveAttribute('aria-label', 'Indexer list, 2 indexers')
    expect(screen.getByRole('heading', { name: 'Indexers' }).className).toMatch(/text-center/)
    expect(screen.queryByText('No indexers yet')).not.toBeInTheDocument()
  })

  it('lists indexers from a successful sync response even if GET is empty', async () => {
    const user = userEvent.setup()
    mockGameServers = [{ id: 1, name: 'Node' }]
    mockUsenetConfig = { prowlarr: { host: '127.0.0.1', port: 9696 } }
    mockIndexers = []
    syncProwlarr.mockResolvedValueOnce({
      ok: true,
      message: 'Successfully synced 2 indexers',
      indexers: [
        { id: 1, name: 'NZBGeek', protocol: 'usenet', enable: true },
        { id: 2, name: '1337x', protocol: 'torrent', enable: true },
      ],
    })

    render(<ServerProwlarrSettingsModal serverId={1} serverName="Node" onClose={vi.fn()} />)
    expect(screen.getByText('No indexers yet')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Sync$/i }))
    await waitFor(() => expect(syncProwlarr).toHaveBeenCalled())

    const list = screen.getByRole('list', { name: /Indexer list/i })
    expect(within(list).getByText('NZBGeek')).toBeInTheDocument()
    expect(within(list).getByText('1337x')).toBeInTheDocument()
    expect(screen.queryByText('No indexers yet')).not.toBeInTheDocument()
  })

  it('filters the indexer well by protocol without syncing', async () => {
    const user = userEvent.setup()
    mockGameServers = [{ id: 1, name: 'Node' }]
    mockUsenetConfig = { prowlarr: { host: '127.0.0.1', port: 9696 } }
    mockIndexers = [
      { id: 1, name: 'NZBGeek', protocol: 'usenet', enable: true },
      { id: 2, name: '1337x', protocol: 'torrent', enable: true },
      { id: 3, name: 'DrunkenSlug', protocol: 'usenet', enable: true },
    ]

    render(<ServerProwlarrSettingsModal serverId={1} serverName="Node" onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /^torrent$/i }))
    expect(syncProwlarr).not.toHaveBeenCalled()
    expect(screen.getByText('1337x')).toBeInTheDocument()
    expect(screen.queryByText('NZBGeek')).not.toBeInTheDocument()
    expect(screen.queryByText('DrunkenSlug')).not.toBeInTheDocument()
    expect(screen.getByRole('list', { name: /1 indexer/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Sync$/i }))
    expect(syncProwlarr).toHaveBeenCalledWith('torrent')
  })

  it('puts Test connection in the footer of every service modal, not beside SSL', () => {
    mockGameServers = [{ id: 1, name: 'Node' }]
    mockUsenetConfig = {
      sabnzbd: { host: '127.0.0.1', port: 8080 },
      prowlarr: { host: '127.0.0.1', port: 9696 },
    }
    mockRadarrConfig = { host: '127.0.0.1', port: 7878 }
    mockSonarrConfig = { host: '127.0.0.1', port: 8989 }

    const modals = [
      ServerSabnzbdSettingsModal,
      ServerProwlarrSettingsModal,
      ServerRadarrSettingsModal,
      ServerSonarrSettingsModal,
    ]

    for (const Modal of modals) {
      const { unmount } = render(<Modal serverId={1} serverName="Node" onClose={vi.fn()} />)
      const testBtn = screen.getByRole('button', { name: /^Test connection$/i })
      const cancelBtn = screen.getByRole('button', { name: /^Cancel$/i })
      const saveBtn = screen.getByRole('button', { name: /^Save$/i })
      expect(testBtn.className).toMatch(/h-10/)
      expect(saveBtn.className).toMatch(/h-10/)
      expect(testBtn.className).toMatch(/bg-amber-400/)
      expect(testBtn.compareDocumentPosition(saveBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(cancelBtn.compareDocumentPosition(testBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(screen.getByRole('switch', { name: /Use SSL/i })).toBeInTheDocument()
      unmount()
    }
  })

  it('uses saved Prowlarr categories instead of the Console and PC default', () => {
    mockGameServers = [{ id: 1, name: 'Node' }]
    mockUsenetConfig = { prowlarr: { host: '127.0.0.1', port: 9696, categories: [2000, 5000] } }

    render(<ServerProwlarrSettingsModal serverId={1} serverName="Node" onClose={vi.fn()} />)

    expect(screen.getByRole('button', { name: /^Movies$/i, pressed: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^TV$/i, pressed: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Console$/i, pressed: false })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^PC$/i, pressed: false })).toBeInTheDocument()
  })

  it('shows Radarr library defaults inline and saves profile and folder', async () => {
    const user = userEvent.setup()
    mockGameServers = [{ id: 1, name: 'Node' }]
    mockRadarrConfig = { host: '127.0.0.1', port: 7878 }

    render(<ServerRadarrSettingsModal serverId={1} serverName="Node" onClose={vi.fn()} />)

    expect(screen.queryByText('Advanced')).not.toBeInTheDocument()
    expect(screen.getByText(/Quality Profile/i)).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    const profileTrigger = screen.getByLabelText(/Quality Profile/i)
    expect(profileTrigger.tagName).toBe('BUTTON')
    expect(screen.getByText('Quality Profile', { selector: 'label' }).className).toMatch(/pl-4/)

    await user.click(screen.getByRole('button', { name: /^Save$/i }))
    await waitFor(() => expect(saveRadarr).toHaveBeenCalled())
    const payload = saveRadarr.mock.calls[0][0]
    expect(payload.instances).toHaveLength(1)
    expect(payload.instances[0].quality_profile_id).toBe(1)
    expect(payload.instances[0].root_folder_path).toBe('/movies')
  })

  it('lets Radarr add, switch, and delete instances and persists the full list', async () => {
    const user = userEvent.setup()
    mockGameServers = [{ id: 1, name: 'Node' }]
    mockRadarrConfig = {
      enabled: true,
      host: '127.0.0.1',
      port: 7878,
      instances: [
        {
          id: 'default',
          name: 'Default',
          enabled: true,
          host: '127.0.0.1',
          port: 7878,
          api_key: 'one',
        },
        {
          id: 'uhd',
          name: '4K',
          enabled: true,
          host: '10.0.0.5',
          port: 7878,
          api_key: 'two',
        },
      ],
    }

    render(<ServerRadarrSettingsModal serverId={1} serverName="Node" onClose={vi.fn()} />)

    expect(screen.getByRole('tab', { name: /Default/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /4K/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/^Host/)).toHaveValue('127.0.0.1')

    for (const tab of screen.getAllByRole('tab')) {
      expect(tab.className).toMatch(/\bh-8\b/)
      expect(tab.className).toMatch(/\bp-2\b/)
      expect(tab.className).not.toMatch(/py-1\.5/)
      expect(tab.className).not.toMatch(/px-3/)
      const last = tab.children[tab.children.length - 1] as HTMLElement
      expect(last.className).toMatch(/rounded-full/)
    }

    expect(screen.getByLabelText(/Instance name/i)).toHaveValue('Default')

    await user.click(screen.getByRole('tab', { name: /4K/i }))
    expect(screen.getByLabelText(/^Host/)).toHaveValue('10.0.0.5')
    expect(screen.getByLabelText(/Instance name/i)).toHaveValue('4K')

    await user.clear(screen.getByLabelText(/Instance name/i))
    await user.type(screen.getByLabelText(/Instance name/i), 'UHD')

    await user.click(screen.getByRole('button', { name: /Add instance/i }))
    expect(screen.getByRole('tab', { name: /Instance 3/i })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /UHD/i }))
    await user.click(screen.getByRole('button', { name: /Delete UHD/i }))
    expect(screen.getByRole('heading', { name: /Delete UHD/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /UHD/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Delete$/i }))
    expect(screen.queryByRole('tab', { name: /UHD/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Save$/i }))
    await waitFor(() => expect(saveRadarr).toHaveBeenCalled())
    const payload = saveRadarr.mock.calls[0][0]
    expect(payload.instances.map((i: { name: string }) => i.name)).not.toContain('UHD')
    expect(payload.instances.map((i: { name: string }) => i.name)).not.toContain('4K')
    expect(payload.instances.length).toBeGreaterThanOrEqual(2)
  })

  it('does not delete the last remaining Radarr instance', async () => {
    const user = userEvent.setup()
    mockGameServers = [{ id: 1, name: 'Node' }]
    mockRadarrConfig = { host: '127.0.0.1', port: 7878 }

    render(<ServerRadarrSettingsModal serverId={1} serverName="Node" onClose={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /Delete/i })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Default/i })).toBeInTheDocument()
  })

  it('lets Sonarr add and switch instances and shows series extras inline', async () => {
    const user = userEvent.setup()
    mockGameServers = [{ id: 1, name: 'Node' }]
    mockSonarrConfig = {
      host: '127.0.0.1',
      port: 8989,
      instances: [
        { id: 'default', name: 'Default', enabled: true, host: '127.0.0.1', port: 8989 },
      ],
    }

    render(<ServerSonarrSettingsModal serverId={1} serverName="Node" onClose={vi.fn()} />)

    expect(screen.queryByText('Advanced')).not.toBeInTheDocument()
    expect(screen.getByText(/Series Type/i)).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Series Type/i).tagName).toBe('BUTTON')
    expect(screen.getByText('Series Type', { selector: 'label' }).className).toMatch(/pl-4/)

    const seasonSwitch = screen.getByRole('switch', { name: /Create season folders/i })
    for (const name of [/Quality Profile/i, /Root Folder/i, /Series Type/i]) {
      const field = screen.getByLabelText(name)
      expect(field.compareDocumentPosition(seasonSwitch) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }

    await user.click(screen.getByRole('button', { name: /Add instance/i }))
    expect(screen.getByRole('tab', { name: /Instance 2/i })).toBeInTheDocument()
  })

  it('refetches Radarr and Sonarr library dropdowns after a successful Test connection', async () => {
    const user = userEvent.setup()
    mockGameServers = [{ id: 1, name: 'Node' }]
    mockRadarrConfig = { host: '127.0.0.1', port: 7878 }
    mockSonarrConfig = { host: '127.0.0.1', port: 8989 }

    const { unmount } = render(<ServerRadarrSettingsModal serverId={1} serverName="Node" onClose={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /^Test connection$/i }))
    await waitFor(() => expect(testRadarr).toHaveBeenCalled())
    expect(testRadarr.mock.calls[0][0].instance_id).toBeTruthy()
    await waitFor(() => {
      expect(refetchRadarrProfiles).toHaveBeenCalled()
      expect(refetchRadarrFolders).toHaveBeenCalled()
    })
    unmount()

    render(<ServerSonarrSettingsModal serverId={1} serverName="Node" onClose={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /^Test connection$/i }))
    await waitFor(() => expect(testSonarr).toHaveBeenCalled())
    expect(testSonarr.mock.calls[0][0].instance_id).toBeTruthy()
    await waitFor(() => {
      expect(refetchSonarrProfiles).toHaveBeenCalled()
      expect(refetchSonarrFolders).toHaveBeenCalled()
    })
  })

  it('does not refetch library dropdowns when Test connection fails', async () => {
    const user = userEvent.setup()
    mockGameServers = [{ id: 1, name: 'Node' }]
    mockRadarrConfig = { host: '127.0.0.1', port: 7878 }
    testRadarr.mockResolvedValueOnce({ ok: false, message: 'offline' })

    render(<ServerRadarrSettingsModal serverId={1} serverName="Node" onClose={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /^Test connection$/i }))
    await waitFor(() => expect(testRadarr).toHaveBeenCalled())
    expect(refetchRadarrProfiles).not.toHaveBeenCalled()
    expect(refetchRadarrFolders).not.toHaveBeenCalled()
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    mockGameServers = [{ id: 1, name: 'Node' }]
    const onClose = vi.fn()
    render(<ServerSabnzbdSettingsModal serverId={1} serverName="Node" onClose={onClose} />)

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
