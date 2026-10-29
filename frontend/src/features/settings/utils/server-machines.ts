import type { ServerDriveConfig, ServerMachineInput, UserServerMachine } from '../types/server-machines'

export interface OSOption {
  value: string
  label: string
  description: string
  isPopular?: boolean
}

export const SERVER_OS_OPTIONS: OSOption[] = [
  { value: 'unraid', label: 'Unraid', description: 'Network attached storage & Docker application server', isPopular: true },
  { value: 'truenas', label: 'TrueNAS', description: 'Open-source storage OS (SCALE / CORE with ZFS)', isPopular: true },
  { value: 'ubuntu', label: 'Ubuntu Server', description: 'Standard Debian-based Linux homelab distribution', isPopular: true },
  { value: 'debian', label: 'Debian', description: 'Rock-solid Linux distribution for stable services' },
  { value: 'proxmox', label: 'Proxmox VE', description: 'Enterprise virtualization environment (KVM & LXC)', isPopular: true },
  { value: 'windows_server', label: 'Windows Server', description: 'Microsoft Windows Server or workstation host' },
  { value: 'synology', label: 'Synology DSM', description: 'Synology DiskStation Manager NAS' },
  { value: 'arch', label: 'Arch Linux', description: 'Rolling-release Linux server' },
  { value: 'macos', label: 'macOS Server', description: 'Apple Mac mini or Mac Studio headless node' },
  { value: 'other', label: 'Other / Custom', description: 'Custom Linux, FreeBSD, or baremetal appliance' },
]

export const DRIVE_TYPE_OPTIONS = [
  { value: 'hdd', label: 'HDD (Hard Disk)' },
  { value: 'ssd', label: 'SATA SSD' },
  { value: 'nvme', label: 'NVMe M.2 SSD' },
  { value: 'pool', label: 'Storage Pool / Array' },
]

export const getOSLabel = (osValue?: string): string => {
  if (!osValue) return 'Unknown OS'
  const match = SERVER_OS_OPTIONS.find((opt) => opt.value.toLowerCase() === osValue.toLowerCase())
  return match ? match.label : osValue
}

export const getDriveTypeLabel = (type?: string): string => {
  const match = DRIVE_TYPE_OPTIONS.find((opt) => opt.value === type)
  return match ? match.label : (type?.toUpperCase() || 'DISK')
}

export const calculateTotalCapacity = (drives: ServerDriveConfig[]): { totalBytes: number; freeBytes: number; usedBytes: number } => {
  let totalBytes = 0
  let freeBytes = 0
  for (const drive of drives) {
    totalBytes += drive.totalBytes || 0
    freeBytes += drive.freeBytes || 0
  }
  const usedBytes = Math.max(0, totalBytes - freeBytes)
  return { totalBytes, freeBytes, usedBytes }
}

export interface DesktopDetectedNetwork {
  ssid: string
  bssid: string
  gatewayIp: string
  gatewayMac: string
  localIp: string
  isWifi: boolean
}

export interface DesktopHomeVerificationResult {
  status: 'verified_home' | 'duplicate_ssid_foreign' | 'roaming_away' | 'offline'
  details: {
    currentSsid?: string
    currentBssid?: string
    currentGatewayMac?: string
    hardwareMatched: boolean
    serverPingOk: boolean
    reason: string
  }
}

export const detectDesktopCurrentNetwork = async (): Promise<DesktopDetectedNetwork | null> => {
  if (typeof window !== 'undefined' && (window as any).otix?.network?.detectCurrent) {
    try {
      const res = await (window as any).otix.network.detectCurrent()
      return res
    } catch {
      return null
    }
  }
  return null
}

export const verifyDesktopHomeNetwork = async (profile: {
  wifiSsid?: string
  gatewayMac?: string
  bssid?: string
  localServerUrl?: string
}): Promise<DesktopHomeVerificationResult | null> => {
  if (typeof window !== 'undefined' && (window as any).otix?.network?.verifyHome) {
    try {
      const res = await (window as any).otix.network.verifyHome(profile)
      return res
    } catch {
      return null
    }
  }
  return null
}

export const createDefaultDriveConfig = (index: number): ServerDriveConfig => ({
  id: `drive-${index}`,
  drive: `/mnt/disk${index}`,
  label: `Disk ${index}`,
  fileSystem: 'xfs',
  totalBytes: 1024 * 1024 * 1024 * 1000,
  freeBytes: 1024 * 1024 * 1024 * 500,
  usedBytes: 1024 * 1024 * 1024 * 500,
  type: 'hdd',
  mountPoint: '',
})

export const createDefaultServerInput = (defaultHomeId?: number | null): ServerMachineInput => ({
  name: '',
  homeId: defaultHomeId ?? null,
  os: 'unraid',
  osVersion: '',
  host: '',
  hostedNodeId: null,
  smbEnabled: false,
  smbHost: '',
  smbPort: 445,
  smbShareName: 'games',
  smbUsername: '',
  smbPassword: '',
  smbWorkgroup: 'WORKGROUP',
  smbMountPath: '',
  smbNodeIds: [],
  drivesConfig: [],
  isOnline: true,
  notes: '',
})

export const serverMachineToInput = (server: UserServerMachine): ServerMachineInput => ({
  name: server.name,
  homeId: server.homeId ?? null,
  os: server.os,
  osVersion: server.osVersion || '',
  host: server.host || '',
  hostedNodeId: server.hostedNodeId ?? null,
  smbEnabled: server.smbEnabled,
  smbHost: server.smbHost || '',
  smbPort: server.smbPort || 445,
  smbShareName: server.smbShareName || '',
  smbUsername: server.smbUsername || '',
  smbPassword: server.smbPassword || '',
  smbWorkgroup: server.smbWorkgroup || 'WORKGROUP',
  smbMountPath: server.smbMountPath || '',
  smbNodeIds: server.smbNodeIds || [],
  drivesConfig: server.drivesConfig || [],
  isOnline: server.isOnline,
  notes: server.notes || '',
})
