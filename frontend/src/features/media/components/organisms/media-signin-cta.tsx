import { Link, useLocation } from '@tanstack/react-router'
import { Logo } from '@ui/atoms/logo'

export const SignInCTA = () => {
  const location = useLocation()

  return (
    <div>
      <div className="glass-card relative overflow-hidden p-8 transition-all duration-300 group">
        {/* Apple-like soft structural glow */}
        <div className="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full bg-primary/5 blur-3xl group-hover:bg-primary/10 transition-all duration-500" />
        
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
            {/* Minimalist Logo container */}
            <div className="relative shrink-0 p-3.5 rounded-2xl bg-[var(--dk-surface-glass)] border border-[var(--dk-separator)] transition-colors duration-300 group-hover:bg-[var(--dk-surface-glass-hover)]">
              <Logo className="h-9 w-auto text-foreground transition-opacity duration-300 opacity-90 group-hover:opacity-100" />
            </div>

            <div className="space-y-1">
              <h3 className="text-xl md:text-2xl font-semibold text-foreground tracking-tight">
                Unlock Your Personal Library
              </h3>
              <p className="text-muted-foreground text-sm md:text-base max-w-lg leading-relaxed font-normal">
                Sign in to track what you've watched, customize your lists, and rate titles with the community.
              </p>
            </div>
          </div>

          <Link
            to="/auth/login"
            search={{ redirect: location.href }}
            className="shrink-0 inline-flex items-center justify-center rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 py-2.5 text-sm transition-all duration-300 shadow-sm hover:scale-[1.02] active:scale-[0.98]"
          >
            Sign In to Otix
          </Link>
        </div>
      </div>
    </div>
  )
};
