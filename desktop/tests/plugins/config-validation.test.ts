import { describe, it, expect } from 'vitest'
import {
  validateConfig,
  validateConfigValue,
} from '../../plugin-runtime/config-validation'
import type { PluginConfigField, PluginManifest } from '../../plugin-runtime/types'

function field(partial: Partial<PluginConfigField> & { type: PluginConfigField['type'] }): PluginConfigField {
  return { label: partial.type, ...partial } as PluginConfigField
}

describe('validateConfigValue', () => {
  it('coerces numbers and clamps min/max', () => {
    const f = field({ type: 'number', label: 'Port', min: 1, max: 65535 })
    expect(validateConfigValue(f, '8080')).toEqual({ ok: true, value: 8080 })
    expect(validateConfigValue(f, 0).ok).toBe(false)
    expect(validateConfigValue(f, 70000).ok).toBe(false)
  })

  it('coerces boolean truthiness', () => {
    const f = field({ type: 'boolean', label: 'Enabled' })
    expect(validateConfigValue(f, true).value).toBe(true)
    expect(validateConfigValue(f, 'true').value).toBe(true)
    expect(validateConfigValue(f, 0).value).toBe(false)
  })

  it('enforces required', () => {
    const f = field({ type: 'string', label: 'API Key', required: true })
    const result = validateConfigValue(f, '')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('required')
  })

  it('validates enum membership', () => {
    const f = field({ type: 'enum', label: 'Mode', values: ['auto', 'strict'] })
    expect(validateConfigValue(f, 'auto').ok).toBe(true)
    expect(validateConfigValue(f, 'bogus').ok).toBe(false)
  })

  it('validates select against value/label options', () => {
    const f = field({ type: 'select', label: 'Source', values: [{ value: 'playlist', label: 'Playlist' }] })
    expect(validateConfigValue(f, { value: 'playlist' }).value).toBe('playlist')
    expect(validateConfigValue(f, 'other').ok).toBe(false)
  })

  it('normalizes path-list to an array', () => {
    const f = field({ type: 'path-list', label: 'Directories' })
    expect(validateConfigValue(f, '/games').value).toEqual(['/games'])
    expect(validateConfigValue(f, ['/a', '/b']).value).toEqual(['/a', '/b'])
    expect(validateConfigValue(f, 42).ok).toBe(false)
  })

  it('validates list of strings', () => {
    const f = field({ type: 'list', label: 'Categories' })
    expect(validateConfigValue(f, ['games', 'movies']).ok).toBe(true)
    expect(validateConfigValue(f, ['games', 1]).ok).toBe(false)
  })

  it('validates serverUrl as a URL string', () => {
    const f = field({ type: 'serverUrl', label: 'Server URL' })
    expect(validateConfigValue(f, 'http://localhost:7878/radarr').ok).toBe(true)
    expect(validateConfigValue(f, 42).ok).toBe(false)
    expect(validateConfigValue(f, undefined).ok).toBe(true)
  })

  it('validates instances as an array of objects', () => {
    const f = field({
      type: 'instances',
      label: 'Servers',
      items: { host: { type: 'string', label: 'Host' } },
    })
    expect(validateConfigValue(f, [{ host: '192.168.1.5' }]).ok).toBe(true)
    expect(validateConfigValue(f, 'host').ok).toBe(false)
    expect(validateConfigValue(f, [42]).ok).toBe(false)
    expect(validateConfigValue(f, undefined).value).toEqual([])
  })

  it('applies string pattern', () => {
    const f = field({ type: 'string', label: 'Slug', pattern: '^[a-z-]+$' })
    expect(validateConfigValue(f, 'my-plugin').ok).toBe(true)
    expect(validateConfigValue(f, 'My Plugin').ok).toBe(false)
  })

  it('defaults blank optional to default', () => {
    const f = field({ type: 'number', label: 'Interval', default: 24 })
    expect(validateConfigValue(f, undefined).value).toBe(24)
  })
})

describe('validateConfig', () => {
  const manifest = {
    config: {
      apiKey: field({ type: 'secret', label: 'API Key', required: true }),
      port: field({ type: 'number', label: 'Port', min: 1 }),
      mode: field({ type: 'enum', label: 'Mode', values: ['auto', 'strict'] }),
    },
  } as unknown as PluginManifest

  it('collects errors for invalid fields', () => {
    const result = validateConfig(manifest, { apiKey: '', port: -1, mode: 'bad' })
    expect(result.valid).toBe(false)
    expect(result.errors.map((e) => e.key).sort()).toEqual(['apiKey', 'mode', 'port'])
  })

  it('passes valid config', () => {
    const result = validateConfig(manifest, { apiKey: 'abc', port: 8080, mode: 'auto' })
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })
})
