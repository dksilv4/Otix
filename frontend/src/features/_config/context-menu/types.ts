import type { LucideIcon } from 'lucide-react'

export interface ContextMenuItemDef {
  id: string
  label?: string
  icon?: LucideIcon | React.ComponentType<{ className?: string }>
  shortcut?: string
  disabled?: boolean
  destructive?: boolean
  separator?: boolean
  checked?: boolean
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
  | 'media'
  | 'game'
  | 'music'
  | 'episode'
  | 'season'
  | 'genre'
  | 'download'
  | 'user'
  | 'video'
  | 'person'
  | 'list'
  | 'track'
  | 'link'
  | 'image'
  | 'text'
  | 'input'
  | 'page'
  | 'continue-watching'
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

export interface ContextMenuContextValue extends ContextMenuState, ContextMenuActions {}

export interface MenuBuilderContext {
  navigate?: (opts: { to: string; params?: Record<string, string>; search?: Record<string, unknown> }) => void
  openModal?: (node: React.ReactNode) => () => void
}
