// frontend/src/features/_config/slots/SlotRenderer.tsx
import { type ReactNode } from 'react'
import { ErrorBoundary } from './ErrorBoundary'
import { ErrorCard } from './ErrorCard'
import { validateWidget } from './WidgetCatalog'
import type { SlotContribution, SlotWidget } from './types'

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

  return <WidgetSwitch widget={widget}>{renderedChildren}</WidgetSwitch>
}

function WidgetSwitch({ widget, children }: {
  widget: SlotWidget
  children?: ReactNode
}) {
  // Placeholder — the full implementation maps widget.type to DK UI components
  // This will be completed incrementally as catalog expands
  return (
    <div data-widget-type={widget.type} data-plugin-widget="">
      {children}
    </div>
  )
}

function SlotSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ height: 40, backgroundColor: 'var(--dk-surface-raised)', borderRadius: 'var(--dk-radius-md)' }} />
      <div style={{ height: 80, backgroundColor: 'var(--dk-surface-raised)', borderRadius: 'var(--dk-radius-md)' }} />
    </div>
  )
}
