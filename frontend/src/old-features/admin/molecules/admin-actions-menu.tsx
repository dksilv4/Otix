import { useState, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/lib/providers/auth'
import { useToast } from '@/old-features/ui/molecules/toast'
import { apiClient } from '@/lib/api/client'
import { connectTaskSseStream } from '@/lib/api/sse-client'
import { mediaKeys } from '@media/queries/media-keys'
import { useMirroring } from '@/features/media/hooks/use-media-admin-settings'
import { AdminEditModal } from '../organisms/admin-edit-modal'
import { cn, formatBytes } from '@/lib/utils'
import { useModal } from '@/lib/modals'
import { Shield, Pencil, Download, RefreshCw, ChevronDown, X } from 'lucide-react'
import type { MediaItemDetail } from '@media/queries/media-queries'
import './admin-actions-menu.scss'
import { ACCESS_TOKEN_KEY } from '@/lib/config'

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
}

export function AdminActionsMenu({ mediaId, media }: Props) {
  const { user } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { openModal } = useModal()
  const mirroring = useMirroring(Boolean(user?.isAdmin))
  const [menuOpen, setMenuOpen] = useState(false)
  const [downloadingImages, setDownloadingImages] = useState(false)
  const [rehydrating, setRehydrating] = useState(false)
  const [rehydratePhase, setRehydratePhase] = useState<string | null>(null)
  const [rehydrateLog, setRehydrateLog] = useState<string[]>([])
  const menuRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

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

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  if (!user?.isAdmin) return null

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
    try {
      const { data } = await apiClient.post<DownloadAssetsResult>(`/media/admin/media-items/${mediaId}/download-assets`)
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

  const startRehydrate = async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setRehydrating(true)
    setRehydratePhase('Queueing...')
    setRehydrateLog(['Queueing rehydration task...'])

    try {
      const token = localStorage.getItem(ACCESS_TOKEN_KEY) ?? ''
      const terminal = await connectTaskSseStream(
        {
          createEndpoint: `/media/${media.mediaType}/${mediaId}/rehydrate`,
          streamEndpoint: (taskId: string) => `/media/${media.mediaType}/${mediaId}/rehydrate/${taskId}/stream`,
          terminalEvents: ['rehydrate_complete', 'error'],
          token,
          signal: controller.signal,
        },
        (event) => {
          switch (event.type) {
            case 'provider_started':
              setRehydratePhase(`Running ${event.label}`)
              setRehydrateLog((prev) => [...prev, `Started: ${event.label}`])
              break
            case 'provider_complete':
              refreshMedia()
              setRehydrateLog((prev) => [...prev, `Completed: ${event.label}`])
              break
            case 'rehydrate_complete':
              refreshMedia()
              setRehydratePhase(null)
              setRehydrating(false)
              setRehydrateLog((prev) => [...prev, 'Rehydration complete'])
              toast({ title: 'Media rehydrated', variant: 'success' })
              break
            case 'error':
              setRehydrateLog((prev) => [...prev, `Error: ${event.message}`])
              break
          }
        },
      )

      if (terminal.type === 'error') {
        throw new Error((terminal.message as string) || 'Hydration failed')
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      const msg = String(err)
      setRehydrateLog((prev) => [...prev, `Failed: ${msg}`])
      toast({ title: 'Rehydrate failed', description: msg, variant: 'error' })
    } finally {
      setRehydrating(false)
      setRehydratePhase(null)
    }
  }

  return (
    <>
      <div className="dk-admin-actions">
        <div ref={menuRef} className="dk-admin-actions__menu">
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

          {menuOpen && (
            <div className="dk-admin-actions__dropdown">
              <button
                type="button"
                onClick={() => {
                  const close = openModal(<AdminEditModal mediaId={mediaId} media={media} onClose={() => close()} />)
                  setMenuOpen(false)
                }}
                className="dk-admin-actions__dropdown-item"
              >
                <Pencil className="h-4 w-4 text-amber-400" />
                Edit Media
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
              <button
                type="button"
                onClick={() => {
                  startRehydrate()
                  setMenuOpen(false)
                }}
                disabled={rehydrating}
                className="dk-admin-actions__dropdown-item"
              >
                <RefreshCw className={cn('h-4 w-4 text-muted-foreground', rehydrating && 'animate-spin')} />
                {rehydrating ? (rehydratePhase ?? 'Hydrating...') : 'Force Rehydrate'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* SSE rehydration log — fixed bottom-right corner */}
      {rehydrateLog.length > 0 && (
        <div className="dk-admin-actions__log">
          <div className="dk-admin-actions__log-header">
            <p className="dk-admin-actions__log-title">Rehydration Log</p>
            <button type="button" onClick={() => setRehydrateLog([])} className="dk-admin-actions__log-close">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="dk-admin-actions__log-entries">
            {rehydrateLog.map((entry, i) => (
              <p key={i} className="dk-admin-actions__log-entry">
                {entry}
              </p>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
