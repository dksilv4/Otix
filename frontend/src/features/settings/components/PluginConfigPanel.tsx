import { useState, useEffect, useCallback, type ChangeEvent, type ReactNode } from 'react'
import { X, Loader2, CheckCircle2, AlertCircle, Lock } from 'lucide-react'
import { SlidePanel } from '@/lib/modals'

interface PluginConfigField {
  type: string
  label: string
  description?: string
  default?: unknown
  values?: string[]
  items?: Record<string, PluginConfigField>
  required?: boolean
  advanced?: boolean
}

interface PluginManifest {
  name: string
  version: string
  description: string
  author: string
  repository: string
  min_app_version: string
  icon?: string
  permissions: string[]
  config?: Record<string, PluginConfigField>
  entry: { main: string; renderer?: string }
  services?: string[]
}

interface PluginInfo {
  id: string
  name: string
  version: string
  description: string
  author: string
  repository: string
  status: string
  error?: string
  manifest: PluginManifest
}

interface PluginAPI {
  getConfig(pluginId: string): Promise<Record<string, unknown>>
  setConfig(pluginId: string, key: string, value: unknown): Promise<void>
  testConfig(pluginId: string, config: Record<string, unknown>): Promise<{ success: boolean; message: string }>
  getStatus(pluginId: string): Promise<Record<string, unknown> | null>
  callData(pluginId: string, method: string, ...args: unknown[]): Promise<unknown>
}

type CustomFieldRenderer = (props: {
  field: PluginConfigField
  value: unknown
  onChange: (value: unknown) => void
  parentItem?: Record<string, unknown>
  idx?: number
}) => ReactNode | null

function ConfigField({
  field,
  value,
  onChange,
  customRenderers,
  fieldPath,
  parentItem,
  idx,
}: {
  field: PluginConfigField
  value: unknown
  onChange: (value: unknown) => void
  customRenderers?: Record<string, CustomFieldRenderer>
  fieldPath?: string
  parentItem?: Record<string, unknown>
  idx?: number
}) {
  const currentValue = value ?? field.default ?? ''

  // Check custom renderer first
  if (customRenderers && fieldPath && fieldPath in customRenderers) {
    const Renderer = customRenderers[fieldPath]
    return <Renderer field={field} value={value} onChange={onChange} parentItem={parentItem} idx={idx} />
  }

  switch (field.type) {
    case 'boolean':
      return (
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(currentValue)}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-white/5 text-primary focus:ring-primary/50"
          />
          <span className="text-sm text-white/80">{field.label}</span>
        </label>
      )

    case 'number':
      return (
        <div>
          <label className="block text-xs text-white/40 mb-1">{field.label}</label>
          <input
            type="number"
            value={currentValue as string | number}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value))}
            placeholder={field.description ?? ''}
            className="w-full h-9 rounded-lg px-3 text-sm text-white bg-white/5 placeholder:text-white/20 focus:outline-none transition-colors"
          />
        </div>
      )

    case 'secret':
      return (
        <div>
          <label className="block text-xs text-white/40 mb-1">{field.label}</label>
          <input
            type="password"
            value={currentValue as string}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
            placeholder={field.description ?? ''}
            className="w-full h-9 rounded-lg px-3 text-sm text-white bg-white/5 placeholder:text-white/20 focus:outline-none transition-colors"
          />
        </div>
      )

    case 'enum':
      return (
        <div>
          <label className="block text-xs text-white/40 mb-1">{field.label}</label>
          <select
            value={currentValue as string}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
            className="w-full h-9 rounded-lg px-3 text-sm text-white bg-white/5 focus:outline-none transition-colors appearance-none"
          >
            {(field.values ?? []).map((opt: string) => (
              <option key={opt} value={opt} className="bg-[var(--dk-surface-overlay)]">{opt}</option>
            ))}
          </select>
        </div>
      )

    case 'list':
      return (
        <div>
          <label className="block text-xs text-white/40 mb-1">{field.label}</label>
          <div className="space-y-2">
            {((currentValue as Record<string, unknown>[]) || []).map((item: Record<string, unknown>, itemIdx: number) => (
              <div key={itemIdx} className="p-3 rounded-xl bg-white/5 space-y-2">
                {field.items && Object.entries(field.items).map(([subKey, subField]) => (
                  <ConfigField
                    key={subKey}
                    field={subField}
                    value={item[subKey]}
                    onChange={(val) => {
                      const next = [...((currentValue as Record<string, unknown>[]) || [] )]
                      next[itemIdx] = { ...next[itemIdx], [subKey]: val }
                      onChange(next)
                    }}
                    customRenderers={customRenderers}
                    fieldPath={fieldPath ? fieldPath + '.' + subKey : subKey}
                    parentItem={item}
                    idx={itemIdx}
                  />
                ))}
              </div>
            ))}
            <button
              type="button"
              onClick={() => onChange([...(currentValue as Record<string, unknown>[] || []), {}])}
              className="w-full h-9 rounded-xl text-xs text-white/40 hover:text-white/60 border border-dashed border-white/10 hover:border-white/20 transition-colors"
            >
              + Add {field.label}
            </button>
          </div>
        </div>
      )

    default:
      return (
        <div>
          <label className="block text-xs text-white/40 mb-1">{field.label}</label>
          <input
            type="text"
            value={currentValue as string}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
            placeholder={field.description ?? ''}
            className="w-full h-9 rounded-lg px-3 text-sm text-white bg-white/5 placeholder:text-white/20 focus:outline-none transition-colors"
          />
        </div>
      )
  }
}

export function PluginConfigPanel({
  plugin,
  api,
  onClose,
  isExiting,
  customRenderers,
}: {
  plugin: PluginInfo
  api: PluginAPI
  onClose: () => void
  isExiting?: boolean
  customRenderers?: Record<string, CustomFieldRenderer>
}) {
  const manifest = plugin.manifest
  const fields = manifest.config ? Object.entries(manifest.config) : []
  const { basicFields, advancedFields } = fields.reduce(
    (acc, [key, field]) => {
      if ((field as any).advanced) {
        acc.advancedFields.push([key, field])
      } else {
        acc.basicFields.push([key, field])
      }
      return acc
    },
    { basicFields: [] as [string, any][], advancedFields: [] as [string, any][] },
  )

  // ── Self-managed state ──
  const [configValues, setConfigValues] = useState<Record<string, unknown>>({})
  const [status, setStatus] = useState<Record<string, unknown> | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [connectionConfirmed, setConnectionConfirmed] = useState(false)

  // Load config + status on mount
  useEffect(() => {
    async function load() {
      try {
        const cfg = await api.getConfig(plugin.id)
        const defaults: Record<string, unknown> = {}
        if (plugin.manifest.config) {
          for (const [key, field] of Object.entries(plugin.manifest.config)) {
            defaults[key] = cfg[key] ?? field.default
          }
        }
        setConfigValues(defaults)
      } catch {
        const defaults: Record<string, unknown> = {}
        if (plugin.manifest.config) {
          for (const [key, field] of Object.entries(plugin.manifest.config)) {
            defaults[key] = field.default
          }
        }
        setConfigValues(defaults)
      }
    }
    load()
    api?.getStatus(plugin.id).then(s => setStatus(s)).catch(() => {})
  }, [plugin.id, api])

  const handleFieldChange = useCallback((key: string, value: unknown) => {
    setConfigValues(prev => ({ ...prev, [key]: value }))
    setTestResult(null)
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      for (const [key, value] of Object.entries(configValues)) {
        await api.setConfig(plugin.id, key, value)
      }
      onClose()
    } catch {
      // Keep panel open on error
    } finally {
      setSaving(false)
    }
  }, [api, plugin.id, configValues, onClose])

  const handleTest = useCallback(async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await api.testConfig(plugin.id, configValues)
      setTestResult(result)
      if (result.success) {
        setConnectionConfirmed(true)
      }
    } catch (err) {
      setTestResult({ success: false, message: err instanceof Error ? err.message : 'Test failed' })
    } finally {
      setTesting(false)
    }
  }, [api, plugin.id, configValues])

  return (
    <SlidePanel onClose={onClose} isExiting={isExiting}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5">
        <h2 className="text-lg font-semibold text-white">{plugin.name}</h2>
        <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {status && !status.error && (
          <div className="mb-6 p-4 rounded-xl bg-white/5 space-y-2">
            <h4 className="text-xs font-medium text-white/40 uppercase tracking-wide">Status</h4>
            {Object.entries(status).map(([key, value]) => {
              if (key === 'recent_syncs' || key === 'last_sync') return null
              return (
                <div key={key} className="flex items-center justify-between text-sm">
                  <span className="text-white/50 capitalize">{key.replace(/_/g, ' ')}</span>
                  <span className="text-white/80 font-mono text-xs">
                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                  </span>
                </div>
              )
            })}
            {status.last_sync && (
              <div className="text-xs text-white/30 pt-1">
                Last sync: {status.last_sync.title} ({status.last_sync.direction}) &mdash; {new Date(status.last_sync.synced_at).toLocaleString()}
              </div>
            )}
          </div>
        )}

        {status?.error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/5 text-sm text-red-400">
            {String(status.error)}
          </div>
        )}

        {basicFields.map(([key, field]) => (
          <ConfigField
            key={key}
            field={field}
            value={configValues[key]}
            onChange={(val) => handleFieldChange(key, val)}
            customRenderers={customRenderers}
            fieldPath={key}
          />
        ))}

        {advancedFields.length > 0 && (
          <div className="pt-5">
            <h3 className="text-sm font-medium text-white/60 mb-4">Advanced Settings</h3>
            {connectionConfirmed ? (
              <div className="space-y-5">
                {advancedFields.map(([key, field]) => (
                  <ConfigField key={key} field={field} value={configValues[key]} onChange={(val) => handleFieldChange(key, val)} customRenderers={customRenderers} fieldPath={key} />
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-white/5">
                <Lock className="h-4 w-4 text-white/30" />
                <p className="text-sm text-white/30">Test your connection to unlock additional settings.</p>
              </div>
            )}
          </div>
        )}

        {basicFields.length === 0 && advancedFields.length === 0 && (
          <p className="text-sm text-white/40">No configurable settings for this plugin.</p>
        )}

        {testResult && (
          <div className={`p-3 rounded-xl text-sm flex items-start gap-2 ${
            testResult.success
              ? 'bg-green-500/10 text-green-400'
              : 'bg-red-500/10 text-red-400'
          }`}>
            {testResult.success ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            )}
            <span>{testResult.message}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 flex items-center justify-between">
        <p className="text-xs text-white/30">{manifest.version ? `v${manifest.version}` : ''}</p>
        <div className="flex items-center gap-2">
          <button
            onClick={handleTest}
            disabled={testing}
            className="inline-flex items-center gap-2 h-10 rounded-xl px-4 text-sm font-medium border border-white/10 text-white/70 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Test Connection
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 h-10 rounded-xl px-6 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </SlidePanel>
  )
}
