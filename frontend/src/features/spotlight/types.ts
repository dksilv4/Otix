import type { ComponentType } from 'react'

export type TipCategory =
  | 'discovery'
  | 'navigation'
  | 'gaming'
  | 'library'
  | 'media'
  | 'progression'
  | 'downloads'
  | 'personalization'
  | 'social'
  | 'shortcuts'

export interface FeatureTip {
  id: string
  title: string
  category: TipCategory
  categoryLabel: string
  description: string
  icon: ComponentType<{ className?: string }>
  shortcut?: string
  actionLabel?: string
  actionType: 'navigate' | 'command'
  actionPayload: string
  colorToken?: string
}

export interface SpotlightPreferences {
  enabled: boolean
  lastShownTimestamp: number
  seenTipIds: string[]
}
