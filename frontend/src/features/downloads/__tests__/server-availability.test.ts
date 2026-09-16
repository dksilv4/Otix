import { describe, expect, it } from 'vitest'
import {
  findCompletedServerDownload,
  matchServerGameFile,
  serverInstallCaption,
  completedDownloadKey,
} from '../server-availability'
import type { ServerGameFile } from '../types'
import type { ServerDownloadHistoryItem } from '../usenet-types'

function file(partial: Partial<ServerGameFile> & Pick<ServerGameFile, 'fileId' | 'filename' | 'gameTitle'>): ServerGameFile {
  return {
    serverId: 1,
    serverName: 'Home NAS',
    serverUrl: 'http://127.0.0.1:8090',
    filesize: 1_000,
    extension: '.iso',
    formatCategory: 'iso',
    libraryName: 'Downloads',
    downloadUrl: 'http://127.0.0.1:8090/api/v1/files/x/download',
    ...partial,
  }
}

function history(partial: Partial<ServerDownloadHistoryItem> & Pick<ServerDownloadHistoryItem, 'nzo_id' | 'title'>): ServerDownloadHistoryItem {
  return {
    id: 1,
    protocol: 'usenet',
    status: 'completed',
    percentage: 100,
    size_bytes: 1,
    ...partial,
  }
}

describe('matchServerGameFile', () => {
  it('matches by catalog id first', () => {
    const files = [
      file({ fileId: 'a', filename: 'Other.iso', gameTitle: 'Other', catalogItem: { id: '1', title: 'Other', slug: 'other' } }),
      file({ fileId: 'b', filename: 'Elden.iso', gameTitle: 'Elden Ring', catalogItem: { id: '42', title: 'Elden Ring', slug: 'elden-ring' } }),
    ]
    expect(matchServerGameFile(files, '42', 'Wrong Title')?.fileId).toBe('b')
  })

  it('matches scene filenames against the catalog title', () => {
    const files = [
      file({
        fileId: 'hk',
        filename: 'Hollow_Knight_Silksong_Early_Build.iso',
        gameTitle: 'Hollow Knight Silksong Early Build',
      }),
    ]
    expect(matchServerGameFile(files, undefined, 'Hollow Knight: Silksong')?.fileId).toBe('hk')
  })

  it('prefers the base game file over a matching update', () => {
    const files = [
      file({
        fileId: 'upd',
        filename: 'Elden.Ring.Update.1.12-FLT.iso',
        gameTitle: 'Elden Ring Update 1 12',
        catalogItem: { id: '42', title: 'Elden Ring', slug: 'elden-ring' },
      }),
      file({
        fileId: 'base',
        filename: 'Elden.Ring-RUNE.iso',
        gameTitle: 'Elden Ring',
        catalogItem: { id: '42', title: 'Elden Ring', slug: 'elden-ring' },
      }),
    ]
    expect(matchServerGameFile(files, '42', 'Elden Ring')?.fileId).toBe('base')
  })
})

describe('findCompletedServerDownload', () => {
  it('prefers a completed row with the same media id', () => {
    const items = [
      history({ nzo_id: 'other', title: 'Portal', media_item_id: '9', status: 'completed' }),
      history({ nzo_id: 'hit', title: 'Elden.Ring-RUNE', media_item_id: '42', status: 'completed' }),
      history({ nzo_id: 'failed', title: 'Elden Ring', media_item_id: '42', status: 'failed' }),
    ]
    expect(findCompletedServerDownload(items, '42', 'Elden Ring')?.nzo_id).toBe('hit')
  })

  it('falls back to title matching when media id is missing', () => {
    const items = [
      history({ nzo_id: 'hk', title: 'Hollow.Knight.Silksong.Early.Build-GROUP', status: 'completed' }),
    ]
    expect(findCompletedServerDownload(items, undefined, 'Hollow Knight: Silksong')?.nzo_id).toBe('hk')
  })

  it('ignores queued and cancelled rows', () => {
    const items = [
      history({ nzo_id: 'q', title: 'Elden Ring', media_item_id: '42', status: 'queued' }),
      history({ nzo_id: 'c', title: 'Elden Ring', media_item_id: '42', status: 'cancelled' }),
    ]
    expect(findCompletedServerDownload(items, '42', 'Elden Ring')).toBeNull()
  })

  it('matches camelCase history rows from the API client', () => {
    const items = [
      {
        id: 2,
        nzoId: 'camel',
        title: 'Elden Ring',
        protocol: 'usenet',
        status: 'completed',
        percentage: 100,
        sizeBytes: 10,
        mediaItemId: '42',
      },
    ] as unknown as ServerDownloadHistoryItem[]
    const hit = findCompletedServerDownload(items, '42', 'Elden Ring')
    expect(completedDownloadKey(hit)).toBe('camel')
  })
})

describe('serverInstallCaption', () => {
  it('labels an indexed server file as Install on that server', () => {
    const copy = serverInstallCaption({
      serverName: 'Home NAS',
      filesize: 1024,
      indexed: true,
      formatBytes: () => '1 KB',
    })
    expect(copy.button).toBe('Install')
    expect(copy.caption).toBe('On Home NAS · 1 KB')
    expect(copy.title).toContain('not installed on this device')
  })

  it('labels a completed download that is not indexed yet as ready on the server', () => {
    const copy = serverInstallCaption({ serverName: 'Home NAS', indexed: false })
    expect(copy.button).toBe('Install')
    expect(copy.caption).toBe('Ready on Home NAS')
  })
})
