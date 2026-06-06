import { forwardRef } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import './button.scss'

const buttonVariants = cva(
  'dk-btn',
  {
    variants: {
      variant: {
        primary: 'dk-btn--primary',
        secondary: 'dk-btn--secondary',
        ghost: 'dk-btn--ghost',
        destructive: 'dk-btn--destructive',
        glass: 'dk-btn--glass',
        outline: 'dk-btn--outline',
        link: 'dk-btn--link',
      },
      size: {
        xs: 'dk-btn--xs',
        sm: 'dk-btn--sm',
        md: 'dk-btn--md',
        lg: 'dk-btn--lg',
        xl: 'dk-btn--xl',
        icon: 'dk-btn--icon',
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

const DkButton = forwardRef<HTMLButtonElement, DkButtonProps>(
  ({ className, variant, size, asChild = false, loading, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="dk-btn__spinner" />}
        {children}
      </Comp>
    )
  },
)
DkButton.displayName = 'DkButton'

export { DkButton, DkButton as Button, buttonVariants }
export type { DkButtonProps as ButtonProps }
