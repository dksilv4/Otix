import type { ReactNode, ComponentType } from "react"
import type { SlotContribution } from "@/features/plugins/types/plugins"

export interface TabItemInfo {
  id: string
  label: string
  icon: ReactNode
}

export type LibTab = {
  id: string
  label: string
  icon: ReactNode
  kind: "media" | "plugin" | "all"
  contribution?: SlotContribution
}

export type Tab = {
  id: string
  label: string
  icon: ComponentType<{ className?: string }>
}

export interface DownloadItem {
  id: string
  mediaItemTitle: string | null
  nzbName: string | null
  nzbSize: number | null
  status: string
  percentage: number | null
  errorMessage: string | null
  completedAt: string | null
  createdAt: string
}

export interface ArrItem {
  id: number
  title: string
  year?: number
  images?: Array<{ coverType: string; remoteUrl: string }>
}

export interface ArrLibrary {
  name: string
  url: string
  count: number
  movies?: ArrItem[]
  series?: ArrItem[]
  albums?: ArrItem[]
  items?: ArrItem[]
  error?: string
}

export type SyncProgress = {
  phase: string
  itemsProcessed?: number
  itemsTotal?: number
}
