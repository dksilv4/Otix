import { forwardRef } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--dk-ring-color)] disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97]',
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
        md: 'h-10 rounded-xl px-4 text-sm',
        lg: 'h-12 rounded-xl px-6 text-base',
        xl: 'h-14 rounded-2xl px-8 text-base font-bold tracking-wide uppercase',
        icon: 'h-10 w-10 rounded-xl',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
)

export interface DkButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
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
  ({ className, variant, size, asChild = false, loading, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
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
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {children}
          </>
        )}
      </Comp>
    )
  },
)
DkButton.displayName = 'DkButton'

export { DkButton, DkButton as Button, buttonVariants }
export type { DkButtonProps as ButtonProps }
