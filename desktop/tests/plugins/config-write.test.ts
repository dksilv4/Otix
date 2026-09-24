import { describe, it, expect } from 'vitest'
import { resolveConfigWrite } from '../../plugin-runtime/config-write'
import type { PluginConfigField } from '../../plugin-runtime/types'

const schema: Record<string, PluginConfigField> = {
  host: { type: 'string', label: 'Host' },
  port: { type: 'number', label: 'Port', min: 1, max: 65535 },
  verbose: { type: 'boolean', label: 'Verbose' },
  mode: { type: 'enum', label: 'Mode', values: ['a', 'b'] },
}

describe('resolveConfigWrite', () => {
  it('coerces a declared key to its schema type', () => {
    expect(resolveConfigWrite(schema, 'port', '8080')).toEqual({
      action: 'set',
      value: 8080,
    })
    expect(resolveConfigWrite(schema, 'verbose', 'true')).toEqual({
      action: 'set',
      value: true,
    })
    expect(resolveConfigWrite(schema, 'host', 'example.com')).toEqual({
      action: 'set',
      value: 'example.com',
    })
  })

  it('stores a declared key raw when the value fails validation', () => {
    const outcome = resolveConfigWrite(schema, 'port', 999999)
    expect(outcome.action).toBe('set-raw')
    if (outcome.action === 'set-raw') {
      expect(outcome.value).toBe(999999)
      expect(outcome.reason).toMatch(/port/)
    }
  })

  it('rejects an enum value outside the declared options', () => {
    const outcome = resolveConfigWrite(schema, 'mode', 'c')
    expect(outcome.action).toBe('set-raw')
  })

  it('ignores (does not persist) keys absent from the manifest schema', () => {
    const outcome = resolveConfigWrite(schema, 'sneakySecret', 'x')
    expect(outcome.action).toBe('ignore')
    if (outcome.action === 'ignore') {
      expect(outcome.reason).toMatch(/not declared/)
    }
  })

  it('ignores writes when the manifest declares no config at all', () => {
    expect(resolveConfigWrite(undefined, 'anything', 1).action).toBe('ignore')
  })
})
