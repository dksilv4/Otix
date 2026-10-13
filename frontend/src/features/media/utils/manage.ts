import { Monitor, Moon, Sun } from 'lucide-react'
import type { ArtworkContext, MediaAsset } from '@/features/admin'

export const ARTWORK_GROUPS: {
  value: string
  label: string
  assetTypes: string[]
  textless?: boolean
}[] = [
  { value: 'poster', label: 'Poster', assetTypes: ['poster', 'textless_poster'], textless: true },
  { value: 'backdrop', label: 'Backdrop', assetTypes: ['backdrop', 'textless_backdrop'], textless: true },
  { value: 'logo', label: 'Logo', assetTypes: ['logo'] },
  { value: 'icon', label: 'Icon', assetTypes: ['icon'] },
]

export const ASSET_TYPE_LABELS: Record<string, string> = {
  poster: 'Poster',
  textless_poster: 'Textless poster',
  backdrop: 'Backdrop',
  textless_backdrop: 'Textless backdrop',
  logo: 'Logo',
  icon: 'Icon',
  screenshot: 'Screenshot',
}

export const PORTRAIT = new Set(['poster', 'textless_poster', 'icon'])

export const CONTEXTS: ArtworkContext[] = ['general', 'dark', 'light']

export const CONTEXT_META: Record<ArtworkContext, { label: string; icon: typeof Sun; hint: string }> = {
  general: {
    label: 'General',
    icon: Monitor,
    hint: 'Served to every viewer, and the fallback for Dark and Light.',
  },
  dark: {
    label: 'Dark',
    icon: Moon,
    hint: 'Served in Dark mode; falls back to General when no Dark pick is set.',
  },
  light: {
    label: 'Light',
    icon: Sun,
    hint: 'Served in Light mode; falls back to General when no Light pick is set.',
  },
}

export const labelFor = (typeOrAssetType: string): string => {
  return (
    ARTWORK_GROUPS.find((g) => g.value === typeOrAssetType)?.label ??
    ASSET_TYPE_LABELS[typeOrAssetType] ??
    typeOrAssetType
  )
}

export const isContextActive = (asset: MediaAsset, context: ArtworkContext): boolean => {
  if (asset.selectedContext === context) return true
  if (context === 'general' && asset.selectedContext == null && asset.currentContexts.includes('general')) {
    return true
  }
  return false
}

export const aspectRatioOf = (asset: MediaAsset): string | undefined => {
  const { width, height } = asset
  if (width && height && width > 0 && height > 0) return `${width} / ${height}`
  return undefined
}

export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-0'

