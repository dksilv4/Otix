import { describe, expect, it } from 'vitest'
import {
  BACKEND_NODE_ID,
  getBackendNode,
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
  it('identifies the reserved Otix backend id', () => {
    const node = getBackendNode()
    expect(node.id).toBe(BACKEND_NODE_ID)
    expect(node.isBackend).toBe(true)
    expect(isBackendNode(node)).toBe(true)
    expect(isBackendNodeId(BACKEND_NODE_ID)).toBe(true)
    expect(isBackendNodeId(LOCAL_DESKTOP_NODE_ID)).toBe(false)
  })

  it('prepends the backend when the list does not already include it', () => {
    const merged = mergeBackendNode([remote(4)])
    expect(merged[0].id).toBe(BACKEND_NODE_ID)
    expect(merged[1].id).toBe(4)
    expect(mergeBackendNode(merged)).toEqual(merged)
  })
})
