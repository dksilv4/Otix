import { useState, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/lib/providers/auth'
import { useModal } from '@/lib/modals'
import { useToast } from '@ui/molecules/toast'
import { apiClient } from '@/lib/api/client'
import { mediaKeys } from '@media/queries/media-keys'
import { useMirroring } from '@/features/media/hooks/use-media-admin-settings'
import { MediaManageModal } from '@/features/media/components/organisms/media-manage-modal'
import { cn, formatBytes } from '@/lib/utils'
import { Shield, Pencil, Download, ChevronDown } from 'lucide-react'
import type { MediaItemDetail } from '@media/queries/media-queries'
import './admin-actions-menu.scss'

interface DownloadAssetsResult {
  mediaItemId: string
  title: string
  downloaded: number
  bytes: number
  types: string[]
}

interface Props {
  mediaId: string
  media: MediaItemDetail
  variant?: 'default' | 'pill' | 'icon'
}

export function AdminActionsMenu({ mediaId, media, variant = 'default' }: Props) {
  const { user } = useAuth()
  const { openModal } = useModal()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const mirroring = useMirroring(Boolean(user?.isAdmin))
  const [menuOpen, setMenuOpen] = useState(false)
  const [downloadingImages, setDownloadingImages] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  if (!user?.isAdmin) return null

  const isPill = variant === 'pill'
  const isIcon = variant === 'icon'

  const refreshMedia = () => {
    queryClient.invalidateQueries({ queryKey: mediaKeys.detail(media.mediaType, mediaId) })
  }

  const downloadImages = async () => {
    if (mirroring.isSuccess && !mirroring.data?.enabled) {
      toast({
        title: 'Mirroring is paused',
        description: 'Turn on “Download artwork to this server” in Settings → Storage to download images again.',
        variant: 'info',
      })
      return
    }
    setDownloadingImages(true)
    const effectiveId = media.id ? String(media.id) : mediaId
    try {
      const { data } = await apiClient.post<DownloadAssetsResult>(`/media/admin/media-items/${effectiveId}/download-assets`)
      if (data.downloaded > 0) {
        toast({
          title: 'Images downloaded',
          description: `${data.downloaded} image${data.downloaded === 1 ? '' : 's'} · ${formatBytes(data.bytes)}`,
          variant: 'success',
        })
      } else {
        toast({
          title: 'Nothing to download',
          description: 'No remote artwork available for this title.',
          variant: 'info',
        })
      }
      refreshMedia()
      queryClient.removeQueries({ queryKey: ['media'] })
      queryClient.removeQueries({ queryKey: ['discover'] })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast({ title: 'Download failed', description: msg, variant: 'error' })
    } finally {
      setDownloadingImages(false)
    }
  }

  return (
    <div className={isPill || isIcon ? 'relative' : 'dk-admin-actions'}>
      <div ref={menuRef} className={isPill || isIcon ? 'relative' : 'dk-admin-actions__menu'}>
        {isIcon ? (
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-amber-400 hover:bg-amber-400/15 transition-all hover:scale-110 active:scale-95"
            title="Admin actions"
            aria-label="Admin actions"
          >
            <Shield className="h-4 w-4" />
          </button>
        ) : isPill ? (
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs sm:text-sm font-medium bg-white/[0.08] hover:bg-white/[0.14] text-white/90 border border-white/10 shadow-md backdrop-blur-md transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Shield className="h-4 w-4 text-amber-400" />
            <span className="text-amber-300">Admin</span>
            <ChevronDown className={cn('h-3 w-3 text-amber-300/70 transition-transform', menuOpen && 'rotate-180')} />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="dk-admin-actions__trigger glass-inset"
          >
            <Shield className="relative h-5 w-5 text-amber-400" />
            <span className="dk-admin-actions__label">
              Admin
              <ChevronDown className={cn('h-3 w-3 transition-transform', menuOpen && 'rotate-180')} />
            </span>
          </button>
        )}

        {menuOpen && (
          <div className={variant === 'pill' ? 'absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 rounded-xl p-1.5 bg-card border border-border/40 shadow-xl z-50 space-y-0.5' : 'dk-admin-actions__dropdown'}>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                const close = openModal(
                  <MediaManageModal
                    mediaType={media.mediaType}
                    mediaId={media.id ? String(media.id) : mediaId}
                    onClose={() => close()}
                  />
                )
              }}
              className="dk-admin-actions__dropdown-item"
            >
              <Pencil className="h-4 w-4 text-amber-400" />
              Manage Media
            </button>
            <button
              type="button"
              onClick={() => {
                downloadImages()
                setMenuOpen(false)
              }}
              disabled={downloadingImages}
              title={
                mirroring.isSuccess && !mirroring.data?.enabled
                  ? 'Mirroring is paused — enable it in Settings → Storage'
                  : undefined
              }
              className={cn(
                'dk-admin-actions__dropdown-item',
                mirroring.isSuccess && !mirroring.data?.enabled && 'opacity-50',
              )}
            >
              <Download className={cn('h-4 w-4 text-muted-foreground', downloadingImages && 'animate-pulse')} />
              {downloadingImages
                ? 'Downloading...'
                : mirroring.isSuccess && !mirroring.data?.enabled
                  ? 'Download paused'
                  : 'Download Images'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

