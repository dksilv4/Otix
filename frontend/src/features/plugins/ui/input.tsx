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
          'w-full h-9 rounded-xl bg-white/[0.04] border border-white/[0.06] px-3 text-sm text-white',
          'placeholder:text-white/30 outline-none transition-all',
          'focus:border-primary/40 focus:bg-white/[0.06]',
          invalid && 'border-red-500/40 focus:border-red-500/50',
          className,
        )}
        {...props}
      />
    )
  },
)
Input.displayName = 'Input'
