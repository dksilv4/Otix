import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
type Size = 'xs' | 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: React.ReactNode
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20',
  secondary:
    'bg-[var(--dk-surface-field)] border border-[var(--dk-separator)] text-foreground hover:bg-[var(--dk-surface-hover)]',
  ghost:
    'bg-transparent text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-hover)]',
  danger:
    'bg-destructive/15 border border-destructive/20 text-destructive hover:bg-destructive/25',
  outline:
    'border border-[var(--dk-separator)] text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-[var(--dk-surface-hover)]',
}

const SIZE_CLASSES: Record<Size, string> = {
  xs: 'h-7 px-2.5 text-[11px] gap-1.5 rounded-lg',
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-9 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-11 px-5 text-sm gap-2 rounded-xl',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center font-semibold transition-all select-none',
          'active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none cursor-pointer',
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size],
          className,
        )}
        {...props}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
        {children}
      </button>
    )
  },
)
Button.displayName = 'Button'
