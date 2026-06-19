// frontend/src/features/_config/slots/WidgetCatalog.ts
import { z } from 'zod'
import type { SlotWidget } from './types'

// ── Zod schemas for each widget type ──
const schemas: Record<string, z.ZodType> = {
  button: z.object({
    label: z.string(),
    variant: z.enum(['primary', 'secondary', 'ghost', 'danger']).default('secondary'),
    size: z.enum(['sm', 'md', 'lg']).default('md'),
    icon: z.string().optional(),
    action: z.string(),
    disabled: z.boolean().default(false),
    loading: z.boolean().default(false),
  }),
  card: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    children: z.array(z.any()).optional(),
    padding: z.enum(['none', 'sm', 'md', 'lg']).default('md'),
    shadow: z.enum(['none', 'sm', 'md']).default('sm'),
  }),
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
    options: z.array(z.object({ value: z.string(), label: z.string() })),
    value: z.string().optional(),
    action: z.string().optional(),
  }),
  badge: z.object({
    label: z.string(),
    variant: z.enum(['info', 'success', 'warn', 'error']).default('info'),
    dot: z.boolean().default(false),
  }),
  alert: z.object({
    title: z.string(),
    message: z.string(),
    variant: z.enum(['info', 'success', 'warn', 'error']).default('info'),
    dismissible: z.boolean().default(false),
    action: z.string().optional(),
  }),
  tabs: z.object({
    tabs: z.array(z.object({ label: z.string(), id: z.string() })),
    activeTab: z.string().optional(),
    action: z.string().optional(),
  }),
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
  'action-group': z.object({
    actions: z.array(z.object({
      label: z.string(),
      variant: z.enum(['primary', 'secondary', 'ghost', 'danger']).default('secondary'),
      action: z.string(),
      icon: z.string().optional(),
    })),
    align: z.enum(['left', 'center', 'right']).default('left'),
  }),
  divider: z.object({
    label: z.string().optional(),
    orientation: z.enum(['horizontal', 'vertical']).default('horizontal'),
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
  form: z.object({
    fields: z.array(z.object({
      type: z.string(),
      key: z.string(),
      label: z.string(),
      required: z.boolean().default(false),
      placeholder: z.string().optional(),
      options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
    })),
    submitLabel: z.string().default('Submit'),
    action: z.string(),
    cancelAction: z.string().optional(),
  }),
}

const CONTAINER_WIDGETS = new Set([
  'card', 'deferred-section', 'action-group', 'form', 'grid', 'tabs',
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
