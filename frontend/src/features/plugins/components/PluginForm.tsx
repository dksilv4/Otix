import { useId, useMemo, useState } from 'react'
import { Eye, EyeOff, FolderOpen, GripVertical, Plus, Trash2 } from 'lucide-react'
import type { PluginConfigField } from '@/features/plugins/types/plugins'
import { Button, Field, Input, Select, Switch } from '@/features/plugins/ui'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PluginFormProps {
  fields: Record<string, PluginConfigField>
  values: Record<string, unknown>
  errors?: Record<string, string>
  onChange: (key: string, value: unknown) => void
  /** Optional schema-level validator (e.g. desktop validateConfig) returning key→error. */
  onTest?: () => void
  testState?: { loading?: boolean; result?: { success: boolean; message: string } | null }
  onSubmit?: () => void
  submitting?: boolean
  submitLabel?: string
  /** Render inline (no Save/Test footer). */
  inline?: boolean
  className?: string
}

interface GroupedField {
  key: string
  field: PluginConfigField
}

// ── Visibility ────────────────────────────────────────────────────────────────

function isVisible(field: PluginConfigField, values: Record<string, unknown>): boolean {
  const cond = field.if
  if (!cond) return true
  const current = values[cond.field]
  if (cond.equals !== undefined) return current === cond.equals
  if (cond.not !== undefined) return current !== cond.not
  if (cond.truthy !== undefined) return cond.truthy ? Boolean(current) : !Boolean(current)
  return true
}

// ── Field input ───────────────────────────────────────────────────────────────

function ConfigFieldInput({
  field,
  value,
  error,
  onChange,
}: {
  field: PluginConfigField
  value: unknown
  error?: string
  onChange: (value: unknown) => void
}) {
  switch (field.type) {
    case 'boolean':
      return (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-sm text-white/85">{field.label}</span>
            {field.description && <p className="text-[11px] text-white/35 mt-0.5">{field.description}</p>}
          </div>
          <Switch checked={Boolean(value)} onCheckedChange={onChange} />
        </div>
      )

    case 'number':
      return (
        <Field label={field.label} description={field.description} error={error} required={field.required}>
          <Input
            type="number"
            value={(value ?? field.default ?? '') as string | number}
            min={field.min}
            max={field.max}
            step={field.step}
            placeholder={field.placeholder}
            invalid={!!error}
            onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          />
        </Field>
      )

    case 'secret':
      return (
        <SecretInput field={field} value={value} error={error} onChange={onChange} />
      )

    case 'enum':
      return (
        <Field label={field.label} description={field.description} error={error} required={field.required}>
          <Select
            options={(field.values as string[] | undefined)?.map((v) => ({ value: v, label: v })) || []}
            value={(value as string) ?? ''}
            invalid={!!error}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      )

    case 'select':
      return (
        <Field label={field.label} description={field.description} error={error} required={field.required}>
          <Select
            options={(field.values as Array<{ value: string; label: string }> | undefined) || []}
            value={(value as string) ?? ''}
            invalid={!!error}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      )

    case 'list':
      return <ListEditor field={field} value={value} error={error} onChange={onChange} />

    case 'path-list':
      return <PathListEditor field={field} value={value} error={error} onChange={onChange} />

    case 'object':
      return (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <p className="text-xs font-medium text-white/60 mb-3">{field.label}</p>
          {field.items && (
            <div className="space-y-4">
              {Object.entries(field.items).map(([subKey, subField]) => (
                <ConfigFieldInput
                  key={subKey}
                  field={subField}
                  value={(value as Record<string, unknown> | undefined)?.[subKey]}
                  onChange={(v) => onChange({ ...((value as Record<string, unknown>) || {}), [subKey]: v })}
                />
              ))}
            </div>
          )}
        </div>
      )

    default:
      return (
        <Field label={field.label} description={field.description} error={error} required={field.required}>
          <Input
            type="text"
            value={(value ?? field.default ?? '') as string}
            placeholder={field.placeholder}
            invalid={!!error}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      )
  }
}

function SecretInput({
  field,
  value,
  error,
  onChange,
}: {
  field: PluginConfigField
  value: unknown
  error?: string
  onChange: (value: unknown) => void
}) {
  const [revealed, setRevealed] = useState(false)
  const inputId = useId()
  return (
    <Field label={field.label} description={field.description} error={error} required={field.required} htmlFor={inputId}>
      <div className="relative">
        <Input
          id={inputId}
          type={revealed ? 'text' : 'password'}
          value={(value ?? '') as string}
          placeholder={field.placeholder}
          invalid={!!error}
          onChange={(e) => onChange(e.target.value)}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          aria-label={revealed ? 'Hide secret' : 'Reveal secret'}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors"
          tabIndex={-1}
        >
          {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </Field>
  )
}

function ListEditor({
  field,
  value,
  error,
  onChange,
}: {
  field: PluginConfigField
  value: unknown
  error?: string
  onChange: (value: unknown) => void
}) {
  const items = (Array.isArray(value) ? value : []) as Record<string, unknown>[]
  const hasItems = !!field.items

  const update = (idx: number, v: Record<string, unknown>) => {
    const next = [...items]
    next[idx] = v
    onChange(next)
  }
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx))
  const add = () => {
    const defaults: Record<string, unknown> = {}
    if (field.items) {
      for (const [k, f] of Object.entries(field.items)) defaults[k] = f.default
    }
    onChange([...items, defaults])
  }

  return (
    <Field label={field.label} description={field.description} error={error} required={field.required}>
      <div className="space-y-2">
        {items.length === 0 && <p className="text-xs text-white/30 italic">No items yet</p>}
        {items.map((item, idx) => (
          <div key={idx} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] text-white/40 font-medium">
                <GripVertical className="h-3.5 w-3.5" />
                Item {idx + 1}
              </span>
              <button
                type="button"
                onClick={() => remove(idx)}
                className="text-white/30 hover:text-red-400 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            {hasItems && field.items ? (
              <div className="space-y-3">
                {Object.entries(field.items).map(([subKey, subField]) => (
                  <ConfigFieldInput
                    key={subKey}
                    field={subField}
                    value={item[subKey]}
                    onChange={(v) => update(idx, { ...item, [subKey]: v })}
                  />
                ))}
              </div>
            ) : (
              <Input
                type="text"
                value={(item as unknown as string) || ''}
                onChange={(e) => update(idx, e.target.value as unknown as Record<string, unknown>)}
              />
            )}
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="h-3.5 w-3.5" /> Add item
        </Button>
      </div>
    </Field>
  )
}

function PathListEditor({
  field,
  value,
  error,
  onChange,
}: {
  field: PluginConfigField
  value: unknown
  error?: string
  onChange: (value: unknown) => void
}) {
  const paths = (Array.isArray(value) ? value : value ? [value] : []) as string[]

  const update = (idx: number, v: string) => {
    const next = [...paths]
    next[idx] = v
    onChange(next)
  }
  const remove = (idx: number) => onChange(paths.filter((_, i) => i !== idx))
  const add = () => onChange([...paths, ''])
  const browse = async (idx: number) => {
    const dir = await (window as any).desktopAPI?.selectDirectory?.()
    if (dir) update(idx, dir)
  }

  return (
    <Field label={field.label} description={field.description} error={error} required={field.required}>
      <div className="space-y-1.5">
        {paths.length === 0 && <p className="text-xs text-white/30 italic">No paths configured</p>}
        {paths.map((path, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Input
              type="text"
              value={path}
              placeholder={field.placeholder || '/path/to/games'}
              invalid={!!error}
              onChange={(e) => update(idx, e.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => browse(idx)}
              className="shrink-0 h-9 w-9 p-0"
              title="Browse folder"
            >
              <FolderOpen className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => remove(idx)}
              className="shrink-0 h-9 w-9 p-0 text-white/30 hover:text-red-400"
              title="Remove path"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="h-3.5 w-3.5" /> Add path
        </Button>
      </div>
    </Field>
  )
}

// ── Form ──────────────────────────────────────────────────────────────────────

export function PluginForm({
  fields,
  values,
  errors = {},
  onChange,
  onTest,
  testState,
  onSubmit,
  submitting,
  submitLabel = 'Save',
  inline,
  className,
}: PluginFormProps) {
  const { sections, advanced } = useMemo(() => {
    const grouped = new Map<string, GroupedField[]>()
    const adv: GroupedField[] = []
    for (const [key, field] of Object.entries(fields)) {
      const entry = { key, field }
      if (field.advanced) {
        adv.push(entry)
        continue
      }
      const section = field.section || 'General'
      if (!grouped.has(section)) grouped.set(section, [])
      grouped.get(section)!.push(entry)
    }
    for (const list of grouped.values()) {
      list.sort((a, b) => (a.field.order ?? 0) - (b.field.order ?? 0))
    }
    const sections = Array.from(grouped.entries()).map(([name, items]) => ({ name, items }))
    const defaultSectionIdx = sections.findIndex((s) => s.name === 'General')
    if (defaultSectionIdx > 0) {
      const [gen] = sections.splice(defaultSectionIdx, 1)
      sections.unshift(gen)
    }
    return { sections, advanced: adv.sort((a, b) => (a.field.order ?? 0) - (b.field.order ?? 0)) }
  }, [fields])

  const [showAdvanced, setShowAdvanced] = useState(false)

  const renderField = (entry: GroupedField) => {
    const { key, field } = entry
    if (!isVisible(field, values)) return null
    return (
      <ConfigFieldInput
        key={key}
        field={field}
        value={values[key]}
        error={errors[key]}
        onChange={(v) => onChange(key, v)}
      />
    )
  }

  return (
    <div className={cn('space-y-6', className)}>
      {sections.map(({ name, items }) => {
        const visible = items.filter((it) => isVisible(it.field, values))
        if (visible.length === 0) return null
        return (
          <section key={name}>
            {sections.length > 1 && (
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-white/35 mb-3">{name}</h4>
            )}
            <div className="space-y-4">
              {visible.map(renderField)}
            </div>
          </section>
        )
      })}

      {advanced.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowAdvanced((s) => !s)}
            className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-white/40 hover:text-white/70 transition-colors"
          >
            <span className={cn('inline-block w-1.5 h-1.5 rounded-full bg-white/30 transition-transform', showAdvanced && 'rotate-90')} />
            Advanced
          </button>
          {showAdvanced && (
            <div className="mt-4 space-y-4">{advanced.map(renderField)}</div>
          )}
        </section>
      )}

      {testState?.result && (
        <div
          className={cn(
            'rounded-xl border px-3.5 py-3 text-xs',
            testState.result.success
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
              : 'border-red-500/20 bg-red-500/10 text-red-400',
          )}
        >
          {testState.result.message}
        </div>
      )}

      {!inline && (
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.06]">
          {onTest && (
            <Button type="button" variant="outline" size="md" onClick={onTest} loading={testState?.loading}>
              Test Connection
            </Button>
          )}
          {onSubmit && (
            <Button type="button" variant="primary" size="md" onClick={onSubmit} loading={submitting}>
              {submitLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
