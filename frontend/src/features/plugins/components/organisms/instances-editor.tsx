import { useCallback, useEffect, useState } from 'react'
import { Check, Loader2, Plug, Plus, RefreshCw, Server, Settings, Trash2, XCircle } from 'lucide-react'
import type { PluginAPI } from '@/features/plugins/api'
import type { PluginConfigField } from '@/features/plugins/types/plugins'
import { Badge, Button, Field, Input, Select, Switch } from '@/features/plugins/ui'
import { cn } from '@/lib/utils'

// Generic editor for manifest-declared `instances` config fields. The plugin
// fully describes instance creation in its manifest:
//
//   "instances": {
//     "type": "instances",
//     "label": "My Server Instances",
//     "connection": { "method": "probe", "fields": ["url", "apiKey"] },
//     "items": {
//       "name":  { "type": "string", "label": "Name" },
//       "url":   { "type": "serverUrl", "label": "Server URL", "parts": ["host", "port", "useSsl", "baseUrl"] },
//       "apiKey": { "type": "secret", "label": "API Key" },
//       "profile": { "type": "string", "label": "Profile", "fetchable": true },
//       ...
//     }
//   }
//
// Contract the plugin must implement as data methods:
//   get-instances   → Instance[]            (list)
//   add-instance    → { success, error? }   (config payload)
//   update-instance → { success, error? }   ({ id, config })
//   remove-instance → { success, error? }   ({ id })
//   test-instance   → { ok, message? }      ({ id })
//   <connection.method> (default "probe")   → { ok, version?, options?, error? }
//
//   The connection method receives the flattened connection fields (e.g.
//   { host, port, useSsl, baseUrl, apiKey }) and returns `options` keyed by
//   item name for any `fetchable` selector:
//   { ok: true, version: "5.3.0", options: { profile: [{ value, label }] } }
//
// Sub-field semantics:
//   - `serverUrl`  → single "Connection URL" input; `parts` lists the instance
//                    payload keys it maps to (canonical: host/port/useSsl/baseUrl)
//   - `fetchable`  → dropdown populated from the connection method's options
//   - `secret`     → password input (API key/credential)
//   - `id` is plugin-managed and never part of the manifest

type InstanceRecord = Record<string, unknown>

interface ProbeOptions {
  [field: string]: Array<{ value: string; label: string }>
}

interface ProbeResult {
  ok: boolean
  version?: string
  options?: ProbeOptions
  error?: string
}

const URL_PARTS = ['host', 'port', 'useSsl', 'baseUrl'] as const
type UrlParts = (typeof URL_PARTS)[number]

function parseServerUrl(raw: string): Pick<InstanceRecord, UrlParts> | null {
  const input = raw.trim()
  if (!input) return null
  let u: URL
  try {
    u = new URL(input.includes('://') ? input : `http://${input}`)
  } catch {
    return null
  }
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : undefined,
    useSsl: u.protocol === 'https:',
    baseUrl: u.pathname.replace(/\/+$/, ''),
  }
}

function composeUrl(inst: InstanceRecord): string {
  const host = inst.host as string
  if (!host) return ''
  const scheme = inst.useSsl ? 'https' : 'http'
  const port = inst.port ? `:${inst.port}` : ''
  return `${scheme}://${host}${port}${(inst.baseUrl as string) || ''}`
}

function instanceSummary(items: Record<string, PluginConfigField>, inst: InstanceRecord): string {
  const urlKey = Object.keys(items).find((k) => items[k].type === 'serverUrl')
  if (urlKey) {
    const composed = composeUrl(inst)
    if (composed) return composed
  }
  const parts = Object.keys(items).filter(
    (k) => items[k].type !== 'serverUrl' && items[k].type !== 'secret' && inst[k] != null && inst[k] !== '',
  )
  const joined = parts.map((k) => String(inst[k])).join(' · ')
  return joined || inst.id || 'Unnamed'
}

function parseParts(raw: string, parts: string[]): Partial<Record<UrlParts, unknown>> | null {
  const parsed = parseServerUrl(raw)
  if (!parsed) return null
  const out: Partial<Record<UrlParts, unknown>> = {}
  for (const part of parts) {
    if ((URL_PARTS as readonly string[]).includes(part)) out[part as UrlParts] = parsed[part as UrlParts]
  }
  return out
}

export function InstancesEditor({
  field,
  pluginId,
  api,
}: {
  field: PluginConfigField
  pluginId?: string
  api?: PluginAPI | null
}) {
  const items = field.items || {}
  const connection = field.connection || {}
  const allKeys = Object.keys(items)
  const connectKeys = connection.fields || []
  const connectSet = new Set(connectKeys)
  const probeMethod = connection.method || 'probe'
  const urlKeys = allKeys.filter((k) => items[k].type === 'serverUrl')
  const secretKeys = allKeys.filter((k) => items[k].type === 'secret')
  const detailKeys = allKeys.filter((k) => !connectSet.has(k))
  const hasConnect = connectKeys.length > 0

  const [instances, setInstances] = useState<InstanceRecord[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, unknown>>({})
  const [connecting, setConnecting] = useState(false)
  const [probe, setProbe] = useState<ProbeResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({})

  const load = useCallback(async () => {
    if (!api || !pluginId) return
    try {
      const res = (await api.callData(pluginId, 'get-instances')) as InstanceRecord[]
      setInstances(Array.isArray(res) ? res : [])
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load instances')
    }
  }, [api, pluginId])

  useEffect(() => {
    load()
  }, [load])

  if (!api || !pluginId) return null

  const emptyForm = () => {
    const f: Record<string, unknown> = {}
    for (const k of allKeys) {
      const sub = items[k]
      f[k] = sub.type === 'serverUrl' ? '' : sub.default ?? (sub.type === 'boolean' ? false : '')
    }
    return f
  }

  const fromInstance = (inst: InstanceRecord) => {
    const f: Record<string, unknown> = {}
    for (const k of allKeys) {
      const sub = items[k]
      f[k] = sub.type === 'serverUrl' ? composeUrl(inst) : inst[k] ?? sub.default ?? (sub.type === 'boolean' ? false : '')
    }
    return f
  }

  const update = (patch: Record<string, unknown>) => setForm((f) => ({ ...f, ...patch }))

  const openAdd = () => {
    setEditingId(null)
    setForm(emptyForm())
    setProbe(null)
    setAdding(true)
  }

  const openEdit = (inst: InstanceRecord) => {
    setEditingId((inst.id as string) ?? null)
    setForm(fromInstance(inst))
    // Pretend a successful probe so the form fields are editable without
    // re-connecting; "Connect & fetch" re-probes for fresh dropdowns.
    setProbe({ ok: true })
    setAdding(true)
  }

  const closeForm = () => {
    setAdding(false)
    setEditingId(null)
    setProbe(null)
    setForm({})
  }

  const connectArgs = (): Record<string, unknown> | null => {
    const args: Record<string, unknown> = {}
    for (const k of connectKeys) {
      const sub = items[k]
      if (sub.type === 'serverUrl') {
        const parts = parseParts(String(form[k] ?? ''), sub.parts || [])
        if (!parts) return null
        Object.assign(args, parts)
      } else {
        args[k] = form[k]
      }
    }
    return args
  }

  const missingRequired = () => {
    for (const k of secretKeys) {
      if (!connectSet.has(k)) continue
      if (!String(form[k] ?? '').trim()) return `${items[k].label} is required.`
    }
    return null
  }

  const handleConnect = async () => {
    const args = connectArgs()
    if (!args) {
      setProbe({ ok: false, error: 'Enter a valid URL, e.g. http://192.168.1.50:7878/radarr' })
      return
    }
    const req = missingRequired()
    if (req) {
      setProbe({ ok: false, error: req })
      return
    }
    setConnecting(true)
    setProbe(null)
    try {
      const res = (await api.callData(pluginId, probeMethod, args)) as ProbeResult
      setProbe(res)
      if (res?.ok && !String(form.name ?? '').trim()) {
        const hostItem = urlKeys[0]
        if (hostItem) {
          const parts = parseParts(String(form[hostItem] ?? ''), items[hostItem].parts || [])
          if (parts?.host) update({ name: parts.host })
        }
      }
    } catch (e) {
      setProbe({ ok: false, error: e instanceof Error ? e.message : 'Probe failed' })
    } finally {
      setConnecting(false)
    }
  }

  const buildPayload = () => {
    const payload: Record<string, unknown> = {}
    for (const k of allKeys) {
      const sub = items[k]
      if (sub.type === 'serverUrl') {
        const parts = parseParts(String(form[k] ?? ''), sub.parts || [])
        if (parts) Object.assign(payload, parts)
      } else {
        const v = form[k]
        payload[k] = sub.type === 'number' ? (v === '' || v == null ? undefined : Number(v)) : v
      }
    }
    return payload
  }

  const handleSave = async () => {
    for (const k of urlKeys) {
      if (!parseServerUrl(String(form[k] ?? ''))) {
        setProbe({ ok: false, error: 'Enter a valid URL, e.g. http://192.168.1.50:7878/radarr' })
        return
      }
    }
    const req = missingRequired()
    if (req) {
      setProbe({ ok: false, error: req })
      return
    }
    setSaving(true)
    try {
      const payload = buildPayload()
      const res = (await api.callData(
        pluginId,
        editingId ? 'update-instance' : 'add-instance',
        editingId ? { id: editingId, config: payload } : payload,
      )) as { success?: boolean; error?: string } | undefined
      if (res && res.success === false) {
        setProbe({ ok: false, error: res.error || 'Failed to save instance' })
        return
      }
      closeForm()
      await load()
    } catch (e) {
      setProbe({ ok: false, error: e instanceof Error ? e.message : 'Failed to save instance' })
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async (inst: InstanceRecord) => {
    const id = inst.id as string
    setBusyKey(`test:${id}`)
    try {
      const res = (await api.callData(pluginId, 'test-instance', { id })) as { ok?: boolean; message?: string }
      setTestResults((prev) => ({
        ...prev,
        [id]: { ok: !!res?.ok, message: res?.ok ? res.message || 'Connected' : res?.message || 'Failed' },
      }))
    } catch (e) {
      setTestResults((prev) => ({ ...prev, [id]: { ok: false, message: e instanceof Error ? e.message : 'Failed' } }))
    } finally {
      setBusyKey(null)
    }
  }

  const handleRemove = async (inst: InstanceRecord) => {
    const id = inst.id as string
    setBusyKey(`remove:${id}`)
    try {
      await api.callData(pluginId, 'remove-instance', { id })
      await load()
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to remove instance')
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold text-white">{field.label}</h4>
          {instances && (
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-white/40">{instances.length}</span>
          )}
        </div>
        {!adding && (
          <Button size="sm" variant="outline" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5" /> Add instance
          </Button>
        )}
      </div>

      {loadError && (
        <p className="mb-2 text-xs text-red-400 inline-flex items-center gap-1">
          <XCircle className="h-3 w-3" /> {loadError}
        </p>
      )}

      {instances === null ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        </div>
      ) : instances.length === 0 && !adding ? (
        <p className="py-2 text-xs text-white/30 italic">No instances configured yet.</p>
      ) : (
        <div className="space-y-1.5">
          {instances.map((inst) => {
            const id = inst.id as string
            const test = testResults[id]
            return (
              <div key={id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Server className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-white">{inst.name || id || 'Unnamed'}</p>
                      {typeof inst.enabled === 'boolean' && (
                        <Badge tone={inst.enabled ? 'success' : 'default'} dot>
                          {inst.enabled ? 'enabled' : 'disabled'}
                        </Badge>
                      )}
                    </div>
                    <p className="truncate font-mono text-[11px] text-white/40">{instanceSummary(items, inst)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {test && (
                      <span
                        className={cn('max-w-[180px] truncate text-[11px]', test.ok ? 'text-emerald-400' : 'text-red-400')}
                      >
                        {test.message}
                      </span>
                    )}
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => handleTest(inst)}
                      loading={busyKey === `test:${id}`}
                      title="Test connection"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => openEdit(inst)}
                      disabled={!!busyKey}
                      title="Edit"
                    >
                      <Settings className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => handleRemove(inst)}
                      loading={busyKey === `remove:${id}`}
                      className="text-white/30 hover:text-red-400"
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {adding && (
        <div className="mt-4 space-y-4 rounded-xl border border-primary/20 bg-white/[0.02] p-5">
          {hasConnect && (
            <>
              <p className="text-[11px] font-medium uppercase tracking-wider text-white/30">Connection</p>
              <div className="space-y-3">
                {connectKeys.map((k) => {
                  const sub = items[k]
                  if (sub.type === 'serverUrl') {
                    return (
                      <Field key={k} label={sub.label} description={sub.description}>
                        <Input
                          type="text"
                          value={String(form[k] ?? '')}
                          onChange={(e) => update({ [k]: e.target.value })}
                          placeholder={sub.placeholder || 'http://localhost:7878/radarr'}
                        />
                      </Field>
                    )
                  }
                  if (sub.type === 'secret') {
                    return (
                      <Field key={k} label={sub.label} description={sub.description}>
                        <Input
                          type="password"
                          value={String(form[k] ?? '')}
                          onChange={(e) => update({ [k]: e.target.value })}
                          placeholder={sub.placeholder || 'API key'}
                        />
                      </Field>
                    )
                  }
                  return <SubFieldInput key={k} subField={sub} value={form[k]} onChange={(v) => update({ [k]: v })} />
                })}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" variant="outline" onClick={handleConnect} loading={connecting}>
                  <Plug className="h-3.5 w-3.5" /> {connecting ? 'Connecting...' : 'Connect & fetch'}
                </Button>
                {probe?.ok && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                    <Check className="h-3 w-3" />
                    Connected{probe.version ? ` — v${probe.version}` : ''}
                  </span>
                )}
                {probe && !probe.ok && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-red-400">
                    <XCircle className="h-3 w-3" /> {probe.error}
                  </span>
                )}
              </div>
            </>
          )}

          {(probe?.ok || !hasConnect) && detailKeys.length > 0 && (
            <>
              <p className="text-[11px] font-medium uppercase tracking-wider text-white/30">Details</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {detailKeys.map((k) => (
                  <SubFieldInput
                    key={k}
                    subField={items[k]}
                    value={form[k]}
                    options={items[k].fetchable ? probe?.options?.[k] : undefined}
                    fullWidth={k === 'name'}
                    onChange={(v) => update({ [k]: v })}
                  />
                ))}
              </div>
            </>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] pt-3">
            <Button size="sm" variant="ghost" onClick={closeForm}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={handleSave}
              loading={saving}
              disabled={hasConnect && !probe?.ok}
            >
              {editingId ? 'Save instance' : 'Add instance'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function SubFieldInput({
  subField,
  value,
  options,
  fullWidth = false,
  onChange,
}: {
  subField: PluginConfigField
  value: unknown
  options?: Array<{ value: string; label: string }>
  fullWidth?: boolean
  onChange: (value: unknown) => void
}) {
  const spanFull = fullWidth || subField.type === 'boolean'

  if (options && options.length > 0) {
    return (
      <div className={spanFull ? 'sm:col-span-2' : ''}>
        <Field label={subField.label} description={subField.description}>
          <Select
            options={[{ value: '', label: '— Select —' }, ...options]}
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      </div>
    )
  }

  switch (subField.type) {
    case 'boolean':
      return (
        <div className="sm:col-span-2 flex items-center gap-3">
          <span className="flex-1 text-sm text-white/70">{subField.label}</span>
          <Switch checked={Boolean(value)} onCheckedChange={onChange} />
        </div>
      )
    case 'number':
      return (
        <Field label={subField.label} description={subField.description}>
          <Input
            type="number"
            value={value ?? ''}
            placeholder={subField.placeholder}
            onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          />
        </Field>
      )
    case 'secret':
      return (
        <Field label={subField.label} description={subField.description}>
          <Input
            type="password"
            value={String(value ?? '')}
            placeholder={subField.placeholder || 'API key'}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      )
    case 'enum':
    case 'select':
      return (
        <Field label={subField.label} description={subField.description}>
          <Select
            options={(subField.values as string[] | undefined)?.map((v) => ({ value: v, label: v })) || []}
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      )
    default:
      return (
        <Field label={subField.label} description={subField.description}>
          <Input
            type="text"
            value={String(value ?? '')}
            placeholder={subField.placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      )
  }
}
