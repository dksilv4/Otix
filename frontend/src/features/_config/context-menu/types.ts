import type { LucideIcon } from 'lucide-react'

export interface ContextMenuItemDef {
  id: string
  label?: string
  icon?: LucideIcon | React.ComponentType<{ className?: string }>
  shortcut?: string
  disabled?: boolean
  destructive?: boolean
  separator?: boolean
  onClick?: () => void
  subItems?: ContextMenuItemDef[]
}

export interface ContextMenuPosition {
  x: number
  y: number
}

export type ContextMenuMediaType = 'game' | 'movie' | 'show' | 'music' | 'generic'

export type ContextMenuTargetType =
  | 'movie'
  | 'show'
  | 'game'
  | 'music'
  | 'episode'
  | 'season'
  | 'person'
  | 'list'
  | 'track'
  | 'link'
  | 'image'
  | 'text'
  | 'input'
  | 'page'
  | 'generic'

export interface ContextMenuState {
  isOpen: boolean
  position: ContextMenuPosition | null
  items: ContextMenuItemDef[]
  mediaType: ContextMenuMediaType | null
  targetType: ContextMenuTargetType | null
  data: Record<string, unknown> | null
}

export interface ContextMenuOpenEvent {
  preventDefault: () => void
  clientX: number
  clientY: number
  touches?: { clientX: number; clientY: number }[]
}

export interface ContextMenuActions {
  open: (e: ContextMenuOpenEvent, items: ContextMenuItemDef[], options?: {
    mediaType?: ContextMenuMediaType
    targetType?: ContextMenuTargetType
    data?: Record<string, unknown>
  }) => void
  close: () => void
}
