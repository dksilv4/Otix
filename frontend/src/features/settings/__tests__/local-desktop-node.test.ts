import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { clearDesktopAPICache } from '@/lib/desktop/api'
import type { GameServer } from '@/features/downloads/types'
import {
  registerLocalDesktopNodeId,
  isLocalDesktopNode,
  isLocalDesktopNodeId,
  localDesktopNodeName,
  findLocalDesktopNode,
  isBrowserSessionNode,
  isVirtualDesktopNode,
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
    localStorage.clear()
  })

  afterEach(() => {
    clearDesktopAPICache()
    delete (window as any).desktopAPI
    localStorage.clear()
  })

  it('handles remote nodes cleanly without synthetic fallback nodes', () => {
    expect(mergeLocalDesktopNode([remote(2)])).toEqual([remote(2)])
  })

  it('identifies and registers real local desktop nodes by flag, loopback, or id', () => {
    ;(window as any).desktopAPI = { platform: 'darwin' }
    clearDesktopAPICache()

    const localServer = remote(1, { isLocalDesktop: true, localUrl: 'http://127.0.0.1:8090' })
    const workerServer = remote(4)

    expect(isLocalDesktopNode(localServer)).toBe(true)
    expect(isLocalDesktopNodeId(1)).toBe(true)
    expect(isLocalDesktopNode(workerServer)).toBe(false)
    expect(isLocalDesktopNodeId(4)).toBe(false)

    // Negative and zero IDs are never valid local desktop nodes
    expect(isLocalDesktopNodeId(-1)).toBe(false)
    expect(isLocalDesktopNodeId(0)).toBe(false)
    expect(isLocalDesktopNodeId(null)).toBe(false)

    // findLocalDesktopNode finds the matching local node
    const found = findLocalDesktopNode([workerServer, localServer])
    expect(found).toBe(localServer)
    expect(findLocalDesktopNode([workerServer])).toBeNull()

    // Test localDesktopNodeName on darwin
    expect(localDesktopNodeName()).toBe('This Mac')

    // Merging registers real node and returns list unchanged
    const merged = mergeLocalDesktopNode([localServer, workerServer])
    expect(merged).toHaveLength(2)
    expect(merged[0].id).toBe(1)
    expect(merged[1].id).toBe(4)
  })

  it('prefers the stored node, then local desktop node, then active, then online, then first', () => {
    const local = remote(1, { name: 'This PC', isLocalDesktop: true, isOnline: true })
    const primary = remote(7, { isActive: true })
    const other = remote(8)

    // Explicit preference takes priority
    expect(pickSettingsNode([local, primary, other], 8)?.id).toBe(8)
    // When no preference stored, picks local desktop node
    expect(pickSettingsNode([local, primary, other], null)?.id).toBe(1)
    // When no local node, picks active node
    expect(pickSettingsNode([primary, other], null)?.id).toBe(7)
    // Fallback to first available
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
      localUrl: 'http://192.168.1.100:8090',
      primaryUrl: 'http://192.168.1.100:8090',
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

  it('prunes virtual otix:// desktop nodes so they do not duplicate real nodes', () => {
    const virtualNode = remote(98, {
      name: 'This PC (Virtual)',
      localUrl: 'otix://desktop/device-123',
      primaryUrl: 'otix://desktop/device-123',
      isLocalDesktop: true,
    })
    const realDesktopNode = remote(1, {
      name: 'This PC',
      localUrl: 'http://127.0.0.1:8090',
      isLocalDesktop: true,
    })
    const workerNode = remote(2)

    expect(isVirtualDesktopNode(virtualNode)).toBe(true)
    expect(isVirtualDesktopNode(realDesktopNode)).toBe(false)

    const result = mergeLocalDesktopNode([virtualNode, realDesktopNode, workerNode])
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe(1)
    expect(result[1].id).toBe(2)
  })

  it('filters out browser session nodes so browser tabs do not appear as nodes', () => {
    const chromeNode = remote(99, {
      name: 'Chrome on Windows',
      isLocalDesktop: true,
      localUrl: 'otix://desktop/dev-random-123',
    })
    const edgeNode = remote(100, {
      name: 'Edge on Windows',
      isLocalDesktop: true,
      localUrl: 'otix://desktop/dev-random-456',
    })
    const realWorker = remote(2, { name: 'TrueNAS Worker' })

    expect(isBrowserSessionNode(chromeNode)).toBe(true)
    expect(isBrowserSessionNode(edgeNode)).toBe(true)
    expect(isBrowserSessionNode(realWorker)).toBe(false)

    const result = mergeLocalDesktopNode([chromeNode, edgeNode, realWorker])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(2)
    expect(result[0].name).toBe('TrueNAS Worker')
  })
})
