import type { PluginInfo, PluginConfigField } from '@/features/plugins/types/plugins'

export interface ProviderDef {
  id: 'spotify' | 'google' | 'plex'
  label: string
  statusKey: string
  credsKey?: string
  sourceKey?: string
  errorKey?: string
}

export const PROVIDERS: ProviderDef[] = [
  { id: 'spotify', label: 'Spotify', statusKey: 'spotify', credsKey: 'spotify_creds' },
  { id: 'google', label: 'Google', statusKey: 'google', sourceKey: 'google_source', errorKey: 'google_error' },
  { id: 'plex', label: 'Plex', statusKey: 'plex', errorKey: 'plex_error' },
]

/** Manifest config fields that belong to a provider card (by section or key prefix). */
export const providerFields = (
  plugin: PluginInfo | null,
  providerId: string,
): Record<string, PluginConfigField> => {
  const fields = plugin?.manifest.config
  if (!fields) return {}
  const out: Record<string, PluginConfigField> = {}
  for (const [key, field] of Object.entries(fields)) {
    if ((field.section || '').toLowerCase() === providerId || key.startsWith(providerId + '_')) {
      out[key] = field
    }
  }
  return out
}

/** A provider card is only shown when the plugin actually integrates it:
 *  it declares config fields for the provider, or its status reports a connection. */
export const isProviderRelevant = (
  plugin: PluginInfo | null,
  status: Record<string, any> | null,
  provider: ProviderDef,
): boolean => {
  if (Object.keys(providerFields(plugin, provider.id)).length > 0) return true
  if (!status) return false
  if (status[provider.statusKey]) return true
  if (provider.credsKey && status[provider.credsKey]) return true
  if (provider.sourceKey && status[provider.sourceKey] && status[provider.sourceKey] !== 'not connected') return true
  if (provider.errorKey && status[provider.errorKey]) return true
  return false
}

/** Keys owned by a provider card — excluded from the general config form. */
export const providerManagedKeys = (plugin: PluginInfo | null): string[] => {
  const fields = plugin?.manifest.config
  if (!fields) return []
  return Object.entries(fields)
    .filter(([key, field]) => {
      const s = (field.section || '').toLowerCase()
      return (
        s === 'spotify' ||
        s === 'google' ||
        s === 'plex' ||
        key.startsWith('spotify_') ||
        key.startsWith('google_') ||
        key.startsWith('plex_')
      )
    })
    .map(([key]) => key)
}

export { formatBytes } from '@/lib/utils/format-bytes'

export const parseGenres = (raw: string | null): string[] => {
  if (!raw) return []
  try {
    const g = JSON.parse(raw)
    return Array.isArray(g) ? g : []
  } catch {
    return []
  }
}

export const formatAdded = (raw?: string | null): string => {
  if (!raw) return ''
  const d = new Date(raw)
  if (isNaN(d.getTime())) return raw
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export const openBoundModal = (
  openFn: (element: React.ReactNode) => () => void,
  renderModal: (onClose: () => void) => React.ReactNode,
): void => {
  let close = () => {}
  close = openFn(renderModal(() => close()))
}

