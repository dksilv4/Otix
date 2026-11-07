import { Link } from '@tanstack/react-router'

export interface NodesPageHeaderProps {
  isAuthenticated: boolean
  onlineInfrastructureCount: number
  totalInfrastructureCount: number
}

export const NodesPageHeader = ({
  isAuthenticated,
  onlineInfrastructureCount,
  totalInfrastructureCount,
}: NodesPageHeaderProps) => {
  return (
    <div className="space-y-4 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/[0.04]">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Nodes
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-primary/10 text-primary border border-primary/20">
              <span className="w-1.5 h-1.5 rounded-full bg-status-online" />
              <span>
                {onlineInfrastructureCount}/{totalInfrastructureCount} online
              </span>
            </span>
            {!isAuthenticated && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--dk-surface-ghost)] border border-white/[0.04] text-muted-foreground">
                Guest Mode
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Worker companions, server machines, Samba network storage, and dedicated game servers.
          </p>
        </div>
        {!isAuthenticated && (
          <Link
            to="/auth/login"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 transition-all cursor-pointer self-start sm:self-auto"
          >
            Sign in to sync cloud nodes
          </Link>
        )}
      </div>
    </div>
  )
}
