import { useState, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-provider'
import { useToast } from '@/features/dk-ui/molecules/toast'
import { apiClient, API_BASE_URL } from '@/lib/api-client'
import { mediaKeys } from '@/features/media/media-keys'
import { AdminEditModal } from '../organisms/admin-edit-modal'
import { cn } from '@/lib/utils'
import { Shield, Pencil, RefreshCw, ChevronDown, X } from 'lucide-react'
import type { MediaItemDetail } from '@/features/media/media-queries'

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
      const { data } = await apiClient.post<{ taskId: string }>(`/media/${mediaId}/rehydrate`)
      const token = localStorage.getItem('otix-access-token')
      const response = await fetch(`${API_BASE_URL}/media/${mediaId}/rehydrate/${data.taskId}/stream`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`SSE failed: ${response.status}`)

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No reader')
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const frames = buffer.split('\n\n')
        buffer = frames.pop() || ''
        for (const frame of frames) {
          for (const line of frame.split('\n')) {
            if (!line.startsWith('data: ')) continue
            const event = JSON.parse(line.slice(6))
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
                return
              case 'error':
                setRehydrateLog((prev) => [...prev, `Error: ${event.message}`])
                throw new Error(event.message || 'Hydration failed')
            }
          }
        }
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
      <div className="flex flex-col items-center">
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className={cn(
              'group relative flex h-16 w-20 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl bg-amber-500/15 px-3 py-3 transition-all duration-150',
              'hover:bg-amber-500/25',
            )}
          >
            <Shield className="relative h-5 w-5 text-amber-400" />
            <span className="relative flex items-center gap-0.5 text-[11px] font-medium text-amber-300/80">
              Admin
              <ChevronDown className={cn('h-3 w-3 transition-transform', menuOpen && 'rotate-180')} />
            </span>
          </button>

          {menuOpen && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 rounded-2xl bg-[var(--dk-surface-base)] p-1.5 shadow-[var(--dk-shadow-dialog)] z-[var(--dk-z-modal)]">
              <button
                type="button"
                onClick={() => { setEditOpen(true); setMenuOpen(false) }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-foreground hover:bg-[var(--dk-surface-base)] transition-colors"
              >
                <Pencil className="h-4 w-4 text-amber-400" />
                Edit Media
              </button>
              <button
                type="button"
                onClick={() => { startRehydrate(); setMenuOpen(false) }}
                disabled={rehydrating}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-foreground hover:bg-[var(--dk-surface-base)] transition-colors disabled:opacity-50"
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
        <div className="fixed bottom-4 right-4 w-72 rounded-xl bg-[var(--dk-surface-base)] p-3 shadow-[var(--dk-shadow-dialog)] z-[var(--dk-z-modal)]">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Rehydration Log</p>
            <button
              type="button"
              onClick={() => setRehydrateLog([])}
              className="rounded-lg p-0.5 text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="max-h-40 space-y-0.5 overflow-y-auto">
            {rehydrateLog.map((entry, i) => (
              <p key={i} className="text-xs text-muted-foreground font-mono">
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
