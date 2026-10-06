import { applyAccentColor as applyAccentToDocument } from '@/lib/theme/accent'

export const ACCENTS = [
  { id: 'orange', primary: 'oklch(0.705 0.213 47.604)' },
  { id: 'amber', primary: 'oklch(0.769 0.188 70.08)' },
  { id: 'yellow', primary: 'oklch(0.828 0.189 84.429)' },
  { id: 'lime', primary: 'oklch(0.768 0.233 130.85)' },
  { id: 'green', primary: 'oklch(0.627 0.194 149.214)' },
  { id: 'emerald', primary: 'oklch(0.596 0.145 163.225)' },
  { id: 'teal', primary: 'oklch(0.696 0.17 162.48)' },
  { id: 'cyan', primary: 'oklch(0.715 0.143 215.221)' },
  { id: 'sky', primary: 'oklch(0.685 0.169 237.323)' },
  { id: 'blue', primary: 'oklch(0.623 0.214 259.815)' },
  { id: 'indigo', primary: 'oklch(0.585 0.233 277.117)' },
  { id: 'violet', primary: 'oklch(0.606 0.25 292.717)' },
  { id: 'purple', primary: 'oklch(0.624 0.21 306.551)' },
  { id: 'fuchsia', primary: 'oklch(0.592 0.233 328.363)' },
  { id: 'pink', primary: 'oklch(0.592 0.212 350.487)' },
  { id: 'rose', primary: 'oklch(0.577 0.245 27.325)' },
] as const

export const ACCENT_STORAGE_KEY = 'otix-accent'
export const CUSTOM_ACCENTS_KEY = 'otix-accent-customs'

export const getCustomAccents = (): string[] => {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(CUSTOM_ACCENTS_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export const getInitialAccent = (): string => {
  if (typeof window === 'undefined') return ACCENTS[0].primary
  const stored = localStorage.getItem(ACCENT_STORAGE_KEY)
  if (stored && typeof stored === 'string') return stored
  return ACCENTS[0].primary
}

export const applyAccentColor = (color: string): void => {
  applyAccentToDocument(color)
  localStorage.setItem(ACCENT_STORAGE_KEY, color)
}
