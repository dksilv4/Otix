import { describe, expect, it } from 'vitest'
import type { GameServer } from '../../types'
import {
  connectionSyncLabel,
  pickConnectionNode,
  remoteConnectionNodes,
  workerConnectionNodes,
} from '../use-integration-target-server'

function node(id: number, extra: Partial<GameServer> = {}): GameServer {
  return {
    id,
    name: extra.name || `Node ${id}`,
    primaryUrl: extra.primaryUrl || `http://10.0.0.${Math.abs(id)}:8090`,
    isOnline: extra.isOnline ?? true,
    isActive: extra.isActive ?? false,
    totalFiles: 0,
    storageFreeBytes: 0,
    storageTotalBytes: 0,
    createdAt: '',
    updatedAt: '',
    ...extra,
  }
}

describe('connection target nodes', () => {
  const backend = node(-2, { name: 'Otix backend' })
  const desktop = node(-1, { name: 'This computer', isLocalDesktop: true })
  const worker = node(4, { name: 'Home NAS' })

  it('filters to remote worker nodes only, excluding desktop and negative ids', () => {
    const remotes = remoteConnectionNodes([desktop, backend, worker])
    expect(remotes.map((server) => server.id)).toEqual([4])
    expect(workerConnectionNodes([desktop, backend, worker]).map((server) => server.id)).toEqual([4])
  })

  it('prefers preferred node or first online worker', () => {
    const worker2 = node(5, { name: 'Backup NAS', isOnline: true })
    expect(pickConnectionNode([worker, worker2])?.id).toBe(4)
    expect(pickConnectionNode([worker, worker2], 5)?.id).toBe(5)
  })

  it('labels the selected node rather than claiming a sync fan-out', () => {
    expect(connectionSyncLabel([worker], 'Home NAS')).toBe('On Home NAS')
    expect(connectionSyncLabel([])).toBe('Select an Otix node')
  })
})
