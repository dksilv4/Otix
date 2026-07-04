import { useState, useEffect, useCallback, type ChangeEvent, type ReactNode } from 'react'
import { X, Loader2, CheckCircle2, AlertCircle, Lock, Gamepad2, LogOut, RefreshCw, Puzzle } from 'lucide-react'
import { SlidePanel } from '@/lib/modals'
import { batchMatchAndSave } from '@/features/plugins/utils/matching'
import { DkSwitch } from '@/old-features/ui/atoms/switch'

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
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <span className="text-sm text-white/80">{field.label}</span>
            {field.description && (
              <p className="text-xs text-white/40 mt-0.5">{field.description}</p>
            )}
          </div>
          <DkSwitch
            checked={Boolean(currentValue)}
            onCheckedChange={onChange}
          />
        </div>
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

function PluginAuthSection({
  pluginId,
  pluginName,
  api,
}: {
  pluginId: string
  pluginName: string
  api: PluginAPI
}) {
  const [authState, setAuthState] = useState<{
    loading: boolean; connected?: boolean; displayName?: string; message?: string
  }>({ loading: true })
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState<{ phase: string; current: number; total: number } | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const desktopAPI = (window as any).desktopAPI

  const checkStatus = useCallback(async () => {
    try {
      const s = await api.getStatus(pluginId) as any
      if (s && !s.error) {
        setAuthState({
          loading: false,
          connected: s.connected || s.authenticated || false,
          displayName: s.displayName,
          message: s.message,
        })
      } else {
        setAuthState({ loading: false, connected: false, message: s?.error || s?.message })
      }
    } catch {
      setAuthState({ loading: false, connected: false })
    }
  }, [api, pluginId])

  useEffect(() => { checkStatus() }, [checkStatus])

  const handleLogin = async () => {
    setActionLoading('login')
    try {
      const urlResult = await api.callData(pluginId, 'auth.getLoginUrl') as any
      if (!urlResult?.url) {
        setAuthState(prev => ({ ...prev, message: 'Failed to get login URL' }))
        return
      }
      const redirectPattern = urlResult.redirectPattern || 'id/api/redirect'
      const options = urlResult.tokenExtraction ? { tokenExtraction: urlResult.tokenExtraction } : undefined
      const winResult = await desktopAPI?.plugin?.openOAuthWindow(urlResult.url, redirectPattern, options)
      if (!winResult?.success || !winResult?.code) {
        if (!winResult?.success) setAuthState(prev => ({ ...prev, message: winResult?.error || 'Login cancelled' }))
        return
      }
      const cbRes = await api.callData(pluginId, 'auth.handleCallback', winResult.code) as any
      if (cbRes?.success) {
        await checkStatus()
        if (cbRes.scanResult?.games?.length) {
          await batchMatchAndSave(cbRes.scanResult.games, desktopAPI)
        }
      } else {
        setAuthState(prev => ({ ...prev, message: cbRes?.error || 'Authorization failed' }))
      }
    } catch (err) {
      setAuthState(prev => ({ ...prev, message: err instanceof Error ? err.message : 'Login failed' }))
    } finally {
      setActionLoading(null)
    }
  }

  const handleScan = async () => {
    setScanning(true)
    setScanProgress({ phase: 'scanning', current: 0, total: 0 })
    try {
      const scanPromise = api.callData(pluginId, 'scan')
      const pollInterval = setInterval(async () => {
        try {
          const prog = await api.callData(pluginId, 'scan.status') as any
          if (prog?.phase && prog.phase !== 'idle') {
            setScanProgress({ phase: prog.phase, current: prog.current || 0, total: prog.total || 0 })
          }
        } catch { /* polling race */ }
      }, 1000)

      const result = await scanPromise as any
      clearInterval(pollInterval)

      if (result?.success && result.games?.length) {
        const outcome = await batchMatchAndSave(result.games, desktopAPI)
        setAuthState(prev => ({ ...prev, scanTotal: result.total, scanMatched: outcome.matched }))
      } else {
        const errorMsg = result?.error
          ? (result.error === 'not_authenticated' ? `Not signed in to ${pluginName}. Sign in first.` :
             result.error === 'no_account_id' ? `No ${pluginName} account — sign in to scan your library.` :
             `Scan failed: ${result.error}`)
          : 'No games found in library'
        setAuthState(prev => ({ ...prev, message: errorMsg }))
      }
    } catch (err) {
      console.error('[PluginConfig] scan failed:', err)
    } finally {
      setScanning(false)
      setScanProgress(null)
    }
  }

  const handleLogout = async () => {
    setActionLoading('logout')
    try {
      await api.callData(pluginId, 'auth.logout')
      setAuthState({ loading: false, connected: false })
    } catch { /* ignore */ }
    finally { setActionLoading(null) }
  }

  if (authState.loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-sm text-white/50">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Checking connection...
      </div>
    )
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 12%, transparent)' }}>
          <Gamepad2 className="h-4 w-4" style={{ color: 'var(--primary)' }} />
        </div>

        {!authState.connected ? (
          <>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">{pluginName}</p>
              <p className="text-xs text-white/40">{authState.message || 'Sign in to sync your game library'}</p>
            </div>
            <button
              onClick={handleLogin}
              disabled={actionLoading === 'login'}
              className="inline-flex items-center gap-1.5 h-8 rounded-lg px-3 text-xs font-medium bg-primary/15 text-primary hover:bg-primary/25 transition-colors disabled:opacity-50 shrink-0"
            >
              {actionLoading === 'login' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Gamepad2 className="h-3 w-3" />}
              {actionLoading === 'login' ? 'Opening...' : 'Sign In'}
            </button>
          </>
        ) : (
          <>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-white">{authState.displayName || 'Connected'}</p>
                <span className="inline-flex items-center gap-1 text-[0.625rem] text-green-400 bg-green-500/10 rounded-full px-1.5 py-0.5">
                  <CheckCircle2 className="h-2.5 w-2.5" /> Connected
                </span>
              </div>
              {(authState as any).scanTotal != null && (
                <p className="text-xs text-white/40 mt-0.5">
                  {(authState as any).scanTotal} items{(authState as any).scanMatched != null ? ` · ${(authState as any).scanMatched} matched` : ''}
                </p>
              )}
              {scanProgress && scanProgress.phase !== 'done' && (
                <div className="mt-1.5">
                  <div className="flex items-center gap-2 text-xs text-white/40">
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    {scanProgress.phase === 'library' ? 'Fetching library...' :
                     scanProgress.phase === 'enriching' ? `Enriching (${scanProgress.current}/${scanProgress.total})` :
                     scanProgress.phase === 'local-scan' ? 'Scanning local installs...' :
                     scanProgress.phase === 'merging' ? 'Merging results...' :
                     'Scanning...'}
                  </div>
                  {scanProgress.total > 0 && (
                    <div className="mt-1 h-0.5 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${Math.min(100, (scanProgress.current / scanProgress.total) * 100)}%` }} />
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={handleScan} disabled={scanning || !!actionLoading}
                className="inline-flex items-center gap-1.5 h-8 rounded-lg px-3 text-xs font-medium bg-white/5 text-white/70 hover:bg-white/10 transition-colors disabled:opacity-50"
                title="Scan library">
                {scanning ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                {scanning ? 'Scanning...' : 'Scan'}
              </button>
              <button onClick={handleLogout} disabled={actionLoading === 'logout'}
                className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-white/40 hover:text-red-400 hover:bg-white/5 transition-colors disabled:opacity-50"
                title="Disconnect">
                {actionLoading === 'logout' ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
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

  // Only show advanced section if there are user-facing advanced fields (not auto-managed)
  const userAdvancedFields = advancedFields.filter(
    ([_key, field]) => !(field as any).label?.includes('auto-managed'),
  )
  // Only show "Test Connection" if plugin has fields worth testing (API keys, hosts, etc.)
  const hasTestableConfig = [...basicFields, ...userAdvancedFields].some(
    ([_key, field]) => (field as any).type === 'secret' || (field as any).type === 'string',
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
      <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Puzzle className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">{plugin.name}</h2>
            <p className="text-[11px] text-white/40">Plugin configuration</p>
          </div>
        </div>
        <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {plugin.description && (
          <p className="text-sm text-white/60 leading-relaxed">{plugin.description}</p>
        )}

        {/* Auth / Connection section (only for plugins with slots — OAuth flow plugins) */}
        {(plugin.manifest as any).slots?.length > 0 && (
          <PluginAuthSection pluginId={plugin.id} pluginName={plugin.name} api={api} />
        )}

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

        {userAdvancedFields.length > 0 && (
          <div className="pt-5">
            <h3 className="text-sm font-medium text-white/60 mb-4">Advanced Settings</h3>
            {connectionConfirmed ? (
              <div className="space-y-5">
                {userAdvancedFields.map(([key, field]) => (
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

        {basicFields.length === 0 && userAdvancedFields.length === 0 && (
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
      <div className="px-6 py-4 flex items-center justify-between border-t border-white/[0.06]">
        <p className="text-xs text-white/30">{manifest.version ? `v${manifest.version}` : ''}</p>
        <div className="flex items-center gap-2">
          {hasTestableConfig && (
            <button
              onClick={handleTest}
              disabled={testing}
              className="inline-flex items-center gap-2 h-9 rounded-lg px-4 text-xs font-medium border border-white/10 text-white/70 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              {testing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Test Connection
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 h-9 rounded-lg px-5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </SlidePanel>
  )
}
