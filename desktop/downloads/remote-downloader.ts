import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import { EventEmitter } from 'events';
import { getDb } from '../db';
import { GamesRepository } from '../db/repositories/games';
import {
  createDownload,
  updateDownloadStatus,
  updateDownloadIsoPath,
  deleteDownload,
  getConfig,
  type Download,
} from './index';
import { getSettings } from '../desktop-settings';
import type {
  RemoteDownloadOptions,
  RemoteDownloadProgress,
  ActiveTransfer,
} from './types';

export type { RemoteDownloadOptions, RemoteDownloadProgress };

export class RemoteDownloadManager extends EventEmitter {
  private activeTransfers = new Map<string, ActiveTransfer>();
  private progressInterval: ReturnType<typeof setInterval> | null = null;
  private dbInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    this.startProgressTicker();
  }

  private startProgressTicker(): void {
    if (this.progressInterval) return;

    this.progressInterval = setInterval(() => {
      const now = Date.now();
      for (const [id, t] of this.activeTransfers.entries()) {
        if (t.status === 'downloading') {
          const deltaBytes = t.bytesDownloaded - t.lastTickBytes;
          const deltaTimeSec = (now - t.lastTickTime) / 1000;
          if (deltaTimeSec > 0.3) {
            t.speedBytesPerSec = Math.max(0, Math.round(deltaBytes / deltaTimeSec));
            const remainingBytes = Math.max(0, t.totalBytes - t.bytesDownloaded);
            t.etaSeconds = t.speedBytesPerSec > 0 ? Math.round(remainingBytes / t.speedBytesPerSec) : 0;
            t.lastTickBytes = t.bytesDownloaded;
            t.lastTickTime = now;
          }
          this.emitProgress(id);
        }
      }
    }, 500);

    // Sync progress to SQLite DB every 2.5 seconds
    this.dbInterval = setInterval(() => {
      for (const [id, t] of this.activeTransfers.entries()) {
        if (t.status === 'downloading') {
          const pct = t.totalBytes > 0 ? Math.min(99, Math.floor((t.bytesDownloaded / t.totalBytes) * 100)) : 0;
          try {
            updateDownloadStatus(id, 'downloading', undefined, pct);
          } catch {}
        }
      }
    }, 2500);
  }

  private emitProgress(id: string): void {
    const t = this.activeTransfers.get(id);
    if (!t) return;

    const pct = t.totalBytes > 0 ? Math.min(100, Math.floor((t.bytesDownloaded / t.totalBytes) * 100)) : 0;
    const progress: RemoteDownloadProgress = {
      id,
      status: t.status,
      gameTitle: t.options.gameTitle,
      filename: t.options.filename,
      bytesDownloaded: t.bytesDownloaded,
      totalBytes: t.totalBytes,
      percentage: pct,
      speedBytesPerSec: t.speedBytesPerSec,
      etaSeconds: t.etaSeconds,
      isoPath: t.status === 'completed' ? t.finalPath : undefined,
      error: t.error,
      serverUrl: t.options.serverUrl,
      fileId: t.options.fileId,
    };
    this.emit('progress', progress);
  }

  async startDownload(options: RemoteDownloadOptions): Promise<string> {
    const config = await getConfig();
    const desktopSettings = getSettings();
    const downloadDir =
      options.destDir ||
      desktopSettings?.gamesDownloadPath ||
      config?.downloadPath ||
      path.join(process.env.HOME || process.env.USERPROFILE || '.', 'Downloads', 'Games');

    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }

    const finalPath = path.join(downloadDir, options.filename);
    const partPath = path.join(downloadDir, `${options.filename}.otixpart`);

    let existingBytes = 0;
    if (fs.existsSync(partPath)) {
      try {
        existingBytes = fs.statSync(partPath).size;
      } catch {
        existingBytes = 0;
      }
    }

    const userId = options.userId || 'default';
    const downloadUrl =
      options.downloadUrl ||
      `${options.serverUrl.replace(/\/$/, '')}/api/v1/files/${options.fileId}/download`;

    // Create or retrieve DB entry
    const dlRow = await createDownload(
      userId,
      options.mediaItemId || null,
      options.gameTitle,
      options.filename,
      options.filesize,
      downloadUrl,
      null,
      'server',
    );
    const downloadId = dlRow.id;

    const transfer: ActiveTransfer = {
      options: { ...options, id: downloadId },
      status: 'downloading',
      bytesDownloaded: existingBytes,
      totalBytes: options.filesize,
      speedBytesPerSec: 0,
      etaSeconds: 0,
      partPath,
      finalPath,
      req: null,
      fileStream: null,
      lastTickBytes: existingBytes,
      lastTickTime: Date.now(),
    };

    this.activeTransfers.set(downloadId, transfer);
    this.executeStream(downloadId);
    return downloadId;
  }

  private executeStream(downloadId: string): void {
    const t = this.activeTransfers.get(downloadId);
    if (!t || t.status !== 'downloading') return;

    const downloadUrl =
      t.options.downloadUrl ||
      `${t.options.serverUrl.replace(/\/$/, '')}/api/v1/files/${t.options.fileId}/download`;
    const urlObj = new URL(downloadUrl);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;

    const headers: Record<string, string> = {};
    if (t.options.authToken) {
      headers['Authorization'] = `Bearer ${t.options.authToken}`;
    }

    if (t.bytesDownloaded > 0) {
      headers['Range'] = `bytes=${t.bytesDownloaded}-`;
    }

    const req = client.get(
      urlObj,
      {
        headers,
        timeout: 20000,
      },
      (res: http.IncomingMessage) => {
        // Redirect support
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          // Update URL and retry
          try {
            const redirectedUrl = new URL(res.headers.location, urlObj).toString();
            t.options.serverUrl = redirectedUrl;
            this.executeStream(downloadId);
          } catch (err: any) {
            this.failTransfer(downloadId, `Redirect error: ${err.message}`);
          }
          return;
        }

        if (res.statusCode === 416) {
          // Range Not Satisfiable: file might already be complete
          if (t.bytesDownloaded >= t.totalBytes && t.totalBytes > 0) {
            this.completeTransfer(downloadId);
            return;
          }
          // Otherwise reset to 0
          t.bytesDownloaded = 0;
          if (fs.existsSync(t.partPath)) {
            try { fs.unlinkSync(t.partPath); } catch {}
          }
          this.executeStream(downloadId);
          return;
        }

        if (res.statusCode !== 200 && res.statusCode !== 206) {
          this.failTransfer(downloadId, `Server returned HTTP ${res.statusCode}`);
          return;
        }

        const isPartial = res.statusCode === 206;
        if (!isPartial && t.bytesDownloaded > 0) {
          // Server doesn't support range requests, reset
          t.bytesDownloaded = 0;
        }

        if (!t.totalBytes && res.headers['content-length']) {
          t.totalBytes = parseInt(res.headers['content-length'], 10) + t.bytesDownloaded;
        }

        const fileStream = fs.createWriteStream(t.partPath, {
          flags: isPartial ? 'a' : 'w',
        });
        t.fileStream = fileStream;

        res.on('data', (chunk: any) => {
          t.bytesDownloaded += chunk.length;
        });

        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          t.fileStream = null;
          if (t.status === 'downloading') {
            this.completeTransfer(downloadId);
          }
        });

        fileStream.on('error', (err: any) => {
          this.failTransfer(downloadId, `File write error: ${err.message}`);
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      this.failTransfer(downloadId, 'Connection timed out');
    });

    req.on('error', (err: any) => {
      if (t.status === 'paused' || t.status === 'cancelled') return;
      this.failTransfer(downloadId, `Network error: ${err.message}`);
    });

    t.req = req;
  }

  pauseDownload(downloadId: string): boolean {
    const t = this.activeTransfers.get(downloadId);
    if (!t || t.status !== 'downloading') return false;

    t.status = 'paused';
    t.speedBytesPerSec = 0;
    t.etaSeconds = 0;
    if (t.req) {
      t.req.destroy();
      t.req = null;
    }
    if (t.fileStream) {
      t.fileStream.close();
      t.fileStream = null;
    }

    const pct = t.totalBytes > 0 ? Math.min(100, Math.floor((t.bytesDownloaded / t.totalBytes) * 100)) : 0;
    updateDownloadStatus(downloadId, 'paused', undefined, pct);
    this.emitProgress(downloadId);
    return true;
  }

  resumeDownload(downloadId: string): boolean {
    const t = this.activeTransfers.get(downloadId);
    if (!t || t.status !== 'paused') return false;

    if (fs.existsSync(t.partPath)) {
      try {
        t.bytesDownloaded = fs.statSync(t.partPath).size;
      } catch {}
    }

    t.status = 'downloading';
    t.lastTickBytes = t.bytesDownloaded;
    t.lastTickTime = Date.now();
    updateDownloadStatus(downloadId, 'downloading');
    this.emitProgress(downloadId);
    this.executeStream(downloadId);
    return true;
  }

  cancelDownload(downloadId: string): boolean {
    const t = this.activeTransfers.get(downloadId);
    if (t) {
      t.status = 'cancelled';
      if (t.req) t.req.destroy();
      if (t.fileStream) t.fileStream.close();
      if (fs.existsSync(t.partPath)) {
        try { fs.unlinkSync(t.partPath); } catch {}
      }
      this.emitProgress(downloadId);
      this.activeTransfers.delete(downloadId);
    }
    deleteDownload(downloadId);
    return true;
  }

  private completeTransfer(downloadId: string): void {
    const t = this.activeTransfers.get(downloadId);
    if (!t) return;

    t.status = 'completed';
    t.speedBytesPerSec = 0;
    t.etaSeconds = 0;

    // Atomically rename .otixpart to final destination
    try {
      if (fs.existsSync(t.finalPath)) {
        try { fs.unlinkSync(t.finalPath); } catch {}
      }
      fs.renameSync(t.partPath, t.finalPath);
    } catch (err: any) {
      this.failTransfer(downloadId, `Failed to rename downloaded file: ${err.message}`);
      return;
    }

    // Update SQLite download row
    updateDownloadIsoPath(downloadId, t.finalPath);
    updateDownloadStatus(downloadId, 'completed', undefined, 100);

    // Auto-register in scanned_games table so launcher detects it
    try {
      const gamesRepo = new GamesRepository();
      const isIso = t.finalPath.toLowerCase().endsWith('.iso');
      gamesRepo.insertGame({
        id: `remote_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        title: t.options.gameTitle,
        exe_path: t.finalPath,
        install_dir: path.dirname(t.finalPath),
        platform: isIso ? 'iso' : 'pc',
      });
    } catch (e) {
      console.error('[RemoteDownloader] Failed to register scanned game:', e);
    }

    this.emitProgress(downloadId);
    this.emit('completed', { downloadId, finalPath: t.finalPath, gameTitle: t.options.gameTitle });
    this.activeTransfers.delete(downloadId);
  }

  private failTransfer(downloadId: string, errorMsg: string): void {
    const t = this.activeTransfers.get(downloadId);
    if (!t) return;

    t.status = 'failed';
    t.error = errorMsg;
    t.speedBytesPerSec = 0;
    t.etaSeconds = 0;
    if (t.req) t.req.destroy();
    if (t.fileStream) t.fileStream.close();

    const pct = t.totalBytes > 0 ? Math.min(100, Math.floor((t.bytesDownloaded / t.totalBytes) * 100)) : 0;
    updateDownloadStatus(downloadId, 'failed', errorMsg, pct);
    this.emitProgress(downloadId);
  }

  getActiveTransfers(): RemoteDownloadProgress[] {
    const list: RemoteDownloadProgress[] = [];
    for (const [id, t] of this.activeTransfers.entries()) {
      const pct = t.totalBytes > 0 ? Math.min(100, Math.floor((t.bytesDownloaded / t.totalBytes) * 100)) : 0;
      list.push({
        id,
        status: t.status,
        gameTitle: t.options.gameTitle,
        filename: t.options.filename,
        bytesDownloaded: t.bytesDownloaded,
        totalBytes: t.totalBytes,
        percentage: pct,
        speedBytesPerSec: t.speedBytesPerSec,
        etaSeconds: t.etaSeconds,
        isoPath: t.status === 'completed' ? t.finalPath : undefined,
        error: t.error,
        serverUrl: t.options.serverUrl,
        fileId: t.options.fileId,
      });
    }
    return list;
  }
}

// Singleton export
let _remoteManager: RemoteDownloadManager | null = null;
export function getRemoteDownloadManager(): RemoteDownloadManager {
  if (!_remoteManager) {
    _remoteManager = new RemoteDownloadManager();
  }
  return _remoteManager;
}
