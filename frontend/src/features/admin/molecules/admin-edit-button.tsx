import { useState } from 'react'
import { useAuth } from '@/features/auth/auth-provider'
import { Pencil } from 'lucide-react'
import { AdminEditModal } from '../organisms/admin-edit-modal'
import type { MediaItemDetail } from '@/features/media/media-queries'

interface AdminEditButtonProps {
  mediaId: string
  media: MediaItemDetail
}

export function AdminEditButton({ mediaId, media }: AdminEditButtonProps) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)

  if (!user?.isAdmin) return null

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--dk-surface-glass)] px-4 py-3 shadow-[var(--dk-shadow-sm)]">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
            <Pencil className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">Admin edit</p>
            <p className="truncate text-xs text-muted-foreground">
              Propose changes to this media item's data and images
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--dk-surface-base)] px-3 py-2 text-xs font-medium text-foreground shadow-[var(--dk-shadow-sm)] transition-colors hover:bg-[var(--dk-surface-glass-hover)]"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit Media
        </button>
      </div>
      <AdminEditModal
        open={open}
        onOpenChange={setOpen}
        mediaId={mediaId}
        media={media}
      />
    </>
  )
}
