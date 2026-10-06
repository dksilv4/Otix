import type { DkDropdownOption } from '@ui/atoms/dropdown'

export const DEFAULT_LANDING_PAGE_KEY = 'otix:default-landing-page'

export const LANDING_PAGE_OPTIONS = [
  { value: 'discover', label: 'Discover' },
  { value: 'launcher', label: 'Launcher' },
  { value: 'library', label: 'Library' },
] satisfies readonly DkDropdownOption[]

export const readDefaultPage = (): string => {
  try {
    return localStorage.getItem(DEFAULT_LANDING_PAGE_KEY) || 'discover'
  } catch {
    return 'discover'
  }
}

export const formatResetAt = (value: string | null | undefined): string | null => {
  if (!value) return null
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return null
  }
}
