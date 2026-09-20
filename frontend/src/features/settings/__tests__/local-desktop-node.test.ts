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

  it('prefers the stored node, then this computer, then a worker, then the backend', () => {
    const local = { ...remote(LOCAL_DESKTOP_NODE_ID), name: 'This PC', isLocalDesktop: true }
    const backend = { ...remote(-2), name: 'Otix backend', isBackend: true }
    const primary = remote(7, { isActive: true })
    const other = remote(8)
    expect(pickSettingsNode([local, backend, primary, other], 8)?.id).toBe(8)
    expect(pickSettingsNode([local, backend, primary, other], null)?.id).toBe(LOCAL_DESKTOP_NODE_ID)
    expect(pickSettingsNode([backend, primary, other], null)?.id).toBe(7)
    expect(pickSettingsNode([backend], null)?.id).toBe(-2)
  })
})
