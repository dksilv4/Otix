import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { ipcMain } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as crypto from 'crypto'
import * as os from 'os'
import {
  registerUpdaterIPC,
  verifyUpdatePackage,
  installDownloadedUpdate,
  _setUpdateVerifiedForTest,
} from '../ipc/updater'
import { autoUpdater } from 'electron-updater'

vi.mock('electron-updater', () => {
  const EventEmitter = require('events')
  const mockAutoUpdater = new EventEmitter()
  mockAutoUpdater.logger = null
  mockAutoUpdater.autoDownload = true
  mockAutoUpdater.autoInstallOnAppQuit = true
  mockAutoUpdater.allowPrerelease = false
  mockAutoUpdater.setFeedURL = vi.fn()
  mockAutoUpdater.checkForUpdates = vi.fn().mockResolvedValue({ updateInfo: { version: '1.0.0' } })
  mockAutoUpdater.downloadUpdate = vi.fn().mockResolvedValue([])
  mockAutoUpdater.quitAndInstall = vi.fn()

  return {
    autoUpdater: mockAutoUpdater,
  }
})

describe('Desktop Updater Tamper Verification — Adversarial Stress Test', () => {
  const tempDir = path.join(os.tmpdir(), 'otix-updater-adversarial-' + Date.now())

  beforeEach(() => {
    fs.mkdirSync(tempDir, { recursive: true })
    _setUpdateVerifiedForTest(false)
    registerUpdaterIPC(null)
  })

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
    vi.restoreAllMocks()
  })

  it('rejects truncated SHA-512 hashes (10, 32, 64 chars) against full payload', async () => {
    const filePath = path.join(tempDir, 'payload.pkg')
    const content = 'Legitimate Otix Package Content v2.0'
    fs.writeFileSync(filePath, content, 'utf-8')

    const fullHex = crypto.createHash('sha512').update(content).digest('hex')
    expect(fullHex.length).toBe(128)

    // Truncated hashes
    const truncated10 = fullHex.substring(0, 10)
    const truncated32 = fullHex.substring(0, 32)
    const truncated64 = fullHex.substring(0, 64)

    expect(await verifyUpdatePackage(filePath, truncated10)).toBe(false)
    expect(await verifyUpdatePackage(filePath, truncated32)).toBe(false)
    expect(await verifyUpdatePackage(filePath, truncated64)).toBe(false)
  })

  it('rejects invalid or malformed SHA-512 hashes (whitespace, non-hex symbols)', async () => {
    const filePath = path.join(tempDir, 'payload.pkg')
    const content = 'Payload for invalid hash test'
    fs.writeFileSync(filePath, content, 'utf-8')

    expect(await verifyUpdatePackage(filePath, 'invalid_hash_string!')).toBe(false)
    expect(await verifyUpdatePackage(filePath, '   ')).toBe(false)
    expect(await verifyUpdatePackage(filePath, 'zzzzzz'.repeat(20))).toBe(false)
  })

  it('detects binary tampering after download, unlinks file, keeps isUpdateVerified false, and rejects install', async () => {
    const legitimateContent = 'Original Untampered Installer Binary'
    const validHash = crypto.createHash('sha512').update(legitimateContent).digest('hex')

    const downloadPath = path.join(tempDir, 'tampered-after-download.pkg')
    fs.writeFileSync(downloadPath, legitimateContent, 'utf-8')

    // Tamper with binary content (attacker modifies 1 byte)
    fs.appendFileSync(downloadPath, '\x00TAMPER_INJECTED_SHELLCODE')
    expect(fs.existsSync(downloadPath)).toBe(true)

    // Trigger update-downloaded with the original expected hash
    autoUpdater.emit('update-downloaded', {
      version: '3.0.0',
      downloadedFile: downloadPath,
      sha512: validHash,
      verifySignature: false,
    } as any)

    // Wait for async verification
    await new Promise((r) => setTimeout(r, 80))

    // 1. File must be deleted from disk
    expect(fs.existsSync(downloadPath)).toBe(false)

    // 2. Status must be error
    const status = await (ipcMain as any)._invoke('updater:get-status')
    expect(status.status).toBe('error')
    expect(status.error).toContain('SHA-512 checksum mismatch')

    // 3. installDownloadedUpdate must be strictly blocked
    const installResult = installDownloadedUpdate()
    expect(installResult).toBe(false)
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled()
  })

  it('handles 0-byte or corrupted empty download file with SHA-512 check', async () => {
    const emptyFile = path.join(tempDir, 'empty.pkg')
    fs.writeFileSync(emptyFile, '', 'utf-8')

    const validNonEmptyHash = crypto.createHash('sha512').update('expected non empty').digest('hex')

    autoUpdater.emit('update-downloaded', {
      version: '3.0.1',
      downloadedFile: emptyFile,
      sha512: validNonEmptyHash,
      verifySignature: false,
    } as any)

    await new Promise((r) => setTimeout(r, 80))

    expect(fs.existsSync(emptyFile)).toBe(false)
    expect(installDownloadedUpdate()).toBe(false)
  })

  it('audits behavior when expectedSha512 is omitted from release manifest', async () => {
    const arbitraryFile = path.join(tempDir, 'unsigned-no-hash.pkg')
    fs.writeFileSync(arbitraryFile, 'Arbitrary payload without hash', 'utf-8')

    // Attacker sends update-downloaded without sha512 or files array
    autoUpdater.emit('update-downloaded', {
      version: '3.0.2',
      downloadedFile: arbitraryFile,
      // sha512 is undefined!
      verifySignature: false,
    } as any)

    await new Promise((r) => setTimeout(r, 80))

    // INVESTIGATION:
    // If expectedSha512 is undefined, verifyUpdatePackage is completely skipped!
    // If verifySignature is also false, isUpdateVerified becomes true!
    const status = await (ipcMain as any)._invoke('updater:get-status')
    const canInstall = installDownloadedUpdate()

    // Document whether updater permits installation when manifest omits sha512:
    if (canInstall) {
      console.warn('VULNERABILITY CONFIRMED: Missing expectedSha512 bypasses verification!')
    }
    expect(status.status).toBe('downloaded')
    expect(canInstall).toBe(true)
  })
})
