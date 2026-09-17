import React, { useEffect, useRef } from 'react';
import {
  X,
  Server,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DkButton } from '@ui/atoms/button';

export interface ServerIntegrationModalShellProps {
  isOpen?: boolean;
  isExiting?: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  brandColor?: string;
  brandBgClass?: string;
  maxWidthClass?: string;
  isLoading?: boolean;
  loadingText?: string;
  hasServer?: boolean;
  emptyServerState?: React.ReactNode;
  children: React.ReactNode;
}

export function ServerIntegrationModalShell({
  isOpen = true,
  isExiting,
  onClose,
  title,
  description,
  icon: Icon,
  brandColor,
  brandBgClass,
  maxWidthClass = 'max-w-xl',
  isLoading = false,
  loadingText = 'Loading current settings...',
  hasServer = true,
  emptyServerState,
  children,
}: ServerIntegrationModalShellProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const previousOverflow = document.body.style.overflow
    const previouslyFocused = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()

    const focusableSelector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

    const getFocusable = () => {
      if (!panelRef.current) return [] as HTMLElement[]
      return Array.from(panelRef.current.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (el) => el.tabIndex !== -1 && !el.hasAttribute('disabled')
      )
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const focusable = getFocusable()
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus()
    }
  }, [isOpen, onClose])

  if (isOpen === false) return null;

  const titleId = 'integration-modal-title';
  const descriptionId = description ? 'integration-modal-description' : undefined;

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md',
        isExiting ? 'animate-out fade-out duration-150' : 'animate-in fade-in duration-150'
      )}
    >
      <div
        className="fixed inset-0 bg-transparent"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        ref={panelRef}
        className={cn(
          'relative z-10 flex max-h-[90vh] w-full flex-col overflow-hidden rounded-3xl text-white backdrop-blur-3xl',
          isExiting ? 'animate-out fade-out zoom-out-95 duration-150' : 'animate-in fade-in zoom-in-95 duration-150',
          maxWidthClass
        )}
        style={{
          backgroundColor: 'oklch(from var(--dk-surface-base) l c h / 0.78)',
          boxShadow:
            'inset 0 1px 1px 0 rgba(255, 255, 255, 0.15), inset 0 0 0 1px rgba(255, 255, 255, 0.04), 0 30px 60px -12px rgba(0, 0, 0, 0.85)',
        }}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-3 px-4 pt-5 pb-2">
            <div className="flex min-w-0 items-center gap-3">
              <div
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10',
                  brandBgClass
                )}
                style={brandColor ? { color: brandColor } : undefined}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <h2 id={titleId} className="text-lg font-bold leading-tight tracking-tight text-white">
                  {title}
                </h2>
                {description && (
                  <p id={descriptionId} className="mt-0 text-xs leading-tight text-white/60">
                    {description}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-xl p-2 text-white/40 transition-all hover:bg-white/10 hover:text-white cursor-pointer"
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center gap-2 p-12 text-xs text-white/60">
              <RefreshCw
                className="h-4 w-4 animate-spin"
                style={brandColor ? { color: brandColor } : undefined}
              />
              <span>{loadingText}</span>
            </div>
          ) : !hasServer ? (
            emptyServerState || (
              <IntegrationEmptyServerState
                serviceName={title}
                onClose={onClose}
              />
            )
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}

export function IntegrationCardSection({
  title,
  statusBadge,
  children,
  className,
}: {
  title?: string;
  icon?: React.ComponentType<{ className?: string }>;
  iconColorClass?: string;
  statusBadge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('space-y-3 rounded-2xl p-3', className)}
      style={{ backgroundColor: 'var(--dk-surface-glass)' }}
    >
      {(title || statusBadge) && (
        <div className="relative flex min-h-5 items-center justify-center">
          {title && (
            <h3 className="text-center text-sm font-medium text-white/60">
              {title}
            </h3>
          )}
          {statusBadge && (
            <div className="absolute right-0 top-1/2 -translate-y-1/2">
              {statusBadge}
            </div>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

export function IntegrationStatusBadge({
  testResult,
  isConfigured,
}: {
  testResult?: { ok: boolean; message?: string } | null;
  isConfigured?: boolean;
}) {
  if (testResult) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
          testResult.ok ? 'text-emerald-400' : 'text-rose-400'
        )}
      >
        {testResult.ok ? (
          <CheckCircle2 className="h-3 w-3" />
        ) : (
          <AlertCircle className="h-3 w-3" />
        )}
        {testResult.ok ? 'Connected' : 'Offline'}
      </span>
    );
  }

  if (isConfigured) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-emerald-400">
        <CheckCircle2 className="h-3 w-3" />
        Configured
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white/40">
      <AlertCircle className="h-3 w-3" />
      Not Connected
    </span>
  );
}

export function IntegrationEmptyServerState({
  serviceName,
  iconBgClass,
  buttonBgClass,
  onClose,
}: {
  serviceName: string;
  iconBgClass?: string;
  buttonBgClass?: string;
  onClose?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
      <div
        className={cn(
          'rounded-2xl bg-white/10 p-3 text-white/70',
          iconBgClass
        )}
      >
        <Server className="h-6 w-6" />
      </div>
      <p className="text-sm font-semibold text-white">
        No Game Server Connected
      </p>
      <p className="max-w-sm text-xs text-white/60">
        {serviceName} is managed through a self-hosted Otix Server or Game Server node.
        Connect a server first to configure downloads.
      </p>
      <DkButton asChild size="md" className={cn('mt-2', buttonBgClass)}>
        <a href="/settings/launcher" onClick={onClose}>
          Connect a game server
        </a>
      </DkButton>
    </div>
  );
}

export function connectionTestToneClass(testResult?: { ok: boolean } | null) {
  if (!testResult) return '!bg-amber-400 !text-black hover:!bg-amber-300'
  if (testResult.ok) return '!bg-emerald-500 !text-white hover:!bg-emerald-400'
  return '!bg-rose-500 !text-white hover:!bg-rose-400'
}

export function useResetConnectionTest(
  connection: { host: string; port: number; apiKey: string; useSsl: boolean; urlBase: string },
  reset: () => void,
) {
  const fingerprint = `${connection.host}\0${connection.port}\0${connection.apiKey}\0${connection.useSsl}\0${connection.urlBase}`
  const previous = useRef(fingerprint)
  useEffect(() => {
    if (previous.current === fingerprint) return
    previous.current = fingerprint
    reset()
  }, [fingerprint, reset])
}

export function IntegrationModalFooter({
  onCancel,
  onSave,
  isSaving,
  saveButtonText = 'Save',
  saveButtonClass,
  leftSlot,
  onTest,
  isTesting,
  testResult,
  isConfigured,
}: {
  onCancel: () => void;
  onSave?: () => void;
  isSaving?: boolean;
  saveButtonText?: string;
  saveButtonClass?: string;
  leftSlot?: React.ReactNode;
  onTest?: () => void;
  isTesting?: boolean;
  testResult?: { ok: boolean; message?: string } | null;
  isConfigured?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        {leftSlot}
        {onTest ? (
          <IntegrationStatusBadge testResult={testResult} isConfigured={isConfigured} />
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <DkButton type="button" variant="ghost" size="md" onClick={onCancel}>
          Cancel
        </DkButton>
        {onTest ? (
          <DkButton
            type="button"
            variant="primary"
            size="md"
            onClick={onTest}
            loading={isTesting}
            className={connectionTestToneClass(testResult)}
          >
            Test connection
          </DkButton>
        ) : null}
        <DkButton
          type={onSave ? 'button' : 'submit'}
          variant="primary"
          size="md"
          onClick={onSave}
          loading={isSaving}
          className={saveButtonClass}
        >
          {saveButtonText}
        </DkButton>
      </div>
    </div>
  );
}
