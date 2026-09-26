import { forwardRef } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2, Check, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--dk-ring-color)] disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97]',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-[var(--dk-surface-ghost-hover)] active:bg-[var(--dk-surface-ghost-active)]',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        glass: 'hover:bg-[var(--dk-surface-glass-hover)]',
        outline: 'hover:bg-[var(--dk-surface-ghost-hover)]',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        xs: 'h-7 rounded-lg px-2.5 text-xs gap-1.5',
        sm: 'h-8 rounded-lg px-3 text-xs gap-1.5',
        md: 'h-10 rounded-xl px-4 text-sm gap-2',
        lg: 'h-12 rounded-xl px-6 text-base gap-2.5',
        xl: 'h-14 rounded-2xl px-8 text-base font-bold tracking-wide uppercase gap-3',
        icon: 'h-10 w-10 rounded-xl',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
)

// Icon sizes mapped to button sizes for consistent proportions
const iconSizeMap: Record<string, string> = {
  xs: 'h-3.5 w-3.5',
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
  xl: 'h-5 w-5',
  icon: 'h-5 w-5',
}

export interface DkButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** Show a loading spinner and disable the button */
  loading?: boolean
  /** Optional text to display while loading (replaces children) */
  loadingText?: string
  /** Icon component rendered before the label — auto-sized to match button size */
  leftIcon?: React.ComponentType<{ className?: string }>
  /** Icon component rendered after the label — auto-sized to match button size */
  rightIcon?: React.ComponentType<{ className?: string }>
  /** Show a success state (green tint + check icon replacing leftIcon) */
  success?: boolean
  /** Custom icon for the success state (defaults to Check) */
  successIcon?: React.ComponentType<{ className?: string }>
  /** Show an error state (red tint + alert icon replacing leftIcon) */
  error?: boolean
  /** Render as a square icon-only button (hides children) */
  iconOnly?: boolean
}

const variantStyles: Record<string, React.CSSProperties> = {
  primary: {
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)',
  },
  glass: {
    backdropFilter: 'blur(12px)',
    boxShadow: 'var(--dk-shadow-glass)',
  },
  outline: {
    boxShadow: 'inset 0 0 0 1px var(--dk-separator)',
  },
}

const DkButton = forwardRef<HTMLButtonElement, DkButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading,
      loadingText,
      leftIcon: LeftIcon,
      rightIcon: RightIcon,
      success,
      successIcon: SuccessIcon = Check,
      error,
      iconOnly,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button'
    const resolvedSize = size ?? 'md'
    const iconCls = iconSizeMap[resolvedSize] ?? iconSizeMap.md

    // Determine which left-side icon to render based on state priority
    const renderLeftIcon = () => {
      if (loading) {
        return <Loader2 className={cn(iconCls, 'animate-spin shrink-0')} />
      }
      if (success) {
        return <SuccessIcon className={cn(iconCls, 'shrink-0 text-emerald-400')} />
      }
      if (error) {
        return <AlertCircle className={cn(iconCls, 'shrink-0 text-red-400')} />
      }
      if (LeftIcon) {
        return <LeftIcon className={cn(iconCls, 'shrink-0')} />
      }
      return null
    }

    // State-based ring/tint classes
    const stateClasses = cn(
      success && 'ring-1 ring-emerald-500/30',
      error && 'ring-1 ring-red-500/30',
    )

    return (
      <Comp
        className={cn(
          buttonVariants({ variant, size, className }),
          stateClasses,
        )}
        ref={ref}
        disabled={disabled || loading}
        style={{
          transition: 'all var(--dk-duration-fast) var(--dk-ease-out)',
          ...(variant && variantStyles[variant] ? variantStyles[variant] : {}),
        }}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {renderLeftIcon()}
            {iconOnly ? null : (loading && loadingText ? loadingText : children)}
            {RightIcon && !iconOnly && (
              <RightIcon className={cn(iconCls, 'shrink-0')} />
            )}
          </>
        )}
      </Comp>
    )
  },
)
DkButton.displayName = 'DkButton'

export { DkButton, DkButton as Button }
export type { DkButtonProps as ButtonProps }
