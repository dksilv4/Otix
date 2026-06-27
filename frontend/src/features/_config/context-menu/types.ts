import type { LucideIcon } from 'lucide-react'

export interface ContextMenuItemDef {
  id: string
  label: string
  icon?: LucideIcon
  shortcut?: string
  disabled?: boolean
  destructive?: boolean
  onClick: () => void
  subItems?: ContextMenuItemDef[]
}

export interface ContextMenuPosition {
  x: number
  y: number
}

export type ContextMenuMediaType = 'game' | 'movie' | 'show' | 'music' | 'generic'

export interface ContextMenuState {
  isOpen: boolean
  position: ContextMenuPosition | null
  items: ContextMenuItemDef[]
  mediaType: ContextMenuMediaType | null
  data: Record<string, unknown> | null
}

export interface ContextMenuActions {
  open: (e: MouseEvent | TouchEvent, items: ContextMenuItemDef[], options?: {
    mediaType?: ContextMenuMediaType
    data?: Record<string, unknown>
  }) => void
  close: () => void
}
