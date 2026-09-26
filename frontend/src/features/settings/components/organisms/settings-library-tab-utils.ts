export const LIBRARY_SETTINGS_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'library', label: 'Library' },
] as const

export type LibrarySettingsTab = (typeof LIBRARY_SETTINGS_TABS)[number]['id']

/** Map hashes onto tabs. Empty / overview → Overview; legacy paths/downloads/organize stay on overview. */
export function resolveLibrarySettingsTab(hash: string | undefined | null): LibrarySettingsTab {
  const h = (hash || '').replace(/^#/, '').toLowerCase()
  if (h === 'library' || h === 'games' || h === 'proposals') return 'library'
  return 'overview'
}

export function isRetiredLibraryHash(hash: string | undefined | null): boolean {
  const h = (hash || '').replace(/^#/, '').toLowerCase()
  return h === 'paths' || h === 'downloads' || h === 'organize'
}
