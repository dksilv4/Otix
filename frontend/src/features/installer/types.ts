export interface InstallerInfo {
  version: string
  defaultInstallPath: string
  isElevated: boolean
  sourcePath?: string
}

export interface DiskSpaceInfo {
  freeBytes: number
  totalBytes: number
  drive: string
}

export interface InstallOptions {
  installPath: string
  createDesktopShortcut: boolean
  createStartMenuShortcut: boolean
  startOnBoot: boolean
}

export interface InstallStepProgress {
  percent: number
  status: string
  detail?: string
  currentFile?: string
}

export type InstallerStep = 'welcome' | 'config' | 'installing' | 'complete' | 'error'

export interface CarouselSlide {
  id: string
  title: string
  subtitle: string
  iconName: 'gamepad' | 'zap' | 'cloud' | 'blocks'
}

export type UninstallerStep = 'confirm' | 'uninstalling' | 'complete' | 'error'

export interface UninstallerOptions {
  removeUserData: boolean
}

export interface UninstallerStepProgress {
  percent: number
  status: string
}
