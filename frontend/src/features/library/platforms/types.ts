// TODO: Review this file
import type { ReactNode, ComponentType } from "react"
import type { User } from "@/features/auth/types"

export interface PlatformStatus {
  itemCount: number
  lastScannedAt: string | null
}

export interface ScanResult {
  total?: number
  matched?: number
  totalInSteam?: number
  matchedInOtix?: number
  taskId?: string
  private?: boolean
  seeded?: number
}

export interface PlatformEmptyStateProps {
  onScan: () => void
  isScanning: boolean
  scanResult?: ScanResult | null
  scanError?: Error | null
}

export interface PlatformDefinition {
  id: string
  label: string
  icon: ReactNode
  requiresConnection: (user: User | null) => boolean
  EmptyState: ComponentType<PlatformEmptyStateProps>
  DashboardSection: ComponentType
  Content: ComponentType
}
