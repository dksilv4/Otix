export const LIBRARY_SETTINGS_TABS = [
  { id: 'catalog', label: 'Catalog' },
  { id: 'proposals', label: 'Match Proposals' },
] as const

export type LibrarySettingsTab = (typeof LIBRARY_SETTINGS_TABS)[number]['id']

/** Map hashes onto tabs. Empty / catalog / legacy hashes → catalog; proposals → proposals. */
export function resolveLibrarySettingsTab(hash: string | undefined | null): LibrarySettingsTab {
  const h = (hash || '').replace(/^#/, '').toLowerCase()
  if (h === 'proposals') return 'proposals'
  return 'catalog'
}

export function isRetiredLibraryHash(hash: string | undefined | null): boolean {
  const h = (hash || '').replace(/^#/, '').toLowerCase()
  return h === 'downloads' || h === 'organize' || h === 'paths'
}
