import { useState, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-provider'
import { useToast } from '@/features/dk-ui/molecules/toast'
import { connectTaskSseStream } from '@/lib/sse-client'
import { mediaKeys } from '@/features/media/media-keys'
import { AdminEditModal } from '../organisms/admin-edit-modal'
import { cn } from '@/lib/utils'
import { Shield, Pencil, RefreshCw, ChevronDown, X } from 'lucide-react'
import type { MediaItemDetail } from '@/features/media/media-queries'
import './admin-actions-menu.scss'

interface Props {
  mediaId: string
  media: MediaItemDetail
}

export function AdminActionsMenu({ mediaId, media }: Props) {
  const { user } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [menuOpen, setMenuOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
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
    queryClient.invalidateQueries({ queryKey: mediaKeys.detail(mediaId) })
  }

  const startRehydrate = async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setRehydrating(true)
    setRehydratePhase('Queueing...')
    setRehydrateLog(['Queueing rehydration task...'])

    try {
      const token = localStorage.getItem('otix-access-token') ?? ''
      const terminal = await connectTaskSseStream(
        {
          createEndpoint: `/media/${mediaId}/rehydrate`,
          streamEndpoint: (taskId: string) => `/media/${mediaId}/rehydrate/${taskId}/stream`,
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
            className="dk-admin-actions__trigger"
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
                onClick={() => { setEditOpen(true); setMenuOpen(false) }}
                className="dk-admin-actions__dropdown-item"
              >
                <Pencil className="h-4 w-4 text-amber-400" />
                Edit Media
              </button>
              <button
                type="button"
                onClick={() => { startRehydrate(); setMenuOpen(false) }}
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
            <button
              type="button"
              onClick={() => setRehydrateLog([])}
              className="dk-admin-actions__log-close"
            >
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

      <AdminEditModal
        open={editOpen}
        onOpenChange={setEditOpen}
        mediaId={mediaId}
        media={media}
      />
    </>
  )
}
