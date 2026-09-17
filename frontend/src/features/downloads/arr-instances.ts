export interface ArrServiceInstance {
  id: string
  name: string
  enabled: boolean
  host: string
  port: number
  api_key?: string
  apiKey?: string
  use_ssl?: boolean
  useSsl?: boolean
  url_base?: string
  urlBase?: string
  quality_profile_id?: number
  qualityProfileId?: number
  root_folder_path?: string
  rootFolderPath?: string
  series_type?: string
  seriesType?: string
  season_folder?: boolean
  seasonFolder?: boolean
  language_profile_id?: number
  languageProfileId?: number
  hasApiKey?: boolean
  has_api_key?: boolean
}

export function createArrInstance(
  partial: Partial<ArrServiceInstance> = {},
  defaultPort: number,
): ArrServiceInstance {
  return {
    id: partial.id || `inst-${Math.random().toString(36).slice(2, 10)}`,
    name: partial.name || 'Default',
    enabled: partial.enabled ?? true,
    host: partial.host || '127.0.0.1',
    port: partial.port || defaultPort,
    api_key: partial.api_key || partial.apiKey || '',
    use_ssl: Boolean(partial.use_ssl ?? partial.useSsl),
    url_base: partial.url_base || partial.urlBase || '',
    quality_profile_id: partial.quality_profile_id ?? partial.qualityProfileId,
    root_folder_path: partial.root_folder_path || partial.rootFolderPath || '',
    series_type: partial.series_type || partial.seriesType || 'standard',
    season_folder: partial.season_folder ?? partial.seasonFolder ?? true,
    language_profile_id: partial.language_profile_id ?? partial.languageProfileId,
    hasApiKey: partial.hasApiKey ?? partial.has_api_key,
  }
}

export function normalizeArrInstances(
  config:
    | {
        host?: string
        port?: number
        api_key?: string
        apiKey?: string
        use_ssl?: boolean
        useSsl?: boolean
        url_base?: string
        urlBase?: string
        quality_profile_id?: number
        qualityProfileId?: number
        root_folder_path?: string
        rootFolderPath?: string
        series_type?: string
        seriesType?: string
        season_folder?: boolean
        seasonFolder?: boolean
        language_profile_id?: number
        languageProfileId?: number
        hasApiKey?: boolean
        has_api_key?: boolean
        enabled?: boolean
        configured?: boolean
        instances?: ArrServiceInstance[]
      }
    | null
    | undefined,
  defaultPort: number,
): ArrServiceInstance[] {
  if (config?.instances?.length) {
    return config.instances.map((item) => createArrInstance(item, defaultPort))
  }

  return [
    createArrInstance(
      {
        id: 'default',
        name: 'Default',
        enabled: config?.enabled ?? true,
        host: config?.host,
        port: config?.port,
        api_key: config?.api_key || config?.apiKey,
        use_ssl: config?.use_ssl ?? config?.useSsl,
        url_base: config?.url_base || config?.urlBase,
        quality_profile_id: config?.quality_profile_id ?? config?.qualityProfileId,
        root_folder_path: config?.root_folder_path || config?.rootFolderPath,
        series_type: config?.series_type || config?.seriesType,
        season_folder: config?.season_folder ?? config?.seasonFolder,
        language_profile_id: config?.language_profile_id ?? config?.languageProfileId,
        hasApiKey: config?.hasApiKey ?? config?.has_api_key,
      },
      defaultPort,
    ),
  ]
}

export function readyArrInstances(
  config: Parameters<typeof normalizeArrInstances>[0],
  defaultPort: number,
): ArrServiceInstance[] {
  if (!config) return []
  const instances = normalizeArrInstances(config, defaultPort).filter((item) => item.enabled)
  if (instances.length === 0) return []
  const serviceReady = Boolean(
    config.enabled ||
      config.configured ||
      config.hasApiKey ||
      config.has_api_key ||
      instances.some((item) => item.hasApiKey || item.has_api_key || item.api_key),
  )
  if (!serviceReady) return []
  return instances.filter((item) => item.hasApiKey !== false)
}
