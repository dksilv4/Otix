// Widget props are Zod-validated at runtime (see WidgetCatalog.ts). `as any`
// casts bridge the plugin-provided prop bag into React component props — Zod
// schemas guarantee correctness; TypeScript cannot verify cross-boundary unions.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createElement, useCallback, useState, type ComponentType, type ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FolderOpen,
  Gamepad2,
  Inbox,
  Info,
  Loader2,
  Music,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Star,
  Trash2,
  Wrench,
  XCircle,
} from 'lucide-react'
import { ErrorBoundary } from './error-boundary'
import { ErrorCard } from './error-card'
import { validateWidget } from './widget-catalog'
import type { SlotContribution, SlotWidget } from './types'
import { Alert, Badge, Button, EmptyState, Field, Input, Progress, Select, Switch } from '@/features/plugins/ui'
import { PathInput } from '@/components/path-picker'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SlotRendererProps {
  contributions: SlotContribution[]
  onAction?: (pluginId: string, actionKey: string, payload: unknown) => void | Promise<void>
  loading?: boolean
  className?: string
}

import {
  useSlotActions,
  type SlotAction,
  type ActionFeedback,
} from './hooks/use-slot-actions'
import { safeUrl, renderInline, renderCell } from './slot-utils'

// ── Icons ─────────────────────────────────────────────────────────────────────

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  activity: Activity,
  alert: AlertTriangle,
  'alert-triangle': AlertTriangle,
  check: CheckCircle2,
  'check-circle': CheckCircle2,
  clock: Clock,
  download: Download,
  external: ExternalLink,
  'external-link': ExternalLink,
  folder: FolderOpen,
  gamepad: Gamepad2,
  inbox: Inbox,
  info: Info,
  music: Music,
  refresh: RefreshCw,
  search: Search,
  settings: Settings2,
  spinner: Loader2,
  star: Star,
  trash: Trash2,
  wrench: Wrench,
  x: XCircle,
}

const IconComp = (name?: string): ComponentType<{ className?: string }> => {
  return (name && ICONS[name]) || Inbox
};

const Icon = ({ name, className }: { name?: string; className?: string }) => {
  return createElement(IconComp(name), { className })
};

// ── Variant / tone maps ───────────────────────────────────────────────────────

const BTN_VARIANT: Record<string, 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'> = {
  primary: 'primary',
  secondary: 'secondary',
  ghost: 'ghost',
  danger: 'danger',
  outline: 'outline',
}

const ALERT_TONE: Record<string, 'info' | 'success' | 'warning' | 'error'> = {
  info: 'info',
  success: 'success',
  warn: 'warning',
  warning: 'warning',
  error: 'error',
}

const BADGE_TONE: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info' | 'system'> = {
  default: 'default',
  success: 'success',
  info: 'info',
  system: 'system',
  warn: 'warning',
  warning: 'warning',
  danger: 'danger',
  error: 'danger',
}

const STAT_COLOR: Record<string, string> = {
  default: 'text-muted-foreground',
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  warn: 'text-amber-600 dark:text-amber-400',
  danger: 'text-destructive',
  error: 'text-destructive',
  info: 'text-sky-600 dark:text-sky-400',
}

const PADDING: Record<string, string> = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
}

const ALIGN: Record<string, string> = {
  left: 'justify-start',
  center: 'justify-center',
  right: 'justify-end',
  stretch: 'justify-stretch',
}

// ── SlotRenderer (top-level) ──────────────────────────────────────────────────

export const SlotRenderer = ({ contributions, onAction, loading, className }: SlotRendererProps) => {
  const { busy, feedback, run } = useSlotActions(onAction)

  const handleAction: SlotAction = useCallback(
    (pluginId, actionKey, payload) => run(pluginId, actionKey, payload),
    [run],
  )

  if (loading) {
    return (
      <div className="space-y-2">
        <div className="h-10 rounded-xl bg-[var(--dk-surface-glass)] border border-[var(--dk-separator)] animate-pulse" />
        <div className="h-16 rounded-xl bg-[var(--dk-surface-glass)] border border-[var(--dk-separator)] animate-pulse" />
      </div>
    )
  }

  if (contributions.length === 0) {
    return <p className="text-xs text-muted-foreground italic px-1">No widgets contributed for this section.</p>
  }

  return (
    <div className={cn('space-y-5', className)}>
      {contributions.map((contribution) => (
        <ErrorBoundary key={contribution.pluginId}>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {contribution.label || contribution.pluginId}
              </span>
            </div>
            <div className="space-y-4">
              {(contribution.data?.widgets || []).map((widget, idx) => (
                <WidgetRenderer
                  key={widget.key || `${widget.type}-${idx}`}
                  widget={widget}
                  pluginId={contribution.pluginId}
                  onAction={handleAction}
                  busy={busy}
                  feedback={feedback}
                />
              ))}
            </div>
          </div>
        </ErrorBoundary>
      ))}
    </div>
  )
};

// ── Widget-level isolation + recursive children ───────────────────────────────

const WidgetRenderer = ({
  widget,
  pluginId,
  onAction,
  busy,
  feedback,
}: {
  widget: SlotWidget
  pluginId: string
  onAction: SlotAction
  busy: Record<string, boolean>
  feedback: Record<string, ActionFeedback>
}) => {
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

  const renderedChildren = widget.children?.map((child, idx) => (
    <WidgetRenderer
      key={child.key || `${widget.type}-child-${idx}`}
      widget={child}
      pluginId={pluginId}
      onAction={onAction}
      busy={busy}
      feedback={feedback}
    />
  ))

  return (
    <WidgetSwitch widget={widget} pluginId={pluginId} onAction={onAction} busy={busy} feedback={feedback}>
      {renderedChildren}
    </WidgetSwitch>
  )
};

const ActionFeedback = ({ feedback }: { feedback: ActionFeedback }) => {
  return (
    <span className={cn('text-[11px]', feedback.tone === 'success' ? 'text-emerald-400' : 'text-red-400')}>
      {feedback.message}
    </span>
  )
};

const ActionButton = ({
  label,
  variant,
  size = 'sm',
  icon,
  disabled,
  loading,
  onClick,
}: {
  label: string
  variant?: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  icon?: string
  disabled?: boolean
  loading?: boolean
  onClick?: () => void
}) => {
  return (
    <Button variant={BTN_VARIANT[variant || 'secondary']} size={size} disabled={disabled} loading={loading} icon={icon ? <Icon name={icon} className={cn(size === 'xs' ? 'h-3 w-3' : 'h-3.5 w-3.5')} /> : undefined} onClick={onClick}>
      {label}
    </Button>
  )
};

// ── Type → Tailwind widget map ────────────────────────────────────────────────

const WidgetSwitch = ({
  widget,
  pluginId,
  onAction,
  busy,
  feedback,
  children,
}: {
  widget: SlotWidget
  pluginId: string
  onAction: SlotAction
  busy: Record<string, boolean>
  feedback: Record<string, ActionFeedback>
  children?: ReactNode
}) => {
  const p = widget.props || {}

  switch (widget.type) {
    // ── Button ──────────────────────────────────────────────────────
    case 'button': {
      const b = p as { label?: string; variant?: string; size?: string; icon?: string; action?: string; disabled?: boolean; loading?: boolean }
      const id = `${pluginId}:${b.action || ''}`
      return (
        <div className="inline-flex flex-col items-start gap-1">
          <Button
            variant={BTN_VARIANT[b.variant || 'secondary']}
            size={(b.size as any) || 'md'}
            disabled={!!b.disabled}
            loading={!!b.loading || !!busy[id]}
            icon={b.icon ? <Icon name={b.icon} className="h-4 w-4" /> : undefined}
            onClick={() => b.action && onAction(pluginId, b.action, p)}
          >
            {b.label}
          </Button>
          {feedback[id] && <ActionFeedback feedback={feedback[id]} />}
        </div>
      )
    }

    // ── Action group ────────────────────────────────────────────────
    case 'action-group':
    case 'actions': {
      const g = p as {
        actions?: Array<{ label: string; variant?: string; action?: string; icon?: string; loading?: boolean; disabled?: boolean }>
        align?: string
      }
      return (
        <div className={cn('flex flex-wrap items-center gap-2', ALIGN[g.align || 'left'])}>
          {(g.actions || []).map((a, i) => {
            const id = `${pluginId}:${a.action || ''}`
            return (
              <div key={i} className="inline-flex flex-col items-start gap-1">
                <ActionButton
                  label={a.label}
                  variant={a.variant}
                  icon={a.icon}
                  disabled={a.disabled}
                  loading={a.loading || !!busy[id]}
                  onClick={() => a.action && onAction(pluginId, a.action, { action: a })}
                />
                {feedback[id] && <ActionFeedback feedback={feedback[id]} />}
              </div>
            )
          })}
        </div>
      )
    }

    // ── Layout containers ───────────────────────────────────────────
    case 'card': {
      const c = p as { title?: string; subtitle?: string; padding?: string; shadow?: string }
      return (
        <div className={cn('rounded-xl border border-[var(--dk-separator)] bg-[var(--dk-surface-card)]', PADDING[c.padding || 'md'])}>
          {c.title && (
            <div className="mb-3">
              <div className="text-sm font-semibold text-foreground">{c.title}</div>
              {c.subtitle && <div className="text-xs text-muted-foreground mt-0.5">{c.subtitle}</div>}
            </div>
          )}
          <div className="space-y-4">{children}</div>
        </div>
      )
    }

    case 'section': {
      const s = p as { title?: string; description?: string }
      return (
        <section className="space-y-3">
          {(s.title || s.description) && (
            <div>
              {s.title && <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{s.title}</h4>}
              {s.description && <p className="text-xs text-muted-foreground mt-1">{s.description}</p>}
            </div>
          )}
          <div className="space-y-4">{children}</div>
        </section>
      )
    }

    case 'group': {
      const gr = p as { title?: string; description?: string; columns?: number; gap?: string }
      const grid = !!gr.columns && gr.columns > 1
      return (
        <div>
          {(gr.title || gr.description) && (
            <div className="mb-2">
              {gr.title && <div className="text-sm font-semibold text-foreground">{gr.title}</div>}
              {gr.description && <p className="text-xs text-muted-foreground mt-0.5">{gr.description}</p>}
            </div>
          )}
          <div className={grid ? 'grid' : 'space-y-4'} style={grid ? { gridTemplateColumns: `repeat(${gr.columns}, 1fr)`, gap: gr.gap || '12px' } : undefined}>
            {children}
          </div>
        </div>
      )
    }

    case 'grid': {
      const gr = p as { columns?: number; gap?: string }
      return (
        <div
          className="grid"
          style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.min(6, gr.columns || 3))}, 1fr)`, gap: gr.gap || '12px' }}
        >
          {children}
        </div>
      )
    }

    // ── Text / markdown ─────────────────────────────────────────────
    case 'text': {
      const t = p as { content?: string; style?: string }
      const classes: Record<string, string> = {
        body: 'text-sm text-foreground',
        muted: 'text-xs text-muted-foreground',
        caption: 'text-[11px] text-muted-foreground',
        h1: 'text-lg font-semibold text-foreground',
        h2: 'text-base font-semibold text-foreground',
        h3: 'text-sm font-semibold text-foreground',
        code: 'text-xs font-mono text-foreground bg-[var(--dk-surface-field)] border border-[var(--dk-separator)] rounded px-1.5 py-0.5',
      }
      return <div className={classes[t.style || 'body'] || classes.body}>{t.content}</div>
    }

    case 'markdown': {
      const m = p as { content?: string }
      return <Markdown content={m.content || ''} />
    }

    case 'divider': {
      const d = p as { label?: string; orientation?: string }
      if (d.orientation === 'vertical') {
        return <div className="w-px self-stretch bg-[var(--dk-separator)]" />
      }
      return (
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-[var(--dk-separator)]" />
          {d.label && <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{d.label}</span>}
          <div className="h-px flex-1 bg-[var(--dk-separator)]" />
        </div>
      )
    }

    // ── Feedback ────────────────────────────────────────────────────
    case 'alert': {
      const a = p as { title?: string; message?: string; variant?: string }
      return (
        <Alert tone={ALERT_TONE[a.variant || 'info']} title={a.title}>
          {a.message}
        </Alert>
      )
    }

    case 'badge': {
      const b = p as { label?: string; variant?: string; dot?: boolean }
      return <Badge tone={BADGE_TONE[b.variant || 'default']} dot={!!b.dot}>{b.label}</Badge>
    }

    case 'stat': {
      const s = p as { label?: string; value?: string; description?: string; tone?: string; icon?: string }
      return (
        <div className="flex items-start gap-3 rounded-xl border border-[var(--dk-separator)] bg-[var(--dk-surface-card)] p-4">
          {s.icon && (
            <div className="rounded-lg bg-[var(--dk-surface-glass)] border border-[var(--dk-separator)] p-2">
              <Icon name={s.icon} className={cn('h-4 w-4', STAT_COLOR[s.tone || 'default'])} />
            </div>
          )}
          <div className="min-w-0">
            <div className="text-xl font-semibold text-foreground">{s.value ?? '—'}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
            {s.description && <div className="text-[11px] text-muted-foreground mt-1">{s.description}</div>}
          </div>
        </div>
      )
    }

    case 'progress': {
      const pr = p as { value?: number; label?: string; description?: string; tone?: string; indeterminate?: boolean }
      return (
        <div>
          {(pr.label || pr.description) && (
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="text-xs text-muted-foreground">{pr.label}</span>
              {!pr.indeterminate && <span className="text-xs text-muted-foreground">{Math.round(pr.value ?? 0)}%</span>}
            </div>
          )}
          <Progress value={pr.value ?? 0} tone={(pr.tone as any) || 'primary'} />
          {pr.description && <p className="text-[11px] text-muted-foreground mt-1">{pr.description}</p>}
        </div>
      )
    }

    // ── Inputs ──────────────────────────────────────────────────────
    case 'input': {
      const i = p as { label?: string; placeholder?: string; value?: string; type?: string; error?: string; action?: string }
      return (
        <Field label={i.label} error={i.error}>
          <Input
            type={i.type || 'text'}
            value={i.value || ''}
            placeholder={i.placeholder}
            invalid={!!i.error}
            onChange={(e) => i.action && onAction(pluginId, i.action, { value: e.target.value })}
          />
        </Field>
      )
    }

    case 'select': {
      const s = p as { label?: string; options?: Array<{ value: string; label: string }>; value?: string; action?: string }
      return (
        <Field label={s.label}>
          <Select
            options={s.options || []}
            value={s.value || ''}
            onChange={(e) => s.action && onAction(pluginId, s.action, { value: e.target.value })}
          />
        </Field>
      )
    }

    case 'switch': {
      const s = p as { label?: string; description?: string; checked?: boolean; action?: string }
      return (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm text-foreground">{s.label}</div>
            {s.description && <p className="text-[11px] text-muted-foreground mt-0.5">{s.description}</p>}
          </div>
          <Switch checked={!!s.checked} onCheckedChange={(v) => s.action && onAction(pluginId, s.action, { value: v })} />
        </div>
      )
    }

    // ── Data displays ───────────────────────────────────────────────
    case 'list': {
      const l = p as {
        items?: Array<{ key?: string; title?: string; subtitle?: string; badge?: string; actions?: Array<{ label: string; action?: string; variant?: string }> }>
        emptyText?: string
      }
      const items = l.items || []
      if (items.length === 0) {
        return <p className="text-xs italic text-muted-foreground">{l.emptyText || 'No items'}</p>
      }
      return (
        <div className="flex flex-col gap-1.5">
          {items.map((item, i) => (
            <div key={item.key || i} className="flex items-center gap-3 rounded-xl border border-[var(--dk-separator)] bg-[var(--dk-surface-card)] px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">{item.title}</div>
                {item.subtitle && <div className="mt-0.5 truncate text-xs text-muted-foreground">{item.subtitle}</div>}
              </div>
              {item.badge && <Badge>{item.badge}</Badge>}
              {item.actions?.map((a, ai) => {
                const id = `${pluginId}:${a.action || ''}`
                return (
                  <div key={ai} className="inline-flex flex-col items-end gap-0.5">
                    <Button variant="ghost" size="xs" loading={!!busy[id]} onClick={() => a.action && onAction(pluginId, a.action, { item })}>
                      {a.label}
                    </Button>
                    {feedback[id] && <ActionFeedback feedback={feedback[id]} />}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )
    }

    case 'table': {
      const t = p as { columns?: Array<{ key: string; label: string; width?: string }>; rows?: Array<{ key: string; cells: Record<string, unknown> }> }
      const columns = t.columns || []
      const rows = t.rows || []
      if (rows.length === 0) {
        return <p className="text-xs italic text-muted-foreground">No rows</p>
      }
      return (
        <div className="overflow-x-auto rounded-xl border border-[var(--dk-separator)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--dk-separator)]">
                {columns.map((col) => (
                  <th
                     key={col.key}
                     style={col.width ? { width: col.width } : undefined}
                     className="px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={row.key || ri} className="border-b border-[var(--dk-separator)] last:border-0">
                  {columns.map((col) => (
                    <td key={col.key} className="px-3.5 py-2.5 text-xs text-foreground">
                      {renderCell(row.cells?.[col.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    // ── Forms (declarative) ─────────────────────────────────────────
    case 'form': {
      const f = p as {
        fields?: Array<{ type?: string; key?: string; label?: string; required?: boolean; placeholder?: string; options?: Array<{ value: string; label: string }> }>
        submitLabel?: string
        action?: string
        cancelAction?: string
      }
      return (
        <FormWidget
          fields={f.fields || []}
          submitLabel={f.submitLabel || 'Submit'}
          action={f.action || ''}
          cancelAction={f.cancelAction}
          pluginId={pluginId}
          onAction={onAction}
        >
          {children}
        </FormWidget>
      )
    }

    case 'fields': {
      const f = p as { fields?: any[]; submitLabel?: string; action?: string; cancelAction?: string }
      return (
        <FieldsWidget
          fields={f.fields || []}
          submitLabel={f.submitLabel || 'Submit'}
          action={f.action || ''}
          cancelAction={f.cancelAction}
          pluginId={pluginId}
          onAction={onAction}
        />
      )
    }

    // ── Misc ────────────────────────────────────────────────────────
    case 'link': {
      const l = p as { label?: string; href?: string; external?: boolean; icon?: string }
      const href = l.href ? safeUrl(l.href) : undefined
      if (!href) {
        return <span className="text-sm text-muted-foreground">{l.label}</span>
      }
      return (
        <a
          href={href}
          target={l.external ? '_blank' : undefined}
          rel={l.external ? 'noreferrer noopener' : undefined}
          className="inline-flex items-center gap-1.5 text-sm text-sky-600 dark:text-sky-400 hover:text-sky-500 hover:underline"
        >
          {l.icon && <Icon name={l.icon} className="h-3.5 w-3.5" />}
          {l.label}
          {l.external && <ExternalLink className="h-3 w-3" />}
        </a>
      )
    }

    case 'spinner': {
      const s = p as { size?: string }
      const size = s.size === 'sm' ? 'h-4 w-4' : s.size === 'lg' ? 'h-7 w-7' : 'h-5 w-5'
      return (
        <div className="flex justify-center py-4">
          <Loader2 className={cn('animate-spin text-primary', size)} />
        </div>
      )
    }

    case 'skeleton': {
      const s = p as { width?: string; height?: string; variant?: string }
      const variant = s.variant || 'text'
      const w = s.width || (variant === 'circle' ? '40px' : '100%')
      const h = s.height || (variant === 'text' ? '16px' : variant === 'circle' ? '40px' : '80px')
      return (
        <div
          className="animate-pulse rounded-lg bg-[var(--dk-surface-glass)]"
          style={{ width: w, height: h, borderRadius: variant === 'circle' ? '50%' : undefined }}
        />
      )
    }

    case 'empty-state': {
      const e = p as { icon?: string; title?: string; message?: string; action?: string }
      return (
        <EmptyState
          icon={IconComp(e.icon)}
          title={e.title || ''}
          message={e.message}
          action={
            e.action ? (
              <Button size="sm" variant="outline" onClick={() => onAction(pluginId, e.action as string, p)}>
                Action
              </Button>
            ) : undefined
          }
        />
      )
    }

    case 'tabs': {
      const t = p as { tabs?: Array<{ label: string; id: string }>; activeTab?: string; action?: string }
      return (
        <TabsWidget tabs={t.tabs || []} activeTab={t.activeTab} pluginId={pluginId} onAction={onAction} actionKey={t.action}>
          {children}
        </TabsWidget>
      )
    }

    case 'deferred-section':
      return <>{children}</>

    default:
      return <div data-widget-type={widget.type} className="space-y-4">{children}</div>
  }
};

// ── Composite widgets (use local state) ──────────────────────────────────────

const TabsWidget = ({
  tabs,
  activeTab,
  pluginId,
  onAction,
  actionKey,
  children,
}: {
  tabs: Array<{ label: string; id: string }>
  activeTab?: string
  pluginId: string
  onAction: SlotAction
  actionKey?: string
  children?: ReactNode
}) => {
  const [active, setActive] = useState(activeTab || tabs[0]?.id || '')

  return (
    <div>
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-[var(--dk-separator)]">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setActive(t.id)
              if (actionKey) onAction(pluginId, actionKey, { tab: t.id })
            }}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-xs font-semibold transition-colors cursor-pointer',
              active === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  )
};

const FormWidget = ({
  fields,
  submitLabel,
  action,
  cancelAction,
  pluginId,
  onAction,
  children,
}: {
  fields: Array<{ type?: string; key?: string; label?: string; required?: boolean; placeholder?: string; options?: Array<{ value: string; label: string }> }>
  submitLabel: string
  action: string
  cancelAction?: string
  pluginId: string
  onAction: SlotAction
  children?: ReactNode
}) => {
  const keyed = fields.filter((f): f is typeof fields[number] & { key: string } => !!f.key)
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const f of keyed) init[f.key] = ''
    return init
  })
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!action) return
    setSubmitting(true)
    try {
      await onAction(pluginId, action, { values })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        handleSubmit()
      }}
      className="space-y-3"
    >
      {keyed.map((field) => {
        const value = values[field.key] ?? ''
        if (field.type === 'select' && field.options) {
          return (
            <Field key={field.key} label={field.label} required={field.required}>
              <Select options={field.options} value={value} onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))} />
            </Field>
          )
        }
        return (
          <Field key={field.key} label={field.label} required={field.required}>
            <Input
              type={field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'}
              value={value}
              placeholder={field.placeholder}
              required={field.required}
              onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
            />
          </Field>
        )
      })}
      {children}
      <div className="flex gap-2 pt-1">
        <Button type="submit" variant="primary" loading={submitting}>{submitLabel}</Button>
        {cancelAction && (
          <Button type="button" variant="ghost" onClick={() => onAction(pluginId, cancelAction, { values })}>Cancel</Button>
        )}
      </div>
    </form>
  )
};

const FieldsWidget = ({
  fields,
  submitLabel,
  action,
  cancelAction,
  pluginId,
  onAction,
}: {
  fields: any[]
  submitLabel: string
  action: string
  cancelAction?: string
  pluginId: string
  onAction: SlotAction
}) => {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {}
    for (const f of fields) if (f.key) init[f.key] = f.default ?? ''
    return init
  })
  const [submitting, setSubmitting] = useState(false)

  const setField = (key: string, v: unknown) => setValues((prev) => ({ ...prev, [key]: v }))

  const handleSubmit = async () => {
    if (!action) return
    setSubmitting(true)
    try {
      await onAction(pluginId, action, { values })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        handleSubmit()
      }}
      className="space-y-3"
    >
      {fields.map((field) => {
        const value = values[field.key]
        switch (field.type) {
          case 'select':
            return (
              <Field key={field.key} label={field.label} description={field.description} required={field.required}>
                <Select options={field.options || []} value={(value as string) || ''} onChange={(e) => setField(field.key, e.target.value)} />
              </Field>
            )
          case 'boolean':
            return (
              <div key={field.key} className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm text-foreground">{field.label}</div>
                  {field.description && <p className="text-[11px] text-muted-foreground">{field.description}</p>}
                </div>
                <Switch checked={Boolean(value)} onCheckedChange={(v) => setField(field.key, v)} />
              </div>
            )
          case 'number':
            return (
              <Field key={field.key} label={field.label} description={field.description} required={field.required}>
                <Input
                  type="number"
                  value={(value as string | number) ?? ''}
                  placeholder={field.placeholder}
                  onChange={(e) => setField(field.key, e.target.value === '' ? '' : Number(e.target.value))}
                />
              </Field>
            )
          case 'path-list':
            return (
              <PathListField key={field.key} field={field} value={(value as string[]) || []} onChange={(v) => setField(field.key, v)} />
            )
          default:
            return (
              <Field key={field.key} label={field.label} description={field.description} required={field.required}>
                <Input
                  type={field.type === 'password' ? 'password' : 'text'}
                  value={(value as string) ?? ''}
                  placeholder={field.placeholder}
                  onChange={(e) => setField(field.key, e.target.value)}
                />
              </Field>
            )
        }
      })}
      <div className="flex gap-2 pt-1">
        <Button type="submit" variant="primary" loading={submitting}>{submitLabel}</Button>
        {cancelAction && (
          <Button type="button" variant="ghost" onClick={() => onAction(pluginId, cancelAction, { values })}>Cancel</Button>
        )}
      </div>
    </form>
  )
};

const PathListField = ({
  field,
  value,
  onChange,
}: {
  field: { label?: string; placeholder?: string; description?: string; required?: boolean }
  value: string[]
  onChange: (v: string[]) => void
}) => {
  const update = (idx: number, v: string) => {
    const next = [...value]
    next[idx] = v
    onChange(next)
  }
  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx))
  const add = () => onChange([...value, ''])

  return (
    <Field label={field.label} description={field.description} required={field.required}>
      <div className="space-y-1.5">
        {value.map((path, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <PathInput
              compact
              value={path}
              placeholder={field.placeholder || '/path/to/games'}
              onChange={(next) => update(idx, next)}
              className="min-w-0 flex-1"
            />
            <Button type="button" variant="ghost" size="sm" className="h-9 w-9 shrink-0 p-0 text-muted-foreground hover:text-destructive" onClick={() => remove(idx)}>
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
};

// ── Markdown (minimal, HTML-escaped via React) ────────────────────────────────

const Markdown = ({ content }: { content: string }) => {
  const blocks = content.trim().split(/\n{2,}/).filter(Boolean)
  if (blocks.length === 0) return null

  return (
    <div className="space-y-2.5 text-sm text-foreground">
      {blocks.map((block, i) => {
        if (block.startsWith('```')) {
          const body = block.replace(/^```[a-z]*\n?/, '').replace(/```$/, '').trim()
          return <pre key={i} className="overflow-x-auto rounded-lg bg-[var(--dk-surface-field)] border border-[var(--dk-separator)] p-3 font-mono text-xs text-foreground">{body}</pre>
        }
        const h = block.match(/^(#{1,3})\s+(.+)$/)
        if (h) {
          const lvl = h[1].length
          return (
            <div key={i} className={cn(lvl === 1 ? 'text-base font-semibold text-foreground' : lvl === 2 ? 'text-sm font-semibold text-foreground' : 'text-[13px] font-semibold text-foreground')}>
              {renderInline(h[2])}
            </div>
          )
        }
        if (block.split('\n').every((line) => line.startsWith('>'))) {
          const quote = block.split('\n').map((line) => line.replace(/^>\s?/, '')).join('\n')
          return <blockquote key={i} className="border-l-2 border-[var(--dk-separator)] pl-3 text-muted-foreground">{renderInline(quote)}</blockquote>
        }
        const lines = block.split('\n')
        const isList = lines.some((line) => /^[-*+]\s/.test(line))
        if (isList) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((line, li) => {
                const m = line.match(/^[-*+]\s+(.+)$/)
                return m ? <li key={li}>{renderInline(m[1])}</li> : null
              })}
            </ul>
          )
        }
        return <p key={i}>{renderInline(block)}</p>
      })}
    </div>
  )
};

