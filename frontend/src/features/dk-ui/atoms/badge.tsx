import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-lg px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-primary/10 text-primary',
        secondary: 'bg-secondary text-secondary-foreground',
        success: 'bg-green-500/10 text-green-600 dark:text-green-400',
        warning: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
        destructive: 'bg-destructive/10 text-destructive',
        muted: 'bg-muted text-muted-foreground',
        movie: 'text-white shadow-sm',
        show: 'text-white shadow-sm',
        game: 'text-white shadow-sm',
      },
      size: {
        sm: 'px-2 py-0 text-[0.625rem] rounded-md',
        md: 'px-2.5 py-0.5 text-xs rounded-lg',
        lg: 'px-3 py-1 text-sm rounded-xl',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
)

interface DkBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  removable?: boolean
  onRemove?: () => void
}

function DkBadge({ className, variant, size, removable, onRemove, children, ...props }: DkBadgeProps) {
  const mediaColors: Record<string, string> = {
    movie: 'var(--media-movie)',
    show: 'var(--media-show)',
    game: 'var(--media-game)',
  }

  return (
    <span
      className={cn(badgeVariants({ variant, size }), className)}
      style={variant && mediaColors[variant] ? { backgroundColor: mediaColors[variant] } : undefined}
      {...props}
    >
      {children}
      {removable && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
          aria-label="Remove"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  )
}

export { DkBadge, badgeVariants }
