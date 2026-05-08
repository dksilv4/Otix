import { InfinitySpinner } from '@ui/atoms/infinity-spinner'
import { Logo } from '@ui/atoms/logo'
import { cn } from '@/lib/utils'

export function LoadingPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 bg-background">
      <div
        className={cn(
          'flex flex-col items-center gap-6 p-10 rounded-[2rem]',
          'bg-gradient-to-br from-[var(--dk-surface-glass)] to-[var(--dk-surface-glass-hover)]',
          'backdrop-blur-xl',
          'shadow-[var(--dk-shadow-glass)]',
        )}
      >
        <div className="w-24 h-12 text-foreground">
          <InfinitySpinner />
        </div>
        <Logo className="h-6" />
      </div>
    </div>
  )
}
