import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
import './badge.scss'

const badgeVariants = cva(
  'dk-badge',
  {
    variants: {
      variant: {
        default: 'dk-badge--default',
        secondary: 'dk-badge--secondary',
        success: 'dk-badge--success',
        warning: 'dk-badge--warning',
        destructive: 'dk-badge--destructive',
        muted: 'dk-badge--muted',
        movie: 'dk-badge--movie',
        show: 'dk-badge--show',
        game: 'dk-badge--game',
        music: 'dk-badge--music',
        outline: 'dk-badge--outline',
      },
      size: {
        sm: 'dk-badge--sm',
        md: 'dk-badge--md',
        lg: 'dk-badge--lg',
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
    music: 'var(--media-music)',
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
          className="dk-badge__remove"
          aria-label="Remove"
        >
          <X className="dk-badge__close-icon" />
        </button>
      )}
    </span>
  )
}

export { DkBadge, DkBadge as Badge, badgeVariants }
