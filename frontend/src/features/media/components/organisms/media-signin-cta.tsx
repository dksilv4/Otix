import { Link, useLocation } from '@tanstack/react-router'
import { Logo } from '@/old-features/ui/atoms/logo'

export function SignInCTA() {
  const location = useLocation()

  return (
    <div>
      <div className="glass-card relative overflow-hidden p-8 transition-all duration-300 group">
        {/* Apple-like soft structural glow */}
        <div className="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full bg-white/[0.02] blur-3xl group-hover:bg-white/[0.04] transition-all duration-500" />
        
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
            {/* Minimalist Logo container */}
            <div className="relative shrink-0 p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 transition-colors duration-300 group-hover:bg-white/[0.04]">
              <Logo className="h-9 w-auto text-white transition-opacity duration-300 opacity-90 group-hover:opacity-100" />
            </div>

            <div className="space-y-1">
              <h3 className="text-xl md:text-2xl font-semibold text-white tracking-tight">
                Unlock Your Personal Library
              </h3>
              <p className="text-neutral-400 text-sm md:text-base max-w-lg leading-relaxed font-normal">
                Sign in to track what you've watched, customize your lists, and rate titles with the community.
              </p>
            </div>
          </div>

          <Link
            to="/auth/login"
            search={{ redirect: location.href }}
            className="shrink-0 inline-flex items-center justify-center rounded-full bg-white hover:bg-neutral-200 text-neutral-950 font-semibold px-6 py-2.5 text-sm transition-all duration-300 shadow-sm hover:scale-[1.02] active:scale-[0.98]"
          >
            Sign In to Otix
          </Link>
        </div>
      </div>
    </div>
  )
}
