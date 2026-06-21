// TODO: Review this file
import { RefreshCw, CheckCircle2, Bell, BellOff } from "lucide-react"
import { cn } from "@/lib/utils"
import "./playlist-sync-panel.scss"

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
      <div className="dk-playlist-sync-panel">
        <button
          onClick={onSync}
          disabled={isSyncing}
          className={cn(
            "dk-playlist-sync-panel__sync-btn",
            isSyncing && "dk-playlist-sync-panel__sync-btn--syncing",
          )}
          title="Sync now"
        >
          <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
          {isSyncing ? "Syncing..." : "Sync"}
        </button>
        <button
          onClick={onUnsubscribe}
          className="dk-playlist-sync-panel__unsub-btn"
          title="Unsubscribe"
        >
          <BellOff className="h-4 w-4" />
          Unsubscribe
        </button>
        {lastSyncedAt && !isSyncing && (
          <span className="dk-playlist-sync-panel__status">
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
      className="dk-playlist-sync-panel__sub-btn"
    >
      <Bell className="h-4 w-4" />
      Subscribe
    </button>
  )
}
