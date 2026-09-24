import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { validateManifestSchema } from '../../plugin-runtime/manifest-validation'

const baseManifest = {
  name: 'test-plugin',
  version: '1.0.0',
  description: 'A test plugin',
  author: 'Otix',
  repository: 'https://example.com/repo',
  permissions: ['storage:local', 'events:subscribe'],
  entry: { main: 'main.js' },
}

const issuesByPath = (raw: unknown) => {
  const result = validateManifestSchema(raw)
  const map = new Map<string, string>()
  for (const issue of result.issues) map.set(issue.path, issue.message)
  return { valid: result.valid, map, issues: result.issues }
}

const errorPaths = (raw: unknown) =>
  issuesByPath(raw).issues.filter((i) => i.severity === 'error').map((i) => i.path)

describe('validateManifestSchema', () => {
  it('accepts a minimal valid manifest', () => {
    const { valid, issues } = validateManifestSchema(baseManifest)
    expect(valid).toBe(true)
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0)
  })

  it('rejects non-object manifests', () => {
    for (const raw of [null, 42, 'x', [], undefined]) {
      expect(validateManifestSchema(raw).valid).toBe(false)
    }
  })

  it('requires name, version and entry.main', () => {
    expect(errorPaths({ ...baseManifest, name: '' })).toContain('name')
    expect(errorPaths({ ...baseManifest, version: undefined })).toContain('version')
    expect(errorPaths({ ...baseManifest, entry: { main: '' } })).toContain('entry.main')
    expect(errorPaths({ ...baseManifest, entry: null })).toContain('entry.main')
  })

  it('flags unknown permission tokens as errors', () => {
    const bad = { ...baseManifest, permissions: ['storage:local', 'nope:whatever'] }
    expect(errorPaths(bad)).toContain('permissions.nope:whatever')
  })

  it('accepts table:<name> permission tokens', () => {
    const ok = { ...baseManifest, permissions: ['storage:local', 'table:downloads'] }
    expect(validateManifestSchema(ok).valid).toBe(true)
  })

  it('flags a typo\'d config field type', () => {
    const bad = { ...baseManifest, config: { apiKey: { type: 'stirng', label: 'API Key' } } }
    const result = issuesByPath(bad)
    expect(result.valid).toBe(false)
    expect(result.map.get('config.apiKey.type')).toMatch(/unsupported/)
  })

  it('requires a human-readable label on every config field', () => {
    const bad = { ...baseManifest, config: { port: { type: 'number' } } }
    expect(errorPaths(bad)).toContain('config.port.label')
  })

  it('requires select fields to declare { value, label } options', () => {
    const noOpts = { ...baseManifest, config: { x: { type: 'select', label: 'X' } } }
    expect(errorPaths(noOpts)).toContain('config.x.values')
    const badEntries = {
      ...baseManifest,
      config: { x: { type: 'select', label: 'X', values: ['a'] } },
    }
    expect(errorPaths(badEntries)).toContain('config.x.values[0]')
  })

  it('validates enum option shape', () => {
    const bad = {
      ...baseManifest,
      config: { src: { type: 'enum', label: 'Source', values: [{ value: 'a', label: 'A' }] } },
    }
    expect(errorPaths(bad)).toContain('config.src.values')
  })

  it('rejects an invalid string pattern regex', () => {
    const bad = {
      ...baseManifest,
      config: { token: { type: 'string', label: 'T', pattern: '(' } },
    }
    const result = issuesByPath(bad)
    expect(result.valid).toBe(false)
    expect(result.map.get('config.token.pattern')).toMatch(/regular expression/)
  })

  it('reports object fields that are missing their sub-schema', () => {
    const bad = {
      ...baseManifest,
      config: { nested: { type: 'object', label: 'Nested' } },
    }
    expect(errorPaths(bad)).toContain('config.nested.items')
  })

  it('recurses into nested field schemas', () => {
    const bad = {
      ...baseManifest,
      config: {
        instance: {
          type: 'instances',
          label: 'Instances',
          items: {
            url: { type: 'serverUrl', label: 'URL', parts: ['host', 'port'] },
            apiKey: { type: 'secret', label: 'API Key' },
            bad: { type: 'wat', label: 'Bad' },
          },
        },
      },
    }
    const result = issuesByPath(bad)
    expect(result.valid).toBe(false)
    expect(result.map.get('config.instance.items.bad.type')).toMatch(/unsupported/)
  })

  it('warns (does not fail) when connection.fields miss an item', () => {
    const manifest = {
      ...baseManifest,
      config: {
        instances: {
          type: 'instances',
          label: 'Instances',
          connection: { method: 'probe', fields: ['url', 'nope'] },
          items: { url: { type: 'serverUrl', label: 'URL' } },
        },
      },
    }
    const { valid, issues } = validateManifestSchema(manifest)
    expect(valid).toBe(true)
    expect(
      issues.some(
        (i) => i.path === 'config.instances.connection.fields' && i.message.includes('"nope"'),
      ),
    ).toBe(true)
  })

  it('warns when a conditional `if` references a missing sibling', () => {
    const manifest = {
      ...baseManifest,
      config: {
        useAuth: { type: 'boolean', label: 'Use auth' },
        password: {
          type: 'secret',
          label: 'Password',
          if: { field: 'userName', truthy: true },
        },
      },
    }
    const { valid, issues } = validateManifestSchema(manifest)
    expect(valid).toBe(true)
    expect(issues.some((i) => i.path === 'config.password.if.field' && i.message.includes('userName'))).toBe(true)
  })

  it('warns on unknown field properties but stays valid', () => {
    const manifest = {
      ...baseManifest,
      config: {
        thing: { type: 'string', label: 'Thing', bogusProp: 1 },
      },
    }
    const { valid, issues } = validateManifestSchema(manifest)
    expect(valid).toBe(true)
    expect(issues.some((i) => i.path === 'config.thing.bogusProp')).toBe(true)
  })

  it('flags a default that contradicts its field schema as a warning', () => {
    const manifest = {
      ...baseManifest,
      config: {
        port: { type: 'number', label: 'Port', default: 'not-a-number' },
      },
    }
    const { valid, issues } = validateManifestSchema(manifest)
    expect(valid).toBe(true)
    expect(issues.some((i) => i.path === 'config.port.default')).toBe(true)
  })

  it('accepts a realistic full config schema with zero errors', () => {
    const manifest = {
      ...baseManifest,
      permissions: ['network:external', 'storage:local', 'events:subscribe', 'ui:settings'],
      config: {
        instances: {
          type: 'instances',
          label: 'Server instances',
          connection: { method: 'probe', fields: ['url', 'apiKey'] },
          items: {
            name: { type: 'string', label: 'Name', required: true },
            url: {
              type: 'serverUrl',
              label: 'Server URL',
              parts: ['host', 'port', 'useSsl', 'baseUrl'],
            },
            apiKey: { type: 'secret', label: 'API Key', required: true },
            qualityProfile: { type: 'string', label: 'Quality profile', fetchable: true },
            useSsl: { type: 'boolean', label: 'Use SSL', default: false, section: 'Connection' },
            tags: {
              type: 'list',
              label: 'Tags',
              items: { tag: { type: 'string', label: 'Tag' } },
            },
            autoRequest: {
              type: 'boolean',
              label: 'Auto-request watchlist',
              advanced: true,
              if: { field: 'useSsl', truthy: true },
            },
          },
        },
        scanDirectories: { type: 'path-list', label: 'Scan folders' },
        lastRun: { type: 'number', label: 'Last run', advanced: true },
      },
    }
    const { valid, issues } = validateManifestSchema(manifest)
    expect(valid).toBe(true)
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])
  })
})

describe('validateManifestSchema vs real plugins', () => {
  // Every shipped plugin manifest must pass schema validation with zero errors —
  // guards the allowlists and per-type rules against the real manifest corpus.
  const repoRoot = path.resolve(__dirname, '../../..')
  const extensionsDir = path.join(repoRoot, 'extensions', 'plugins')

  const realManifests: Array<{ id: string; raw: unknown }> = []
  if (fs.existsSync(extensionsDir)) {
    for (const dir of fs.readdirSync(extensionsDir, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue
      const manifestPath = path.join(extensionsDir, dir.name, 'manifest.json')
      if (!fs.existsSync(manifestPath)) continue
      try {
        realManifests.push({ id: dir.name, raw: JSON.parse(fs.readFileSync(manifestPath, 'utf8')) })
      } catch {
        // skip unparseable
      }
    }
  }

  it('finds shipped manifests to check', () => {
    expect(realManifests.length).toBeGreaterThan(5)
  })

  for (const { id, raw } of realManifests) {
    it(`accepts ${id}/manifest.json (errors only)`, () => {
      const { valid, issues } = validateManifestSchema(raw)
      const errors = issues.filter((i) => i.severity === 'error')
      expect(errors).toEqual([])
      if (!valid) {
        // Surface details in the failure message when it does trip.
        expect(issues.map((i) => `${i.path}: ${i.message}`)).toHaveLength(0)
      }
    })
  }
})
