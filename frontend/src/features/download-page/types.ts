export type PlatformId = 'windows' | 'macos' | 'linux' | 'node'

export type ArchType = 'x64' | 'arm64' | 'universal' | 'all'

export type PackageKind =
  | 'installer'
  | 'portable'
  | 'appimage'
  | 'deb'
  | 'dmg'
  | 'zip'
  | 'binary'
  | 'docker'
  | 'unraid'

export interface ReleaseAsset {
  name: string
  size: number
  browserDownloadUrl: string
  contentType?: string
  updatedAt?: string
}

export interface LatestReleaseInfo {
  version: string
  tagName: string
  name: string
  publishedAt: string
  releaseNotes: string
  assets: ReleaseAsset[]
}

export interface PlatformDownloadOption {
  id: string
  title: string
  platform: PlatformId
  arch: ArchType
  kind: PackageKind
  filename: string
  formattedSize: string
  downloadUrl: string
  isPrimary?: boolean
  badge?: string
  description: string
  architectureLabel: string
  sha256?: string
  command?: string
}

export interface SystemRequirement {
  platform: PlatformId
  osName: string
  minVersion: string
  recommendedVersion: string
  ram: string
  storage: string
  notes?: string
}

export interface DownloadStartedPayload {
  option: PlatformDownloadOption
  timestamp: number
}
