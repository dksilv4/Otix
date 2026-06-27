// frontend/src/features/_config/slots/SlotRenderer.tsx
//
// Widget props are Zod-validated at runtime (see WidgetCatalog.ts). The `as any`
// casts bridge from runtime string enums to DK UI component union types — the
// Zod schemas guarantee correctness; TypeScript cannot verify cross-boundary unions.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { type ReactNode, useState, type ChangeEvent } from 'react'
import { ErrorBoundary } from './error-boundary'
import { ErrorCard } from './error-card'
import { validateWidget } from './widget-catalog'
import type { SlotContribution, SlotWidget } from './types'
import { DkButton } from '@/old-features/ui/atoms/button'
import { DkCard } from '@/old-features/ui/molecules/card'
import { DkInput } from '@/old-features/ui/atoms/input'
import { DkSelect } from '@/old-features/ui/atoms/select'
import { DkBadge } from '@/old-features/ui/atoms/badge'
import { DkTabs, DkTabList, DkTab, DkTabPanel } from '@/old-features/ui/molecules/tabs'
import { DkSeparator } from '@/old-features/ui/atoms/separator'
import { DkSpinner } from '@/old-features/ui/atoms/spinner'
import { DkSkeleton } from '@/old-features/ui/atoms/skeleton'
import { DkDeferredSection } from '@/old-features/ui/molecules/deferred-section'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'

// ── SlotRenderer (top-level) ─────────────────────────────────────────────

interface SlotRendererProps {
  contributions: SlotContribution[]
  onAction?: (pluginId: string, actionKey: string, payload: unknown) => void | Promise<void>
  loading?: boolean
  emptyFallback?: ReactNode
}

export function SlotRenderer({ contributions, onAction, loading, emptyFallback }: SlotRendererProps) {
  if (loading) {
    return <SlotSkeleton />
  }

  if (!contributions || contributions.length === 0) {
    return <>{emptyFallback || null}</>
  }

  return (
    <div className="slot-renderer" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {contributions.map((contribution) => (
        <ErrorBoundary
          key={contribution.pluginId}
          fallback={
            <ErrorCard
              pluginName={contribution.label || contribution.pluginId}
              message="Failed to render plugin content"
            />
          }
        >
          <PluginContributionRenderer contribution={contribution} onAction={onAction} />
        </ErrorBoundary>
      ))}
    </div>
  )
}

// ── Plugin-level isolation ────────────────────────────────────────────────

function PluginContributionRenderer({ contribution, onAction }: {
  contribution: SlotContribution
  onAction?: (pluginId: string, actionKey: string, payload: unknown) => void | Promise<void>
}) {
  if (!contribution.data?.widgets) {
    return (
      <ErrorCard
        pluginName={contribution.label || contribution.pluginId}
        message="No widget data returned"
      />
    )
  }

  return (
    <>
      {contribution.data.widgets.map((widget, idx) => (
        <ErrorBoundary
          key={widget.key || `${contribution.pluginId}-${idx}`}
          fallback={
            <ErrorCard
              pluginName={contribution.label || contribution.pluginId}
              message={`Widget "${widget.type}" failed to render`}
            />
          }
        >
          <WidgetRenderer
            widget={widget}
            pluginId={contribution.pluginId}
            onAction={onAction}
          />
        </ErrorBoundary>
      ))}
    </>
  )
}

// ── Widget-level isolation + recursive children ───────────────────────────

function WidgetRenderer({ widget, pluginId, onAction }: {
  widget: SlotWidget
  pluginId: string
  onAction?: (pluginId: string, actionKey: string, payload: unknown) => void | Promise<void>
}) {
  const validation = validateWidget(widget)
  if (!validation.valid) {
    return (
      <ErrorCard
        pluginName={pluginId}
        message={`Invalid widget data for "${widget.type}"`}
        details={validation.error}
      />
    )
  }

  // Render children recursively
  const renderedChildren = widget.children?.map((child, idx) => (
    <WidgetRenderer
      key={child.key || `${widget.type}-child-${idx}`}
      widget={child}
      pluginId={pluginId}
      onAction={onAction}
    />
  ))

  return <WidgetSwitch widget={widget} pluginId={pluginId} onAction={onAction}>{renderedChildren}</WidgetSwitch>
}

// ── Type → DK UI component map ────────────────────────────────────────────

const VARIANT_MAP: Record<string, string> = {
  danger: 'destructive',
  warn: 'warning',
  error: 'destructive',
  info: 'default',
}

const SHADOW_TO_ELEVATION: Record<string, string> = {
  none: 'none',
  sm: 'sm',
  md: 'md',
  lg: 'lg',
}

const PADDING_MAP: Record<string, string> = {
  none: '0',
  sm: '12px',
  md: '24px',
  lg: '32px',
}

function WidgetSwitch({ widget, pluginId, onAction, children }: {
  widget: SlotWidget
  pluginId: string
  onAction?: (pluginId: string, actionKey: string, payload: unknown) => void | Promise<void>
  children?: ReactNode
}) {
  const p = widget.props || {}

  switch (widget.type) {
    // ── Button ────────────────────────────────────────────────────
    case 'button': {
      const variant = VARIANT_MAP[p.variant as string] || (p.variant as string) || 'secondary'
      return (
        <DkButton
          variant={variant as any}
          size={(p.size as any) || 'md'}
          disabled={!!p.disabled}
          loading={!!p.loading}
          onClick={() => p.action && onAction?.(pluginId, p.action as string, p)}
        >
          {p.label as string}
        </DkButton>
      )
    }

    // ── Card ──────────────────────────────────────────────────────
    case 'card': {
      const elevation = SHADOW_TO_ELEVATION[p.shadow as string] || 'sm'
      const title = p.title as string | undefined
      const subtitle = p.subtitle as string | undefined
      return (
        <DkCard
          elevation={elevation as any}
          style={{ padding: PADDING_MAP[p.padding as string] || undefined }}
        >
          {(title || subtitle) && (
            <div style={{ marginBottom: children ? 16 : 0 }}>
              {title && <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{title}</h3>}
              {subtitle && <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>{subtitle}</p>}
            </div>
          )}
          {children}
        </DkCard>
      )
    }

    // ── Input ─────────────────────────────────────────────────────
    case 'input':
      return (
        <DkInput
          label={p.label as string}
          placeholder={p.placeholder as string}
          type={(p.type as any) || 'text'}
          error={p.error as string}
          defaultValue={p.value as string}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            if (p.action) onAction?.(pluginId, p.action as string, { value: e.target.value })
          }}
        />
      )

    // ── Select ────────────────────────────────────────────────────
    case 'select': {
      const options = (p.options as Array<{ value: string; label: string }>) || []
      return (
        <DkSelect
          label={p.label as string}
          defaultValue={p.value as string}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => {
            if (p.action) onAction?.(pluginId, p.action as string, { value: e.target.value })
          }}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </DkSelect>
      )
    }

    // ── Badge ─────────────────────────────────────────────────────
    case 'badge': {
      const variant = VARIANT_MAP[p.variant as string] || (p.variant as string) || 'default'
      return (
        <DkBadge variant={variant as any} show={true}>
          {p.dot ? '● ' : ''}{p.label as string}
        </DkBadge>
      )
    }

    // ── Alert ─────────────────────────────────────────────────────
    case 'alert': {
      const variant = (p.variant as string) || 'info'
      const Icon = variant === 'error' ? XCircle
        : variant === 'warn' ? AlertTriangle
        : variant === 'success' ? CheckCircle2
        : Info
      const colorVar = variant === 'error' ? 'var(--danger)'
        : variant === 'warn' ? 'var(--warning, #f59e0b)'
        : variant === 'success' ? 'var(--success, #22c55e)'
        : 'var(--info, #3b82f6)'
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            padding: '12px 16px',
            borderRadius: 'var(--dk-radius-md)',
            backgroundColor: `color-mix(in srgb, ${colorVar} 10%, transparent)`,
            border: `1px solid color-mix(in srgb, ${colorVar} 25%, transparent)`,
          }}
        >
          <Icon size={18} style={{ color: colorVar, flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{p.title as string}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>{p.message as string}</div>
          </div>
          {!!p.dismissible && (
            <button
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 0 }}
              onClick={() => p.action && onAction?.(pluginId, p.action as string, p)}
              aria-label="Dismiss"
            >
              <XCircle size={16} />
            </button>
          )}
        </div>
      )
    }

    // ── Tabs ──────────────────────────────────────────────────────
    case 'tabs': {
      const tabs = (p.tabs as Array<{ label: string; id: string }>) || []
      const activeTab = (p.activeTab as string) || tabs[0]?.id || ''
      return (
        <TabsWidget
          tabs={tabs}
          activeTab={activeTab}
          pluginId={pluginId}
          onAction={onAction}
          actionKey={p.action as string}
          children={children}
        />
      )
    }

    // ── List ──────────────────────────────────────────────────────
    case 'list': {
      const items = (p.items as Array<{
        key: string; title: string; subtitle?: string
        badge?: string; actions?: Array<{ label: string; action: string; variant?: string }>
      }>) || []
      const emptyText = (p.emptyText as string) || 'No items'
      if (items.length === 0) {
        return <EmptyStateDisplay title={emptyText} />
      }
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map((item) => (
            <div
              key={item.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                borderRadius: 'var(--dk-radius-md)',
                backgroundColor: 'var(--dk-surface-raised)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{item.title}</div>
                {item.subtitle && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>{item.subtitle}</div>
                )}
              </div>
              {item.badge && (
                <DkBadge variant="secondary" size="sm">{item.badge}</DkBadge>
              )}
              {item.actions?.map((a, ai) => (
                <DkButton
                  key={ai}
                  variant={(a.variant as any) || 'ghost'}
                  size="xs"
                  onClick={() => onAction?.(pluginId, a.action, { item })}
                >
                  {a.label}
                </DkButton>
              ))}
            </div>
          ))}
        </div>
      )
    }

    // ── Table ─────────────────────────────────────────────────────
    case 'table': {
      const columns = (p.columns as Array<{ key: string; label: string; width?: string }>) || []
      const rows = (p.rows as Array<{ key: string; cells: Record<string, unknown> }>) || []
      return (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--dk-separator)' }}>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    style={{
                      textAlign: 'left',
                      padding: '8px 12px',
                      fontWeight: 600,
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      width: col.width,
                    }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} style={{ borderBottom: '1px solid var(--dk-separator)' }}>
                  {columns.map((col) => (
                    <td key={col.key} style={{ padding: '10px 12px' }}>
                      {renderCell(row.cells[col.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    // ── Action Group ──────────────────────────────────────────────
    case 'action-group': {
      const actions = (p.actions as Array<{
        label: string; variant?: string; action: string; icon?: string
      }>) || []
      const align = (p.align as string) || 'left'
      return (
        <div style={{ display: 'flex', gap: 8, justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start', flexWrap: 'wrap' }}>
          {actions.map((a, i) => {
            const variant = VARIANT_MAP[a.variant as string] || a.variant || 'secondary'
            return (
              <DkButton
                key={i}
                variant={variant as any}
                size="sm"
                onClick={() => onAction?.(pluginId, a.action, { action: a })}
              >
                {a.label}
              </DkButton>
            )
          })}
          {children}
        </div>
      )
    }

    // ── Divider ───────────────────────────────────────────────────
    case 'divider':
      return <DkSeparator label={p.label as string} />

    // ── Spinner ───────────────────────────────────────────────────
    case 'spinner': {
      const size = (p.size as string) || 'md'
      const sizePx = size === 'sm' ? 16 : size === 'lg' ? 32 : 24
      return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
          <span style={{ width: sizePx, height: sizePx, display: 'inline-block' }}>
            <DkSpinner />
          </span>
        </div>
      )
    }

    // ── Skeleton ──────────────────────────────────────────────────
    case 'skeleton': {
      const variant = (p.variant as string) || 'text'
      const style: React.CSSProperties = {
        width: (p.width as string) || (variant === 'circle' ? '40px' : '100%'),
        height: (p.height as string) || (variant === 'text' ? '16px' : variant === 'circle' ? '40px' : '80px'),
        borderRadius: variant === 'circle' ? '50%' : variant === 'rect' ? 'var(--dk-radius-md)' : 'var(--dk-radius-sm)',
      }
      return <DkSkeleton style={style} />
    }

    // ── Empty State ───────────────────────────────────────────────
    case 'empty-state':
      return (
        <EmptyStateDisplay
          title={p.title as string}
          message={p.message as string}
          actionLabel={p.action ? 'Action' : undefined}
          onAction={p.action ? () => onAction?.(pluginId, p.action as string, p) : undefined}
        />
      )

    // ── Form ──────────────────────────────────────────────────────
    case 'form': {
      const fields = (p.fields as Array<{
        type: string; key: string; label: string; required?: boolean
        placeholder?: string; options?: Array<{ value: string; label: string }>
      }>) || []
      const submitLabel = (p.submitLabel as string) || 'Submit'
      return (
        <FormWidget
          fields={fields}
          submitLabel={submitLabel}
          pluginId={pluginId}
          onAction={onAction}
          actionKey={p.action as string}
          cancelAction={p.cancelAction as string}
        >
          {children}
        </FormWidget>
      )
    }

    // ── Deferred Section (lazy-load children) ─────────────────────
    case 'deferred-section':
      return (
        <DkDeferredSection>
          {children}
        </DkDeferredSection>
      )

    // ── Grid ──────────────────────────────────────────────────────
    case 'grid': {
      const cols = (p.columns as number) || 3
      const gap = (p.gap as string) || '12px'
      return (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap,
          }}
        >
          {children}
        </div>
      )
    }

    // ── Unknown / forward-compat ──────────────────────────────────
    default:
      return (
        <div data-widget-type={widget.type} data-plugin-widget="">
          {children}
        </div>
      )
  }
}

// ── Composite widgets (use local state) ───────────────────────────────────

function TabsWidget({ tabs, activeTab: defaultTab, pluginId, onAction, actionKey, children }: {
  tabs: Array<{ label: string; id: string }>
  activeTab: string
  pluginId: string
  onAction?: (pluginId: string, actionKey: string, payload: unknown) => void | Promise<void>
  actionKey?: string
  children?: ReactNode
}) {
  const [active, setActive] = useState(defaultTab)
  return (
    <DkTabs
      defaultValue={defaultTab}
      value={active}
      onValueChange={(v) => {
        setActive(v)
        if (actionKey) onAction?.(pluginId, actionKey, { tab: v })
      }}
    >
      <DkTabList>
        {tabs.map((t) => (
          <DkTab key={t.id} value={t.id}>{t.label}</DkTab>
        ))}
      </DkTabList>
      {tabs.map((t) => (
        <DkTabPanel key={t.id} value={t.id}>
          {/* Children are slot-rendered — each panel shows all children.
              For per-tab content, plugins use conditions on child widgets. */}
          {children}
        </DkTabPanel>
      ))}
    </DkTabs>
  )
}

function EmptyStateDisplay({ title, message, actionLabel, onAction }: {
  title: string
  message?: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        textAlign: 'center',
        gap: 8,
        borderRadius: 'var(--dk-radius-lg)',
        backgroundColor: 'var(--dk-surface-raised)',
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 600 }}>{title}</div>
      {message && <div style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 320 }}>{message}</div>}
      {actionLabel && onAction && (
        <DkButton variant="secondary" size="sm" onClick={onAction} style={{ marginTop: 8 }}>
          {actionLabel}
        </DkButton>
      )}
    </div>
  )
}

function FormWidget({ fields, submitLabel, pluginId, onAction, actionKey, cancelAction, children }: {
  fields: Array<{
    type: string; key: string; label: string; required?: boolean
    placeholder?: string; options?: Array<{ value: string; label: string }>
  }>
  submitLabel: string
  pluginId: string
  onAction?: (pluginId: string, actionKey: string, payload: unknown) => void | Promise<void>
  actionKey: string
  cancelAction?: string
  children?: ReactNode
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!onAction || !actionKey) return
    setSubmitting(true)
    try {
      await onAction(pluginId, actionKey, { values, fields })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {fields.map((field) => {
        const value = values[field.key] ?? ''
        if (field.type === 'select' && field.options) {
          return (
            <DkSelect
              key={field.key}
              label={field.label}
              value={value}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                setValues((v) => ({ ...v, [field.key]: e.target.value }))}
            >
              {field.options.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </DkSelect>
          )
        }
        return (
          <DkInput
            key={field.key}
            label={field.label}
            placeholder={field.placeholder}
            type={field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'}
            required={field.required}
            value={value}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setValues((v) => ({ ...v, [field.key]: e.target.value }))}
          />
        )
      })}
      {children}
      <div style={{ display: 'flex', gap: 8 }}>
        <DkButton type="submit" variant="primary" loading={submitting}>
          {submitLabel}
        </DkButton>
        {cancelAction && (
          <DkButton
            variant="ghost"
            onClick={() => onAction?.(pluginId, cancelAction, { values })}
          >
            Cancel
          </DkButton>
        )}
      </div>
    </form>
  )
}

// ── Cell renderer (renders primitives, nested widgets handled by children) ─

function renderCell(value: unknown): ReactNode {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? '✓' : '✗'
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

// ── Loading skeleton ──────────────────────────────────────────────────────

function SlotSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <DkSkeleton style={{ height: 40, borderRadius: 'var(--dk-radius-md)' }} />
      <DkSkeleton style={{ height: 80, borderRadius: 'var(--dk-radius-md)' }} />
    </div>
  )
}
