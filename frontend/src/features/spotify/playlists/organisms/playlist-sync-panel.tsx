import { RefreshCw, CheckCircle2, Bell, BellOff } from "lucide-react"
import { cn } from "@/lib/utils"

interface PlaylistSyncPanelProps {
  isSubscribed: boolean
  isSyncing?: boolean
  onSubscribe: () => void
  onUnsubscribe: () => void
  onSync: () => void
  lastSyncedAt: string | null
}

export function PlaylistSyncPanel({ isSubscribed, isSyncing, onSubscribe, onUnsubscribe, onSync, lastSyncedAt }: PlaylistSyncPanelProps) {
  if (isSubscribed) {
    return (
      <div className="inline-flex items-center gap-2">
        <button
          onClick={onSync}
          disabled={isSyncing}
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
            "border border-border hover:bg-[var(--dk-surface-glass)]",
            isSyncing && "opacity-50 cursor-not-allowed",
          )}
          title="Sync now"
        >
          <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
          {isSyncing ? "Syncing..." : "Sync"}
        </button>
        <button
          onClick={onUnsubscribe}
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          title="Unsubscribe"
        >
          <BellOff className="h-4 w-4" />
          Unsubscribe
        </button>
        {lastSyncedAt && !isSyncing && (
          <span className="text-xs text-muted-foreground">
            <CheckCircle2 className="h-3 w-3 inline mr-1" />
            Synced
          </span>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={onSubscribe}
      disabled={isSyncing}
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
        "border border-primary/30 text-primary hover:bg-primary/10",
      )}
    >
      <Bell className="h-4 w-4" />
      Subscribe
    </button>
  )
}
