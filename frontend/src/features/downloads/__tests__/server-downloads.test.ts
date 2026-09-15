import { describe, it, expect, vi } from 'vitest'
import { serverKeys } from '../use-server-downloads'
import type { RemoteDownloadProgress } from '@/lib/desktop/api'

describe('serverKeys', () => {
  it('generates consistent query keys', () => {
    expect(serverKeys.all).toEqual(['game-servers'])
    expect(serverKeys.lists()).toEqual(['game-servers', 'list'])
    expect(serverKeys.games()).toEqual(['game-servers', 'games'])
  })
})

describe('RemoteDownloadProgress data contract', () => {
  it('correctly models download progress fields', () => {
    const progress: RemoteDownloadProgress = {
      id: 'dl-123',
      serverUrl: 'http://192.168.1.100:8001',
      fileId: 'file-abc',
      filename: 'Half-Life 2.iso',
      gameTitle: 'Half-Life 2',
      mediaItemId: 'media-456',
      totalBytes: 4_500_000_000,
      downloadedBytes: 2_250_000_000,
      percentage: 50,
      speedBytesPerSec: 15_000_000,
      speedMBps: 15.0,
      etaSeconds: 150,
      status: 'downloading',
    }

    expect(progress.id).toBe('dl-123')
    expect(progress.percentage).toBe(50)
    expect(progress.status).toBe('downloading')
    expect(progress.speedMBps).toBe(15.0)
    expect(progress.etaSeconds).toBe(150)
  })
})
