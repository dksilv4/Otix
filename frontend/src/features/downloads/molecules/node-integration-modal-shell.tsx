import React from 'react';
import {
  Server,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DkButton } from '@ui/atoms/button';
import { DkDialog } from '@ui/molecules/dialog';

export interface NodeIntegrationModalShellProps {
  isOpen?: boolean;
  isExiting?: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  brandColor?: string;
  brandBgClass?: string;
  maxWidthClass?: string;
  badge?: React.ReactNode;
  isLoading?: boolean;
  loadingText?: string;
  hasNode?: boolean;
  hasServer?: boolean;
  emptyNodeState?: React.ReactNode;
  emptyServerState?: React.ReactNode;
  children: React.ReactNode;
}

export type ServerIntegrationModalShellProps = NodeIntegrationModalShellProps;

export const NodeIntegrationModalShell = ({
  isOpen = true,
  isExiting,
  onClose,
  title,
  description,
  icon: Icon,
  brandColor,
  brandBgClass,
  maxWidthClass = 'max-w-xl',
  badge,
  isLoading = false,
  loadingText = 'Loading current settings...',
  hasNode,
  hasServer = true,
  emptyNodeState,
  emptyServerState,
  children,
}: NodeIntegrationModalShellProps) => {
  const titleId = 'integration-modal-title';
  const descriptionId = description ? 'integration-modal-description' : undefined;
  const isAvailable = hasNode ?? hasServer;

  return (
    <DkDialog
      open={isOpen !== false && !isExiting}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      className={cn('max-h-[90vh] p-0 sm:p-0 flex flex-col overflow-hidden', maxWidthClass)}
    >
      <div
        className="relative z-10 flex min-h-0 flex-1 flex-col"
        role="document"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div className="flex shrink-0 items-center gap-3 px-4 pt-5 pb-2 pr-14">
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
            {badge ? (
              <span className="mt-1 inline-flex rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/70">
                {badge}
              </span>
            ) : null}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-xs text-white/60">
            <RefreshCw
              className="h-4 w-4 animate-spin"
              style={brandColor ? { color: brandColor } : undefined}
            />
            <span>{loadingText}</span>
          </div>
        ) : !isAvailable ? (
          emptyNodeState || emptyServerState || (
            <IntegrationEmptyNodeState
              serviceName={title}
              onClose={onClose}
            />
          )
        ) : (
          children
        )}
      </div>
    </DkDialog>
  );
};

export const ServerIntegrationModalShell = NodeIntegrationModalShell;

export const IntegrationCardSection = ({
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
}) => {
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
};

export const IntegrationStatusBadge = ({
  testResult,
  isConfigured,
}: {
  testResult?: { ok: boolean; message?: string } | null;
  isConfigured?: boolean;
}) => {
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
};

export const IntegrationEmptyNodeState = ({
  serviceName,
  title,
  description,
  iconBgClass,
  buttonBgClass,
  onClose,
}: {
  serviceName?: string;
  title?: string;
  description?: string;
  iconBgClass?: string;
  buttonBgClass?: string;
  onClose?: () => void;
}) => {
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
        {title || 'No Node Connected'}
      </p>
      <p className="max-w-sm text-xs text-white/60">
        {description ||
          `${serviceName || 'This service'} is managed through a self-hosted Otix Node. Connect a node first to configure downloads.`}
      </p>
      <DkButton asChild size="md" className={cn('mt-2', buttonBgClass)}>
        <a href="/settings/library#downloads" onClick={onClose}>
          Connect a node
        </a>
      </DkButton>
    </div>
  );
};

export const IntegrationEmptyServerState = IntegrationEmptyNodeState;

import { connectionTestToneClass } from '../utils'

export const IntegrationModalFooter = ({
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
}) => {
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
};
