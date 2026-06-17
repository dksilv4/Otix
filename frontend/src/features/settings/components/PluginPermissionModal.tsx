import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils/utils'

interface PermissionRequest {
  requestId: string
  pluginId: string
  pluginName: string
  permission: string
  reason: string
}

interface PluginPermissionModalProps {
  request: PermissionRequest | null
  onAllowOnce: (requestId: string) => void
  onAllowAlways: (requestId: string) => void
  onDeny: (requestId: string) => void
}

const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  'api:proxy': 'Make requests to the Otix API on your behalf.',
  'network:external': 'Connect to external services on the internet.',
  'storage:local': 'Store data locally on your device.',
  'events:subscribe': 'Listen for changes in your Otix activity.',
  'ui:settings': 'Add a settings page.',
  'ui:media.actions': 'Add buttons to media detail pages.',
  'ui:list.actions': 'Add controls to your lists.',
  'ui:nav.item': 'Add an item to the navigation sidebar.',
  'ui:dashboard.widget': 'Add a widget to your dashboard.',
  'notifications': 'Send you desktop notifications.',
  'worker:compute': 'Use your device for background processing.',
}

function getPermissionDescription(permission: string): string {
  return PERMISSION_DESCRIPTIONS[permission] ?? `Requested permission: "${permission}"`
}

export function PluginPermissionModal({
  request,
  onAllowOnce,
  onAllowAlways,
  onDeny,
}: PluginPermissionModalProps) {
  const [visible, setVisible] = useState(false)
  const [animateIn, setAnimateIn] = useState(false)

  useEffect(() => {
    if (request) {
      setVisible(true)
      // Trigger fade-in on next frame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setAnimateIn(true)
        })
      })
    } else {
      setAnimateIn(false)
      const timeout = setTimeout(() => setVisible(false), 200)
      return () => clearTimeout(timeout)
    }
  }, [request])

  useEffect(() => {
    if (!request) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDeny(request.requestId)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [request, onDeny])

  if (!visible) return null

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-[var(--dk-z-modal)] flex items-center justify-center p-4 transition-opacity duration-200',
        animateIn ? 'opacity-100' : 'opacity-0',
      )}
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => request && onDeny(request.requestId)}
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Permission Request"
        className={cn(
          'relative w-full max-w-md',
          'bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl',
          'p-6 sm:p-8',
          'transition-all duration-200',
          animateIn ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4',
        )}
        style={{
          animation: animateIn ? 'authFormFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)' : undefined,
        }}
      >
        {/* Header */}
        <div className="flex items-start gap-4 mb-6">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
            style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 15%, transparent)', color: 'var(--primary)' }}
          >
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-white">Permission Request</h2>
            <p className="text-sm text-white/60 mt-1">
              <span className="font-medium text-white/80">{request?.pluginName}</span> needs your permission
            </p>
          </div>
        </div>

        {/* Permission badge */}
        <div className="mb-6">
          <div
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-mono font-medium"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--primary) 10%, transparent)',
              color: 'var(--primary)',
            }}
          >
            {request?.permission}
          </div>
        </div>

        {/* Description */}
        <div className="mb-6">
          <p className="text-sm text-white/70 leading-relaxed">
            {request ? getPermissionDescription(request.permission) : ''}
          </p>
          {request?.reason && (
            <p className="text-xs text-white/40 mt-2 italic leading-relaxed">
              "{request.reason}"
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => request && onDeny(request.requestId)}
            className={cn(
              'flex-1 inline-flex items-center justify-center gap-2 whitespace-nowrap',
              'h-10 rounded-xl px-4 text-sm font-medium',
              'hover:bg-white/5 text-white/60 hover:text-white transition-colors',
              'active:scale-[0.97]',
            )}
          >
            Deny
          </button>

          <button
            type="button"
            onClick={() => request && onAllowOnce(request.requestId)}
            className={cn(
              'flex-1 inline-flex items-center justify-center gap-2 whitespace-nowrap',
              'h-10 rounded-xl px-4 text-sm font-medium',
              'border border-white/10 hover:bg-white/5 text-white/80 hover:text-white transition-colors',
              'active:scale-[0.97]',
            )}
          >
            Allow Once
          </button>

          <button
            type="button"
            onClick={() => request && onAllowAlways(request.requestId)}
            className={cn(
              'flex-1 inline-flex items-center justify-center gap-2 whitespace-nowrap',
              'h-10 rounded-xl px-4 text-sm font-medium',
              'bg-primary text-primary-foreground hover:bg-primary/90 transition-colors',
              'active:scale-[0.97]',
            )}
          >
            Always Allow
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
