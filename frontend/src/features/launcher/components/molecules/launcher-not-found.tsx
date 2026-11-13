import { Link } from '@tanstack/react-router'
import { Gamepad2 } from 'lucide-react'

export const LauncherNotFound = () => {
  return (
    <div className="w-full h-full min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <Gamepad2 size={64} className="mx-auto opacity-20 text-muted-foreground" />
        <h1 className="text-3xl font-black text-foreground">404</h1>
        <p className="text-sm text-muted-foreground max-w-xs">This game page doesn't exist or has been removed.</p>
        <Link
          to="/launcher"
          className="inline-block mt-4 px-4 py-2 bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-field)] border border-[var(--dk-separator)] rounded-xl text-sm text-foreground transition-colors"
        >
          Back to Launcher
        </Link>
      </div>
    </div>
  )
};
