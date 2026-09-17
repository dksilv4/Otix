import { describe, it, expect } from 'vitest'
import {
  createArrInstance,
  normalizeArrInstances,
} from '../arr-instances'
import type { ServerRadarrConfig, ServerSonarrConfig } from '../arr-types'

describe('normalizeArrInstances', () => {
  it('migrates a flat Radarr config into a Default instance', () => {
    const config: ServerRadarrConfig = {
      enabled: true,
      host: '192.168.1.10',
      port: 7878,
      api_key: 'secret',
      use_ssl: true,
      url_base: '/radarr',
      quality_profile_id: 2,
      root_folder_path: '/movies',
    }

    const instances = normalizeArrInstances(config, 7878)
    expect(instances).toHaveLength(1)
    expect(instances[0].name).toBe('Default')
    expect(instances[0].host).toBe('192.168.1.10')
    expect(instances[0].api_key).toBe('secret')
    expect(instances[0].use_ssl).toBe(true)
    expect(instances[0].url_base).toBe('/radarr')
    expect(instances[0].quality_profile_id).toBe(2)
    expect(instances[0].root_folder_path).toBe('/movies')
    expect(instances[0].enabled).toBe(true)
  })

  it('keeps an existing instances list instead of wrapping it again', () => {
    const config: ServerRadarrConfig = {
      enabled: true,
      host: '127.0.0.1',
      port: 7878,
      instances: [
        {
          id: 'a',
          name: 'Main',
          enabled: true,
          host: '10.0.0.1',
          port: 7878,
          api_key: 'one',
        },
        {
          id: 'b',
          name: '4K',
          enabled: false,
          host: '10.0.0.2',
          port: 7878,
          api_key: 'two',
        },
      ],
    }

    const instances = normalizeArrInstances(config, 7878)
    expect(instances).toHaveLength(2)
    expect(instances[0].name).toBe('Main')
    expect(instances[1].name).toBe('4K')
  })

  it('includes Sonarr series defaults on migrated instances', () => {
    const config: ServerSonarrConfig = {
      enabled: true,
      host: 'sonarr.local',
      port: 8989,
      series_type: 'anime',
      season_folder: false,
      language_profile_id: 3,
    }

    const instances = normalizeArrInstances(config, 8989)
    expect(instances[0].series_type).toBe('anime')
    expect(instances[0].season_folder).toBe(false)
    expect(instances[0].language_profile_id).toBe(3)
  })

  it('creates a blank Default instance when config is empty', () => {
    const instance = createArrInstance({ name: 'Default' }, 7878)
    expect(instance.name).toBe('Default')
    expect(instance.host).toBe('127.0.0.1')
    expect(instance.port).toBe(7878)
    expect(instance.enabled).toBe(true)
    expect(instance.id).toBeTruthy()
  })
})
