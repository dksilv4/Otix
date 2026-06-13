import { BookmarkIcon, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { useSteamWishlistScan } from "../library-queries"

export function WishlistEmptyState() {
  const scan = useSteamWishlistScan()

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--dk-surface-glass)]">
        <BookmarkIcon className="h-8 w-8 opacity-40" />
      </div>
      <p className="text-lg font-semibold text-foreground">Wishlist empty</p>
      <p className="mt-1 text-sm text-muted-foreground max-w-sm">
        Scan your Steam wishlist to see your wishlisted games here.
      </p>
      <button
        onClick={() => scan.mutate()}
        disabled={scan.isPending}
        className={cn(
          "mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium",
          "bg-primary text-primary-foreground hover:opacity-90 transition-opacity",
          scan.isPending && "opacity-60 pointer-events-none",
        )}
      >
        <RefreshCw className={cn("h-4 w-4", scan.isPending && "animate-spin")} />
        {scan.isPending ? "Scanning..." : "Scan Wishlist"}
      </button>
      {scan.data && scan.data.private && (
        <p className="mt-2 text-xs text-amber-500">
          Your Steam wishlist is private. Set your Steam profile privacy to Public to import your wishlist.
        </p>
      )}
      {scan.data && !scan.data.private && (
        <p className="mt-2 text-xs text-muted-foreground">
          Found {scan.data.matched} matches out of {scan.data.total} wishlist items.
        </p>
      )}
      {scan.error && (
        <p className="mt-2 text-xs text-destructive">
          Scan failed. Please try again.
        </p>
      )}
    </div>
  )
}
