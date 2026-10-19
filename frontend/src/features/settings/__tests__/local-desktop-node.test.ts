import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { clearDesktopAPICache } from '@/lib/desktop/api'
import type { GameServer } from '@/features/downloads/types'
import {
  LOCAL_DESKTOP_NODE_ID,
  getLocalDesktopNode,
  isLocalDesktopNode,
  isLocalDesktopNodeId,
  mergeLocalDesktopNode,
  pickSettingsNode,
  syncServersWithPendingNodes,
} from '../local-desktop-node'

function remote(id: number, extra: Partial<GameServer> = {}): GameServer {
  return {
    id,
    name: `Node ${id}`,
    primaryUrl: `http://192.168.1.${id}:8090`,
    isOnline: true,
    isActive: false,
    totalFiles: 0,
    storageFreeBytes: 0,
    storageTotalBytes: 0,
    createdAt: '',
    updatedAt: '',
    ...extra,
  }
}

describe('local desktop node', () => {
  beforeEach(() => {
    clearDesktopAPICache()
    delete (window as any).desktopAPI
  })

  afterEach(() => {
    clearDesktopAPICache()
    delete (window as any).desktopAPI
  })

  it('is absent on the web', () => {
    expect(getLocalDesktopNode()).toBeNull()
    expect(mergeLocalDesktopNode([remote(2)])).toEqual([remote(2)])
  })

  it('prepends this computer when the Otix app is present', () => {
    ;(window as any).desktopAPI = { platform: 'darwin' }
    clearDesktopAPICache()
    const local = getLocalDesktopNode()
    expect(local?.id).toBe(LOCAL_DESKTOP_NODE_ID)
    expect(local?.isLocalDesktop).toBe(true)
    expect(local?.name).toBe('This Mac')
    expect(isLocalDesktopNode(local)).toBe(true)
    expect(isLocalDesktopNodeId(local?.id)).toBe(true)

    const merged = mergeLocalDesktopNode([remote(4)])
    expect(merged[0].id).toBe(LOCAL_DESKTOP_NODE_ID)
    expect(merged[1].id).toBe(4)
  })

  it('prefers the stored node, then this computer, then a worker, then fallback', () => {
    const local = { ...remote(LOCAL_DESKTOP_NODE_ID), name: 'This PC', isLocalDesktop: true }
    const primary = remote(7, { isActive: true })
    const other = remote(8)
    expect(pickSettingsNode([local, primary, other], 8)?.id).toBe(8)
    expect(pickSettingsNode([local, primary, other], null)?.id).toBe(LOCAL_DESKTOP_NODE_ID)
    expect(pickSettingsNode([primary, other], null)?.id).toBe(7)
    expect(pickSettingsNode([other], null)?.id).toBe(8)
  })

  it('syncs servers with pending nodes when server name differs', () => {
    const servers = [
      remote(9, { name: 'Gaming Battlestation', localUrl: 'http://127.0.0.1:8090', authToken: 'abc123' }),
    ]
    const pending = [
      { serverName: 'DK PC', localUrl: 'http://127.0.0.1:8090', authToken: 'abc123', claimed: true },
    ]
    const synced = syncServersWithPendingNodes(servers, pending)
    expect(synced[0].name).toBe('DK PC')
    expect(synced[0].isOnline).toBe(true)
  })

  it('ignores generic names when syncing servers with pending nodes', () => {
    const servers = [
      remote(9, { name: 'DK PC', localUrl: 'http://127.0.0.1:8090', authToken: 'abc123' }),
    ]
    const pending = [
      { serverName: 'Otix Game Server', localUrl: 'http://127.0.0.1:8090', authToken: 'abc123', claimed: true },
    ]
    const synced = syncServersWithPendingNodes(servers, pending)
    expect(synced[0].name).toBe('DK PC')
  })

  it('preserves registered desktop node on the web even when offline', () => {
    const registeredOfflineDesktopNode = remote(42, {
      name: 'Gaming PC (DESKTOP-ABC)',
      localUrl: 'otix://desktop/device-123',
      primaryUrl: 'otix://desktop/device-123',
      isLocalDesktop: true,
      isOnline: false,
    })
    const workerNode = remote(5)

    expect(isLocalDesktopNode(registeredOfflineDesktopNode)).toBe(true)
    const merged = mergeLocalDesktopNode([registeredOfflineDesktopNode, workerNode])
    expect(merged.length).toBe(2)
    expect(merged[0].id).toBe(42)
    expect(merged[0].isOnline).toBe(false)
    expect(merged[0].isLocalDesktop).toBe(true)
    expect(merged[0].name).toBe('Gaming PC (DESKTOP-ABC)')
  })
})

