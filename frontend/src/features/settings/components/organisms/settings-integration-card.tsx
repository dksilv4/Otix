import type { ReactNode } from 'react'
import { Check, Plus, Settings, Unlink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DkButton } from '@ui/atoms/button'
import { DkDialog } from '@ui/molecules/dialog'

export const IntegrationCard = ({
  name,
  description,
  brandColor,
  brandBg,
  icon: Icon,
  isConnected,
  expanded,
  onToggle,
  onConnect,
  connecting,
  connectDisabled,
  onDisconnect,
  disconnecting,
  error,
  children,
  className,
  style,
}: {
  name: string
  description: string
  brandColor: string
  brandBg: string
  icon: React.ComponentType<{ className?: string }>
  isConnected: boolean
  expanded: boolean
  onToggle: () => void
  onConnect?: () => void
  connecting?: boolean
  connectDisabled?: boolean
  onDisconnect?: () => void
  disconnecting?: boolean
  error?: string
  children?: ReactNode
  className?: string
  style?: React.CSSProperties
}) => {
  return (
    <>
      <div
        className={cn(
          'rounded-2xl overflow-hidden backdrop-blur-xl transition-all duration-200',
          className,
        )}
        style={{
          backgroundColor: 'var(--dk-surface-raised)',
          boxShadow: 'var(--dk-shadow-card)',
          ...style,
        }}
      >
        <div
          role={isConnected ? 'button' : undefined}
          tabIndex={isConnected ? 0 : undefined}
          onClick={isConnected ? onToggle : undefined}
          onKeyDown={
            isConnected
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onToggle()
                  }
                }
              : undefined
          }
          className={cn(
            'flex w-full items-center gap-4 px-5 py-4 text-left transition-colors duration-150',
            isConnected && 'cursor-pointer hover:bg-[var(--dk-surface-hover)] active:bg-[var(--dk-surface-hover)]',
          )}
        >
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', brandBg)} style={{ color: brandColor }}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground">{name}</p>
              {isConnected && <span className="h-1.5 w-1.5 rounded-full shrink-0 bg-emerald-500" />}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>
          </div>
          {isConnected ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                <Check className="h-3.5 w-3.5" />
                Connected
              </span>
              <span
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium text-foreground bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-hover)] transition-colors"
                aria-label={`Configure ${name}`}
              >
                <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Configure</span>
              </span>
            </div>
          ) : (
            <DkButton
              size="sm"
              onClick={onConnect}
              loading={connecting}
              disabled={connectDisabled}
              leftIcon={Plus}
              className="shrink-0 w-[90px]"
            >
              Connect
            </DkButton>
          )}
        </div>
        {error && !isConnected && <p className="px-5 pb-3 text-xs text-destructive">{error}</p>}
      </div>

      {isConnected && (
        <DkDialog
          open={expanded}
          onOpenChange={(open) => {
            if (!open) {
              onToggle()
            }
          }}
          title={
            <div className="flex items-center gap-3">
              <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', brandBg)} style={{ color: brandColor }}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <span className="text-base font-semibold text-foreground">{name} Settings</span>
              </div>
            </div>
          }
          description={description}
          className="max-w-2xl max-h-[85vh] overflow-y-auto"
        >
          <div className="space-y-4 pt-1">
            {children}
            {onDisconnect && (
              <div className="pt-2">
                <DkButton
                  size="sm"
                  variant="ghost"
                  onClick={onDisconnect}
                  loading={disconnecting}
                  leftIcon={Unlink}
                  loadingText="Disconnecting…"
                  className="w-full bg-destructive/10 text-destructive shadow-none hover:bg-destructive/15"
                >
                  Disconnect {name}
                </DkButton>
              </div>
            )}
          </div>
        </DkDialog>
      )}
    </>
  )
};

export const IntegrationProfile = ({
  avatarUrl,
  avatarAlt,
  name,
  detail,
  brandColor,
  brandBg,
  icon: Icon,
  meta,
}: {
  avatarUrl?: string | null
  avatarAlt: string
  name: string
  detail: string
  brandColor?: string
  brandBg?: string
  icon?: React.ComponentType<{ className?: string }>
  meta?: ReactNode
}) => {
  return (
    <div className="flex items-center gap-3 px-5 py-4">
      {avatarUrl ? (
        <img src={avatarUrl} alt={avatarAlt} className="h-10 w-10 rounded-xl object-cover" />
      ) : (
        <div
          className={cn('flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--dk-surface-ghost)]', brandBg)}
          style={brandColor ? { color: brandColor } : undefined}
        >
          {Icon && <Icon className="h-5 w-5" />}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">{name}</p>
        <p className="text-xs text-muted-foreground truncate">{detail}</p>
      </div>
      {meta}
    </div>
  )
};

export const IntegrationAction = ({
  label,
  description,
  result,
  buttonLabel,
  buttonIcon: ButtonIcon,
  onPress,
  loading,
  disabled,
  progress,
  children,
  muted,
}: {
  label: string
  description: string
  result?: string | null
  buttonLabel: string
  buttonIcon?: React.ComponentType<{ className?: string }>
  onPress: () => void
  loading?: boolean
  disabled?: boolean
  progress?: ReactNode
  children?: ReactNode
  muted?: boolean
}) => {
  return (
    <div className={cn('flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4', muted && 'bg-[var(--dk-surface-ghost)]')}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">{label}</p>
          {progress}
        </div>
        <p className="mt-1 text-sm font-medium text-foreground">{description}</p>
        {result && <p className="text-xs text-muted-foreground mt-0.5">{result}</p>}
        {children}
      </div>
      <DkButton
        size="sm"
        variant="ghost"
        onClick={onPress}
        loading={loading}
        disabled={disabled}
        leftIcon={ButtonIcon}
        className="shrink-0 self-start sm:self-center bg-primary/10 text-primary shadow-none hover:bg-primary/15"
      >
        {buttonLabel}
      </DkButton>
    </div>
  )
};

export const IntegrationStats = ({ items }: { items: { label: string; value: string | number }[] }) => {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground px-5 py-3">
      {items.map((item) => (
        <span key={item.label}>
          <strong className="text-foreground font-semibold">{item.value}</strong> {item.label}
        </span>
      ))}
    </div>
  )
};
