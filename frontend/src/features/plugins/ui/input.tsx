import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ invalid, className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          'w-full h-9 rounded-xl bg-[var(--dk-surface-field)] border border-[var(--dk-separator)] px-3 text-sm text-foreground',
          'placeholder:text-muted-foreground outline-none transition-all',
          'focus:border-primary focus:ring-1 focus:ring-primary/30',
          invalid && 'border-destructive/60 focus:border-destructive focus:ring-destructive/30',
          className,
        )}
        {...props}
      />
    )
  },
)
Input.displayName = 'Input'
