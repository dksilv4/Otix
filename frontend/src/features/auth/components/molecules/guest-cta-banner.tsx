import { Link } from '@tanstack/react-router'
import { Sparkles, ArrowRight } from 'lucide-react'
import { useAuth } from '@auth/hooks/use-auth'

interface GuestCtaBannerProps {
  title?: string
  description?: string
  className?: string
}

/** Non-intrusive inline Call-to-Action banner for guest (unauthenticated) users. */
export function GuestCtaBanner({
  title = 'Track your movies, shows, games, and music in one place',
  description = 'Create a free Otix account to build your library, sync your watch history, and share your ratings.',
  className = '',
}: GuestCtaBannerProps) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading || isAuthenticated) return null

  return (
    <div
      className={`relative overflow-hidden rounded-3xl p-6 sm:p-8 backdrop-blur-2xl border border-white/10 ${className}`}
      style={{
        backgroundColor: 'oklch(from var(--dk-surface-base) l c h / 0.4)',
        boxShadow: 'var(--dk-shadow-glass)',
      }}
    >
      {/* Subtle glowing ambient atmosphere */}
      <div
        className="absolute -top-24 -right-24 h-64 w-64 rounded-full opacity-20 pointer-events-none blur-3xl"
        style={{ backgroundColor: 'var(--primary)' }}
      />

      <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="space-y-1.5 max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Otix Account</span>
          </div>
          <h3 className="text-lg font-bold text-white tracking-tight">{title}</h3>
          <p className="text-sm text-white/60 leading-relaxed">{description}</p>
        </div>

        <div className="flex items-center gap-3 shrink-0 self-stretch sm:self-auto">
          <Link
            to="/auth/register"
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition-all hover:bg-primary/90 active:scale-[0.98]"
          >
            <span>Create Account</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/auth/login"
            className="inline-flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 px-4 py-2.5 text-sm font-medium text-white/80 hover:text-white transition-colors"
          >
            Sign In
          </Link>
        </div>
      </div>
    </div>
  )
}
