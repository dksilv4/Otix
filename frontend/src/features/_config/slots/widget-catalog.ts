// Widget schemas are Zod-validated at runtime for cross-boundary safety: slot
// widget trees come from plugins (untrusted-ish), so props are validated before
// rendering. The `as any` casts in the renderer bridge these into React props —
// Zod guarantees correctness where TypeScript cannot verify cross-boundary unions.
import { z } from 'zod'
import type { SlotWidget } from './types'

const option = z.object({ value: z.string(), label: z.string() })

const schemas: Record<string, z.ZodType> = {
  // ── Actions / buttons ────────────────────────────────────────────────────
  button: z.object({
    label: z.string(),
    variant: z.enum(['primary', 'secondary', 'ghost', 'danger', 'outline']).default('secondary'),
    size: z.enum(['xs', 'sm', 'md', 'lg']).default('md'),
    icon: z.string().optional(),
    action: z.string().optional(),
    disabled: z.boolean().default(false),
    loading: z.boolean().default(false),
  }),
  'action-group': z.object({
    actions: z.array(z.object({
      label: z.string(),
      variant: z.enum(['primary', 'secondary', 'ghost', 'danger', 'outline']).default('secondary'),
      action: z.string().optional(),
      icon: z.string().optional(),
      loading: z.boolean().optional(),
      disabled: z.boolean().optional(),
    })),
    align: z.enum(['left', 'center', 'right', 'stretch']).default('left'),
  }),
  actions: z.object({
    actions: z.array(z.object({
      label: z.string(),
      variant: z.enum(['primary', 'secondary', 'ghost', 'danger', 'outline']).default('secondary'),
      action: z.string().optional(),
      icon: z.string().optional(),
      loading: z.boolean().optional(),
      disabled: z.boolean().optional(),
    })),
    align: z.enum(['left', 'center', 'right', 'stretch']).default('left'),
  }),

  // ── Layout containers ────────────────────────────────────────────────────
  card: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    padding: z.enum(['none', 'sm', 'md', 'lg']).default('md'),
    shadow: z.enum(['none', 'sm', 'md']).default('sm'),
  }),
  section: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
  }),
  group: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    columns: z.number().int().min(1).max(4).optional(),
    gap: z.string().optional(),
  }),
  grid: z.object({
    columns: z.number().int().min(1).max(6).default(3),
    gap: z.string().default('12px'),
  }),

  // ── Text / markdown ──────────────────────────────────────────────────────
  text: z.object({
    content: z.string(),
    style: z.enum(['body', 'muted', 'caption', 'h1', 'h2', 'h3', 'code']).default('body'),
  }),
  markdown: z.object({
    content: z.string(),
  }),
  divider: z.object({
    label: z.string().optional(),
    orientation: z.enum(['horizontal', 'vertical']).default('horizontal'),
  }),

  // ── Feedback ─────────────────────────────────────────────────────────────
  alert: z.object({
    title: z.string(),
    message: z.string().optional(),
    variant: z.enum(['info', 'success', 'warn', 'error']).default('info'),
    dismissible: z.boolean().default(false),
    action: z.string().optional(),
  }),
  badge: z.object({
    label: z.string(),
    variant: z.enum(['default', 'success', 'warning', 'warn', 'danger', 'error', 'info', 'system']).default('default'),
    dot: z.boolean().default(false),
  }),
  stat: z.object({
    label: z.string(),
    value: z.string(),
    description: z.string().optional(),
    tone: z.enum(['default', 'success', 'warning', 'warn', 'danger', 'error', 'info']).default('default'),
    icon: z.string().optional(),
  }),
  progress: z.object({
    value: z.number().min(0).max(100).default(0),
    label: z.string().optional(),
    description: z.string().optional(),
    tone: z.enum(['primary', 'success', 'error']).default('primary'),
    indeterminate: z.boolean().default(false),
  }),

  // ── Inputs ───────────────────────────────────────────────────────────────
  input: z.object({
    label: z.string().optional(),
    placeholder: z.string().optional(),
    value: z.string().default(''),
    type: z.enum(['text', 'password', 'number', 'email']).default('text'),
    error: z.string().optional(),
    action: z.string().optional(),
  }),
  select: z.object({
    label: z.string().optional(),
    options: z.array(option),
    value: z.string().optional(),
    action: z.string().optional(),
  }),
  switch: z.object({
    label: z.string(),
    description: z.string().optional(),
    checked: z.boolean().default(false),
    action: z.string().optional(),
  }),

  // ── Data displays ────────────────────────────────────────────────────────
  list: z.object({
    items: z.array(z.object({
      key: z.string(),
      title: z.string(),
      subtitle: z.string().optional(),
      badge: z.string().optional(),
      actions: z.array(z.object({ label: z.string(), action: z.string(), variant: z.string().optional() })).optional(),
    })),
    emptyText: z.string().default('No items'),
  }),
  table: z.object({
    columns: z.array(z.object({ key: z.string(), label: z.string(), width: z.string().optional() })),
    rows: z.array(z.object({ key: z.string(), cells: z.record(z.string(), z.unknown()) })),
    sortable: z.boolean().default(false),
  }),

  // ── Forms (declarative; plugins submit collected values via action) ──────
  form: z.object({
    fields: z.array(z.object({
      type: z.string(),
      key: z.string(),
      label: z.string(),
      required: z.boolean().default(false),
      placeholder: z.string().optional(),
      options: z.array(option).optional(),
    })),
    submitLabel: z.string().default('Submit'),
    action: z.string(),
    cancelAction: z.string().optional(),
  }),
  fields: z.object({
    fields: z.array(z.object({
      type: z.string(),
      key: z.string(),
      label: z.string(),
      description: z.string().optional(),
      required: z.boolean().default(false),
      placeholder: z.string().optional(),
      default: z.unknown().optional(),
      options: z.array(option).optional(),
      values: z.array(z.string()).optional(),
    })),
    submitLabel: z.string().default('Submit'),
    action: z.string(),
    cancelAction: z.string().optional(),
  }),

  // ── Misc ─────────────────────────────────────────────────────────────────
  link: z.object({
    label: z.string(),
    href: z.string(),
    external: z.boolean().default(false),
    icon: z.string().optional(),
  }),
  spinner: z.object({
    size: z.enum(['sm', 'md', 'lg']).default('md'),
  }),
  skeleton: z.object({
    width: z.string().optional(),
    height: z.string().optional(),
    variant: z.enum(['text', 'rect', 'circle']).default('text'),
  }),
  'empty-state': z.object({
    icon: z.string().optional(),
    title: z.string(),
    message: z.string().optional(),
    action: z.string().optional(),
  }),
  'deferred-section': z.object({}).passthrough(),
  tabs: z.object({
    tabs: z.array(z.object({ label: z.string(), id: z.string() })),
    activeTab: z.string().optional(),
    action: z.string().optional(),
  }),
}

const CONTAINER_WIDGETS = new Set([
  'card', 'section', 'group', 'grid', 'action-group', 'actions',
  'form', 'fields', 'deferred-section', 'tabs',
])

export function validateWidget(widget: SlotWidget): { valid: boolean; error?: string } {
  const schema = schemas[widget.type]
  if (!schema) {
    return { valid: true } // unknown types passed through (forward compat)
  }
  const result = schema.safeParse(widget.props)
  if (!result.success) {
    return { valid: false, error: result.error.message }
  }
  return { valid: true }
}

export function isContainerWidget(type: string): boolean {
  return CONTAINER_WIDGETS.has(type)
}

export function getWidgetDisplayName(type: string): string {
  return type
}
