import { afterEach, describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { FetchClientStore } from '../store'

const files: string[] = []
function tmpStore(): string {
  const file = path.join(os.tmpdir(), `otix-fetch-store-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`)
  files.push(file)
  return file
}

afterEach(() => {
  for (const file of files.splice(0)) {
    try {
      fs.rmSync(file, { force: true })
      fs.rmSync(`${file}.tmp`, { force: true })
    } catch {}
  }
})

describe('FetchClientStore', () => {
  it('mints a stable device_id persisted across reloads', () => {
    const file = tmpStore()
    const first = new FetchClientStore(file)
    expect(first.deviceId).toMatch(/^[0-9a-f-]{36}$/)
    const second = new FetchClientStore(file)
    expect(second.deviceId).toBe(first.deviceId)
  })

  it('starts empty and persists provider keys, merging per provider', () => {
    const file = tmpStore()
    const store = new FetchClientStore(file)
    expect(store.providers).toEqual({})

    store.setProvider('igdb', { client_id: 'cid', client_secret: 'sec' })
    store.setProvider('tmdb', { token: 'tok' })
    expect(store.providers).toEqual({
      igdb: { client_id: 'cid', client_secret: 'sec' },
      tmdb: { token: 'tok' },
    })

    // Reload from disk: keys + device_id survive.
    const reloaded = new FetchClientStore(file)
    expect(reloaded.deviceId).toBe(store.deviceId)
    expect(reloaded.providers).toEqual({
      igdb: { client_id: 'cid', client_secret: 'sec' },
      tmdb: { token: 'tok' },
    })
  })

  it('drops a provider when cleared with undefined or empty keys', () => {
    const file = tmpStore()
    const store = new FetchClientStore(file)
    store.setProvider('igdb', { client_id: 'cid', client_secret: 'sec' })
    store.setProvider('igdb', undefined)
    expect(store.providers).toEqual({})

    store.setProvider('igdb', { client_id: 'cid', client_secret: 'sec' })
    store.setProvider('igdb', {})
    expect(store.providers).toEqual({})
  })

  it('returns a copy so callers cannot mutate the live map', () => {
    const file = tmpStore()
    const store = new FetchClientStore(file)
    store.setProvider('igdb', { client_id: 'cid', client_secret: 'sec' })
    const snapshot = store.providers
    snapshot.igdb!.client_secret = 'mutated'
    expect(store.providers.igdb!.client_secret).toBe('sec')
  })
})
