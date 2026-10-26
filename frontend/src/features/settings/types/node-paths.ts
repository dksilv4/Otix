export type ContentRole =
  | 'installed_game'
  | 'installer'
  | 'iso'
  | 'rom'
  | 'staging_downloads'

export interface StorageShare {
  id: number
  name: string
  protocol: 'smb' | 'nfs' | 'local' | 'other'
  host: string
  exportPath: string
  notes?: string
  isActive: boolean
  serverMachineId?: number | null
  nodeCount: number
  createdAt: string
  updatedAt: string
}

export interface NodeLibraryPath {
  id: number
  nodeId: number
  storageShareId?: number | null
  storageShareName?: string | null
  name: string
  path: string
  kind: string
  roles: ContentRole[]
  allowedExtensions: string[]
  isDownloadTarget: boolean
  isActive: boolean
  totalFiles: number
  lastScannedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface GameMatchCandidate {
  mediaId: string
  title: string
  slug: string
  posterUrl?: string
  backdropUrl?: string
  releaseYear?: number | null
  confidence: number
}

export interface GameMatchRecord {
  id: number
  canonicalKey: string
  rawTitle: string
  cleanedTitle: string
  relativePath: string
  formatCategory: string
  filesize: number
  sha256Head: string
  matchStatus: 'matched' | 'needs_review' | 'unmatched' | 'ignored'
  confidence: number
  candidates: GameMatchCandidate[]
  userOverride: boolean
  mediaItemId?: string | null
  media?: {
    id: string
    title: string
    slug: string
    posterUrl?: string | null
    backdropUrl?: string | null
    releaseDate?: string | null
  } | null
  storageShareId?: number | null
  storageShareName?: string | null
  nodeId?: number | null
  nodeName?: string | null
  lastSeenAt: string
  createdAt: string
  updatedAt: string
}
