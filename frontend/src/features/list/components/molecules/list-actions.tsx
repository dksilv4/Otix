import { useState, useEffect, useTransition } from 'react'
import { Heart, Download, X, Copy, Check, Loader2, Globe, Lock, Share2, Send, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiClient } from '@/lib/api/client'
import { useAuth } from '@auth/hooks/use-auth'
import {
  useLikeList,
  useUnlikeList,
  useInviteCollaborator,
  useRemoveCollaborator,
  useAcceptInvitation,
  useDeclineInvitation,
  useRankHistory,
  useUpdateList,
  getExportUrl,
  type UserListOut,
  type UserListDetailOut,
} from '../../list-queries'

// ── Like Button ───────────────────────────────────────────────────

export const ListLikeButton = ({ list }: { list: UserListDetailOut }) => {
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
          : 'bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground'
      )}
    >
      <Heart className={cn('h-4 w-4', isLiked && 'fill-current')} />
      {count > 0 && <span className="tabular-nums">{count}</span>}
    </button>
  )
};

// ── Share / Export Modal ──────────────────────────────────────────

interface ShareModalProps {
  list: UserListOut | UserListDetailOut
  onClose?: () => void
  isExiting?: boolean
}

export const ShareModal = ({ list, onClose, isExiting }: ShareModalProps) => {
  const { user } = useAuth()
  const updateList = useUpdateList()
  const [copied, setCopied] = useState(false)
  const [isPublic, setIsPublic] = useState(list.isPublic)
  const [isTogglingVisibility, startTransition] = useTransition()
  const [toggleError, setToggleError] = useState<string | null>(null)
  const shareUrl = `${window.location.origin}/library/${list.id}`
  const [animateIn, setAnimateIn] = useState(false)

  const isOwner = user?.id === list.userId
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setAnimateIn(true)))
  }, [])

  useEffect(() => {
    setIsPublic(list.isPublic)
  }, [list.isPublic])

  const visible = animateIn && !isExiting

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleNativeShare = async () => {
    if (!navigator.share) return
    try {
      await navigator.share({
        title: `${list.name} - Otix`,
        text: list.description || `Check out "${list.name}" on Otix`,
        url: shareUrl,
      })
    } catch (err: unknown) {
      if ((err as { name?: string })?.name !== 'AbortError') {
        // user didn't just cancel
      }
    }
  }

  const handleToggleVisibility = () => {
    if (!isOwner || isTogglingVisibility) return
    const nextPublic = !isPublic
    setIsPublic(nextPublic)
    setToggleError(null)

    startTransition(async () => {
      try {
        await updateList.mutateAsync({ listId: list.id, isPublic: nextPublic })
      } catch (err: unknown) {
        setIsPublic(!nextPublic)
        const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        setToggleError(detail || 'Failed to update visibility')
      }
    })
  }

  const items = 'items' in list && Array.isArray(list.items) ? list.items : []
  const previewPosters = items
    .map((i) => i.posterUrl || i.textlessPosterUrl)
    .filter(Boolean)
    .slice(0, 4) as string[]

  const curatorName = list.user?.username ? `@${list.user.username}` : null
  const itemCount = list.itemCount ?? items.length

  return (
    <div
      className={cn(
        'fixed inset-0 z-[var(--dk-z-modal)] flex items-center justify-center p-4 transition-opacity duration-200',
        visible ? 'opacity-100' : 'opacity-0',
      )}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          'relative w-full max-w-md overflow-hidden rounded-3xl bg-[var(--dk-surface-base)] border border-white/10 shadow-[var(--dk-shadow-dialog)] transition-all duration-200 ease-out flex flex-col p-6 space-y-5',
          visible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Share2 className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Share List</h3>
              <p className="text-xs text-muted-foreground">Share with friends or export</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 transition-all text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* List preview card */}
        <div className="rounded-2xl border border-white/10 bg-[var(--dk-surface-glass)] p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h4 className="font-semibold text-foreground text-sm truncate">{list.name}</h4>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                {curatorName && <span>Curated by {curatorName}</span>}
                {curatorName && <span>•</span>}
                <span>{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
              </div>
            </div>
            <span
              className={cn(
                'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border shrink-0',
                isPublic
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20',
              )}
            >
              {isPublic ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
              {isPublic ? 'Public' : 'Private'}
            </span>
          </div>

          {previewPosters.length > 0 && (
            <div className="flex items-center gap-2 pt-1">
              {previewPosters.map((url, idx) => (
                <div
                  key={idx}
                  className="relative aspect-[2/3] w-12 rounded-lg overflow-hidden border border-white/10 bg-black/40 shadow-sm"
                >
                  <img src={url} alt="" className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Owner visibility toggle */}
        {isOwner && (
          <div className="flex items-center justify-between p-3.5 rounded-2xl border border-white/10 bg-[var(--dk-surface-glass)]">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors',
                  isPublic ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400',
                )}
              >
                {isPublic ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">
                  {isPublic ? 'Public list' : 'Private list'}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {isPublic
                    ? 'Anyone with the link can view'
                    : 'Only you and collaborators can view'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggleVisibility}
              disabled={isTogglingVisibility}
              className={cn(
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50',
                isPublic ? 'bg-primary' : 'bg-white/15',
              )}
              aria-label={isPublic ? 'Make list private' : 'Make list public'}
            >
              <span
                className={cn(
                  'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md transform ring-0 transition duration-200 ease-in-out',
                  isPublic ? 'translate-x-5' : 'translate-x-0',
                )}
              />
            </button>
          </div>
        )}

        {toggleError && (
          <p className="text-xs text-rose-400 px-1">{toggleError}</p>
        )}

        {!isPublic && !isOwner && (
          <div className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/10 text-xs text-amber-300">
            This list is private. Only accepted collaborators can access it.
          </div>
        )}

        {/* Native share button if supported */}
        {canNativeShare && (
          <button
            type="button"
            onClick={handleNativeShare}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-sm transition-all hover:opacity-90 active:scale-[0.99] shadow-md shadow-primary/20"
          >
            <Send className="h-4 w-4" />
            Share via Apps...
          </button>
        )}

        {/* Copy link */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Shareable Link
          </label>
          <div className="flex bg-[var(--dk-surface-glass)] rounded-xl border border-white/10 overflow-hidden">
            <input
              readOnly
              value={shareUrl}
              className="flex-1 bg-transparent px-3 py-2.5 text-xs text-foreground font-mono outline-none"
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-4 bg-white/5 hover:bg-white/10 text-foreground text-xs font-semibold transition-colors shrink-0"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Social share */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Share to Social
          </label>
          <div className="grid grid-cols-2 gap-2">
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out "${list.name}" on Otix`)}&url=${encodeURIComponent(shareUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-white/10 bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-ghost-hover)] text-foreground text-xs font-semibold transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              Twitter / X
            </a>
            <a
              href={`https://bsky.app/intent/compose?text=${encodeURIComponent(`Check out "${list.name}" on Otix ${shareUrl}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-white/10 bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-ghost-hover)] text-foreground text-xs font-semibold transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              Bluesky
            </a>
            <a
              href={`https://reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(`Check out "${list.name}" on Otix`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-white/10 bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-ghost-hover)] text-foreground text-xs font-semibold transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              Reddit
            </a>
            <a
              href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`${list.name} on Otix: ${shareUrl}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-white/10 bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-ghost-hover)] text-foreground text-xs font-semibold transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              WhatsApp
            </a>
          </div>
        </div>

        {/* Export options */}
        <div className="space-y-2 pt-1 border-t border-white/[0.08]">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Export Data
          </label>
          <div className="grid grid-cols-2 gap-2">
            <a
              href={getExportUrl(list.id, 'json')}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 py-2 rounded-xl border border-white/10 bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-ghost-hover)] text-foreground text-xs font-semibold transition-colors"
            >
              <Download className="h-3.5 w-3.5 text-muted-foreground" /> JSON
            </a>
            <a
              href={getExportUrl(list.id, 'csv')}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 py-2 rounded-xl border border-white/10 bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-ghost-hover)] text-foreground text-xs font-semibold transition-colors"
            >
              <Download className="h-3.5 w-3.5 text-muted-foreground" /> CSV
            </a>
          </div>
        </div>
      </div>
    </div>
  )
};

// ── Collaborators Modal ───────────────────────────────────────────

interface CollaboratorsModalProps {
  list: UserListDetailOut
  onClose?: () => void
  isExiting?: boolean
}

export const CollaboratorsModal = ({ list, onClose, isExiting }: CollaboratorsModalProps) => {
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
  const collaborators = Array.isArray(list.collaborators) ? list.collaborators.filter(Boolean) : []

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
};

// ── Rank History Timeline ─────────────────────────────────────────

export const RankHistoryTimeline = ({ listId }: { listId: string }) => {
  const { data: history, isLoading } = useRankHistory(listId)

  const historyList = Array.isArray(history) ? history.filter(Boolean) : []

  if (isLoading) return <div className="text-sm text-white/50 py-4">Loading history...</div>
  if (historyList.length === 0) {
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
        {historyList.map((entry) => (
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
};
