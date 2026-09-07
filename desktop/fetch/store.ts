// desktop/fetch/store.ts
// Durable per-provider key store + stable install device_id for the proxy-fetch
// client (Phase 2.2b). Backs onto one small JSON file under userData
// (fetch-client.json). The device_id is minted once and reused across restarts
// so the backend's ClientDevice row stays the same device across the desktop
// app's lifetime. Provider keys are opaque per-name maps ({ tmdb: { token },
// igdb: { client_id, client_secret } }); mirrorability/advertising is decided
// upstream by providers.ts, not here. Writes are atomic (tmp + rename) and a
// persist failure is non-fatal for the session, mirroring desktop-settings.ts.

import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { ProviderKeys } from './types'

export interface FetchClientStoreData {
  deviceId: string
  providers: ProviderKeys
}

export class FetchClientStore {
  private readonly filePath: string
  private data: FetchClientStoreData

  constructor(filePath: string) {
    this.filePath = filePath
    this.data = this._load()
  }

  get deviceId(): string {
    return this.data.deviceId
  }

  /** Snapshot of every persisted provider key map (copy, not a live ref). */
  get providers(): ProviderKeys {
    const out: ProviderKeys = {}
    for (const [provider, keys] of Object.entries(this.data.providers)) {
      out[provider] = { ...keys }
    }
    return out
  }

  /** Persist a provider's keys; pass undefined/empty to drop the provider. */
  setProvider(provider: string, keys: Record<string, string> | undefined): void {
    if (keys === undefined || Object.keys(keys).length === 0) {
      delete this.data.providers[provider]
    } else {
      this.data.providers[provider] = { ...keys }
    }
    this._save()
  }

  private _load(): FetchClientStoreData {
    let raw: string
    try {
      raw = fs.readFileSync(this.filePath, 'utf-8')
    } catch {
      const fresh: FetchClientStoreData = { deviceId: randomUUID(), providers: {} }
      this._write(fresh)
      return fresh
    }
    try {
      const parsed = JSON.parse(raw) as Partial<FetchClientStoreData>
      return {
        deviceId:
          typeof parsed.deviceId === 'string' && parsed.deviceId !== ''
            ? parsed.deviceId
            : randomUUID(),
        providers:
          parsed.providers && typeof parsed.providers === 'object' ? parsed.providers : {},
      }
    } catch {
      // Corrupt file: start fresh rather than crash the main process.
      const fresh: FetchClientStoreData = { deviceId: randomUUID(), providers: {} }
      this._write(fresh)
      return fresh
    }
  }

  private _save(): void {
    this._write(this.data)
  }

  private _write(data: FetchClientStoreData): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
      const tmp = `${this.filePath}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
      fs.renameSync(tmp, this.filePath)
    } catch (err) {
      console.error('[fetch-client] Failed to persist fetch-client.json:', err)
    }
  }
}
