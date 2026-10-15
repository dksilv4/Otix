export interface ServerDriveConfig {
  id: string
  drive: string
  label?: string
  fileSystem?: string
  totalBytes: number
  freeBytes: number
  usedBytes?: number
  type?: 'hdd' | 'ssd' | 'nvme' | 'pool' | string
  mountPoint?: string
}

export interface UserHome {
  id: number
  name: string
  description?: string
  isDefault: boolean
  subnetCidr?: string
  nodesCount: number
  serverMachinesCount: number
  createdAt: string
  updatedAt: string
}

export interface UserServerMachine {
  id: number
  homeId?: number | null
  homeName?: string | null
  name: string
  os: string
  osVersion?: string
  host?: string
  hostedNodeId?: number | null
  hostedNodeName?: string | null
  smbEnabled: boolean
  smbHost?: string
  smbPort: number
  smbShareName?: string
  smbUsername?: string
  smbPassword?: string
  smbWorkgroup?: string
  smbMountPath?: string
  smbNodeIds: number[]
  smbNodes: Array<{ id: number; name: string; primaryUrl: string }>
  drivesConfig: ServerDriveConfig[]
  totalStorageBytes: number
  freeStorageBytes: number
  isOnline: boolean
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface ServerMachineInput {
  name: string
  homeId?: number | null
  os: string
  osVersion?: string
  host?: string
  hostedNodeId?: number | null
  smbEnabled: boolean
  smbHost?: string
  smbPort: number
  smbShareName?: string
  smbUsername?: string
  smbPassword?: string
  smbWorkgroup?: string
  smbMountPath?: string
  smbNodeIds: number[]
  drivesConfig: ServerDriveConfig[]
  isOnline: boolean
  notes?: string
}

export interface DetectDrivesResponse {
  success: boolean
  server?: UserServerMachine
  detectedDrives: ServerDriveConfig[]
  detectedOs?: { name?: string; platform?: string; version?: string; build?: string }
  detectedOsCode?: string
}
