import type { ShelfTab } from '@/features/launcher/types'

export const TAB_LABELS: Record<ShelfTab, string> = {
  'my-games': 'My Games',
  popular: 'Popular',
}

export const getModernGridColumns = (width: number): number => {
  if (width >= 1280) return 6
  if (width >= 1024) return 5
  if (width >= 768) return 4
  if (width >= 640) return 3
  return 2
}

export const getXboxGridColumns = (width: number): number => {
  if (width >= 1024) return 6
  if (width >= 768) return 4
  if (width >= 640) return 3
  return 2
}

