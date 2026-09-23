/** Types for desktop remote download manager and IPC transfers. */

import type * as http from 'http';
import type * as fs from 'fs';

export type RemoteDownloadStatus =
  | 'queued'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface RemoteDownloadOptions {
  id?: string;
  userId?: string;
  serverUrl: string;
  fileId: string;
  filename: string;
  filesize: number;
  gameTitle: string;
  mediaItemId?: string | null;
  authToken?: string | null;
  destDir?: string | null;
  /** Full download URL override (Django explorer / hosted file). */
  downloadUrl?: string | null;
}

export interface RemoteDownloadProgress {
  id: string;
  status: RemoteDownloadStatus;
  gameTitle: string;
  filename: string;
  bytesDownloaded: number;
  totalBytes: number;
  percentage: number;
  speedBytesPerSec: number;
  etaSeconds: number;
  isoPath?: string | null;
  error?: string | null;
  serverUrl: string;
  fileId: string;
}

export interface ActiveTransfer {
  options: RemoteDownloadOptions;
  status: RemoteDownloadStatus;
  bytesDownloaded: number;
  totalBytes: number;
  speedBytesPerSec: number;
  etaSeconds: number;
  partPath: string;
  finalPath: string;
  req: http.ClientRequest | null;
  fileStream: fs.WriteStream | null;
  lastTickBytes: number;
  lastTickTime: number;
  error?: string | null;
}
