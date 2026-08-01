import { useState, useEffect } from 'react'
import { Heart, Download, X, Copy, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiClient } from '@/lib/api/client'
import { useAuth } from '@/old-features/auth'
import {
  useLikeList,
  useUnlikeList,
  useInviteCollaborator,
  useRemoveCollaborator,
  useAcceptInvitation,
  useDeclineInvitation,
  useRankHistory,
  getExportUrl,
  type UserListDetailOut,
} from '../list-queries'

// ── Like Button ───────────────────────────────────────────────────

export function ListLikeButton({ list }: { list: UserListDetailOut }) {
  const { isAuthenticated } = useAuth()
  const like = useLikeList(list.id)
  const unlike = useUnlikeList(list.id)

  if (!isAuthenticated) return null

  const isLiked = list.isLiked
  const count = list.likeCount

  return (
    <button
      type="button"
      onClick={() => (isLiked ? unlike.mutate() : like.mutate())}
      className={cn(
        'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all active:scale-95',
        isLiked 
          ? 'bg-rose-500/10 text-rose-500 hover:bg-rose-500/20' 
          : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
      )}
    >
      <Heart className={cn('h-4 w-4', isLiked && 'fill-current')} />
      {count > 0 && <span className="tabular-nums">{count}</span>}
    </button>
  )
}

// ── Share / Export Modal ──────────────────────────────────────────

interface ShareModalProps {
  list: UserListDetailOut
  onClose?: () => void
  isExiting?: boolean
}

export function ShareModal({ list, onClose, isExiting }: ShareModalProps) {
  const [copied, setCopied] = useState(false)
  const shareUrl = `${window.location.origin}/library/${list.id}`
  const [animateIn, setAnimateIn] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setAnimateIn(true)))
  }, [])

  const visible = animateIn && !isExiting

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={cn("fixed inset-0 z-[var(--dk-z-modal)] flex items-center justify-center p-4 transition-opacity duration-200", visible ? "opacity-100" : "opacity-0")}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={cn("relative w-full max-w-sm overflow-hidden rounded-3xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-dialog)] transition-all duration-200 ease-out flex flex-col p-6 space-y-6", visible ? "scale-100 translate-y-0" : "scale-95 translate-y-4")}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">Share List</h3>
          <button onClick={onClose} className="rounded-xl p-1.5 transition-all text-white/50 hover:bg-white/5 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Copy link */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-white/50 uppercase tracking-wider">Link</label>
          <div className="flex bg-white/5 rounded-xl border border-white/10 overflow-hidden">
            <input
              readOnly
              value={shareUrl}
              className="flex-1 bg-transparent px-3 py-2.5 text-sm text-white/80 font-mono outline-none"
              onFocus={(e) => e.target.select()}
            />
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-4 bg-white/5 hover:bg-white/10 text-white/80 text-sm font-semibold transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Export options */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-white/50 uppercase tracking-wider">Export</label>
          <div className="grid grid-cols-2 gap-2">
            <a href={getExportUrl(list.id, 'json')} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 text-sm font-semibold transition-colors">
              <Download className="h-3.5 w-3.5" /> JSON
            </a>
            <a href={getExportUrl(list.id, 'csv')} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 text-sm font-semibold transition-colors">
              <Download className="h-3.5 w-3.5" /> CSV
            </a>
          </div>
        </div>

        {/* Social share */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-white/50 uppercase tracking-wider">Share via</label>
          <div className="grid grid-cols-2 gap-2">
            <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out "${list.name}" on Otix`)}&url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center py-2 rounded-xl bg-[#1DA1F2]/10 hover:bg-[#1DA1F2]/20 text-[#1DA1F2] text-sm font-semibold transition-colors">
              Twitter/X
            </a>
            <a href={`https://bsky.app/intent/compose?text=${encodeURIComponent(`Check out "${list.name}" on Otix ${shareUrl}`)}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center py-2 rounded-xl bg-[#0085FF]/10 hover:bg-[#0085FF]/20 text-[#0085FF] text-sm font-semibold transition-colors">
              Bluesky
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Collaborators Modal ───────────────────────────────────────────

interface CollaboratorsModalProps {
  list: UserListDetailOut
  onClose?: () => void
  isExiting?: boolean
}

export function CollaboratorsModal({ list, onClose, isExiting }: CollaboratorsModalProps) {
  const { user } = useAuth()
  const [inviteUsername, setInviteUsername] = useState('')
  const [permission, setPermission] = useState('VIEW')
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [isLookingUp, setIsLookingUp] = useState(false)
  const invite = useInviteCollaborator(list.id)
  const remove = useRemoveCollaborator(list.id)
  const accept = useAcceptInvitation(list.id)
  const decline = useDeclineInvitation(list.id)

  const [animateIn, setAnimateIn] = useState(false)
  useEffect(() => { requestAnimationFrame(() => requestAnimationFrame(() => setAnimateIn(true))) }, [])
  const visible = animateIn && !isExiting

  const isOwner = user?.id === list.userId
  const collaborators = list.collaborators ?? []

  // Pending invitations for the current user
  const myPending = collaborators.filter((c) => c.userId === user?.id && c.status === 'pending')
  // Other collaborators (accepted, or pending for other users)
  const others = collaborators.filter((c) => !(c.userId === user?.id && c.status === 'pending'))

  const handleInvite = async () => {
    const username = inviteUsername.trim()
    if (!username) return
    setLookupError(null)
    setIsLookingUp(true)
    try {
      const { data } = await apiClient.get<{ id: string; username: string }>('/users/' + encodeURIComponent(username))
      invite.mutate({ userId: data.id, permission }, {
        onSuccess: () => setInviteUsername(''),
        onError: () => setLookupError('Failed to send invitation.'),
      })
    } catch {
      setLookupError('User not found.')
    } finally {
      setIsLookingUp(false)
    }
  }

  return (
    <div className={cn("fixed inset-0 z-[var(--dk-z-modal)] flex items-center justify-center p-4 transition-opacity duration-200", visible ? "opacity-100" : "opacity-0")}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={cn("relative w-full max-w-md overflow-hidden rounded-3xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-dialog)] transition-all duration-200 ease-out flex flex-col p-6 space-y-6", visible ? "scale-100 translate-y-0" : "scale-95 translate-y-4")}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">Collaborators</h3>
          <button onClick={onClose} className="rounded-xl p-1.5 transition-all text-white/50 hover:bg-white/5 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* My pending invitations */}
        {myPending.length > 0 && (
          <div className="space-y-3 bg-white/5 rounded-2xl p-4 border border-white/5">
            <label className="text-xs font-semibold text-white/50 uppercase tracking-wider">Your Invitations</label>
            {myPending.map((c) => (
              <div key={c.id} className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-white">{list.name}</span>
                  <span className="text-xs text-white/50">{c.permission} · pending</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => decline.mutate()} disabled={decline.isPending} className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 text-xs font-semibold transition-colors">
                    Decline
                  </button>
                  <button onClick={() => accept.mutate()} disabled={accept.isPending} className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-white text-xs font-semibold transition-colors">
                    Accept
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Collaborator list */}
        {others.length > 0 ? (
          <div className="space-y-3">
            <label className="text-xs font-semibold text-white/50 uppercase tracking-wider">Collaborators</label>
            <div className="space-y-2">
              {others.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03]">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-white/90">{c.user?.username || c.userId}</span>
                    <span className="text-[11px] font-medium text-white/40 uppercase tracking-wide">
                      {c.permission}
                      {c.status === 'pending' && ' · pending'}
                    </span>
                  </div>
                  {isOwner && (
                    <button onClick={() => remove.mutate(c.userId)} className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors">
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          myPending.length === 0 && (
            <p className="text-sm text-white/40 text-center py-4">No collaborators yet.</p>
          )
        )}

        {/* Invite (owner only) */}
        {isOwner && (
          <div className="space-y-3 pt-4 border-t border-white/[0.04]">
            <label className="text-xs font-semibold text-white/50 uppercase tracking-wider">Invite</label>
            <div className="flex gap-2">
              <input
                value={inviteUsername}
                onChange={(e) => { setInviteUsername(e.target.value); setLookupError(null) }}
                placeholder="Username to invite..."
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                onKeyDown={(e) => { if (e.key === 'Enter') handleInvite() }}
              />
              <select
                value={permission}
                onChange={(e) => setPermission(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white/80 focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none transition-all"
              >
                <option value="VIEW">View</option>
                <option value="EDIT">Edit</option>
                <option value="ADMIN">Admin</option>
              </select>
              <button
                onClick={handleInvite}
                disabled={invite.isPending || isLookingUp || !inviteUsername.trim()}
                className="flex items-center justify-center px-4 rounded-xl bg-primary hover:bg-primary/90 text-white font-semibold transition-all disabled:opacity-50"
              >
                {isLookingUp || invite.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Invite'}
              </button>
            </div>
            {lookupError && <p className="text-xs font-medium text-red-400">{lookupError}</p>}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Rank History Timeline ─────────────────────────────────────────

export function RankHistoryTimeline({ listId }: { listId: string }) {
  const { data: history, isLoading } = useRankHistory(listId)

  if (isLoading) return <div className="text-sm text-white/50 py-4">Loading history...</div>
  if (!history || history.length === 0) {
    return (
      <div className="text-sm text-white/50 py-4">
        No ranking changes yet. Reorder items to see history.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-white">Rank Changes</h4>
      <div className="space-y-2 border-l border-white/10 pl-4 ml-2">
        {history.map((entry) => (
          <div key={entry.id} className="relative flex flex-col gap-0.5 py-1 text-sm">
            <div className="absolute w-2 h-2 rounded-full bg-primary -left-[21px] top-2" />
            <span className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">
              {new Date(entry.changedAt).toLocaleDateString()}
            </span>
            <span className="font-medium text-white/90">
              {entry.mediaItem ? entry.mediaItem.title : 'Unknown item'}
            </span>
            <span className="text-white/50 text-xs">
              #{entry.oldSortOrder + 1} &rarr; #{entry.newSortOrder + 1}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
