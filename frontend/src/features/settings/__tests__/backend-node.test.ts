import { describe, expect, it } from 'vitest'
import {
  BACKEND_NODE_ID,
  isBackendNode,
  isBackendNodeId,
  mergeBackendNode,
} from '../backend-node'
import { LOCAL_DESKTOP_NODE_ID } from '../local-desktop-node'
import type { GameServer } from '@/features/downloads/types'

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

describe('backend node', () => {
  it('identifies the legacy Otix backend id', () => {
    expect(isBackendNodeId(BACKEND_NODE_ID)).toBe(true)
    expect(isBackendNodeId(LOCAL_DESKTOP_NODE_ID)).toBe(false)
    expect(isBackendNode({ id: BACKEND_NODE_ID })).toBe(true)
    expect(isBackendNode({ isBackend: true })).toBe(true)
    expect(isBackendNode(remote(1))).toBe(false)
  })

  it('does not inject the backend node into the servers list', () => {
    const servers = [remote(4)]
    const merged = mergeBackendNode(servers)
    expect(merged).toEqual(servers)
    expect(merged.some((s) => s.id === BACKEND_NODE_ID)).toBe(false)
  })
})
