import { WifiOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOffline } from '@/lib/offline'

/** Subtle "you're offline, here's saved data" pill. Renders nothing when online. */
export function OfflineNotice({ className }: { className?: string }) {
  const offline = useOffline()
  if (!offline) return null
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-[11px] font-medium text-amber-200',
        className,
      )}
    >
      <WifiOff className="h-3 w-3 shrink-0" />
      Offline — showing cached data
    </div>
  )
}
