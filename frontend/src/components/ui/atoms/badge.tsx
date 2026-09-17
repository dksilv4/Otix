import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

const badgeVariants = cva(
  'inline-flex items-center gap-1 text-xs font-semibold',
  {
    variants: {
      variant: {
        default: 'bg-primary/10 text-primary',
        secondary: 'bg-secondary text-secondary-foreground',
        success: 'bg-green-500/10 text-green-600 dark:text-green-400',
        warning: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
        destructive: 'bg-destructive/10 text-destructive',
        muted: 'bg-muted text-muted-foreground',
        movie: 'text-white',
        show: 'text-white',
        game: 'text-white',
        music: 'text-white',
        outline: 'border border-input text-foreground',
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
  show?: boolean
}

function DkBadge({ className, variant, size, removable, onRemove, show = true, children, ...props }: DkBadgeProps) {
  if (!show || children == null || children === '' || children === false) return null

  const mediaColors: Record<string, string> = {
    movie: 'var(--media-movie)',
    show: 'var(--media-show)',
    game: 'var(--media-game)',
    music: 'var(--media-music)',
  }

  return (
    <span
      className={cn(badgeVariants({ variant, size }), className)}
      style={{
        transition: 'color var(--dk-duration-fast) var(--dk-ease-out), background-color var(--dk-duration-fast) var(--dk-ease-out)',
        ...(variant && mediaColors[variant] ? { backgroundColor: mediaColors[variant] } : {}),
      }}
      {...props}
    >
      {children}
      {removable && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 [[data-theme='dark']_&]:hover:bg-white/10"
          aria-label="Remove"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  )
}

export { DkBadge, DkBadge as Badge, badgeVariants }
