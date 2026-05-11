import { useState } from 'react'
import { Heart, Download, X, Copy, Check } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth'
import {
  useLikeList,
  useUnlikeList,
  useInviteCollaborator,
  useRemoveCollaborator,
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
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all',
        'bg-[var(--dk-surface-glass)] ring-1 ring-white/[0.04] hover:bg-[var(--dk-surface-glass-hover)]',
        isLiked && 'text-red-400',
        !isLiked && 'text-muted-foreground',
      )}
    >
      <Heart className={cn('h-3.5 w-3.5', isLiked && 'fill-current')} />
      {count > 0 && <span className="tabular-nums">{count}</span>}
    </button>
  )
}

// ── Share / Export Modal ──────────────────────────────────────────

interface ShareModalProps {
  list: UserListDetailOut
  open: boolean
  onClose: () => void
}

export function ShareModal({ list, open, onClose }: ShareModalProps) {
  const [copied, setCopied] = useState(false)
  const shareUrl = `${window.location.origin}/list/${list.id}`

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!open) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-background/80 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          className="relative w-full max-w-md rounded-2xl border border-white/[0.08] bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-dialog)]"
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--dk-surface-glass)] ring-1 ring-white/[0.06] hover:bg-[var(--dk-surface-glass-hover)]"
          >
            <X className="h-4 w-4" />
          </button>

          <h3 className="text-lg font-semibold mb-4">Share List</h3>

          {/* Copy link */}
          <div className="space-y-3">
            <label className="text-xs font-medium text-muted-foreground">Link</label>
            <div className="flex gap-2">
              <input
                readOnly
                value={shareUrl}
                className="flex-1 rounded-lg border border-white/[0.06] bg-[var(--dk-surface-glass)] px-3 py-2 text-xs font-mono"
                onFocus={(e) => e.target.select()}
              />
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 rounded-lg bg-[var(--dk-surface-glass)] px-3 py-2 text-xs font-medium hover:bg-[var(--dk-surface-glass-hover)] transition-colors"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Export options */}
          <div className="mt-5 space-y-3">
            <label className="text-xs font-medium text-muted-foreground">Export</label>
            <div className="flex gap-2">
              <a
                href={getExportUrl(list.id, 'json')}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg bg-[var(--dk-surface-glass)] px-4 py-2 text-xs font-medium hover:bg-[var(--dk-surface-glass-hover)] transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                JSON
              </a>
              <a
                href={getExportUrl(list.id, 'csv')}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg bg-[var(--dk-surface-glass)] px-4 py-2 text-xs font-medium hover:bg-[var(--dk-surface-glass-hover)] transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                CSV
              </a>
            </div>
          </div>

          {/* Social share */}
          <div className="mt-5 space-y-3">
            <label className="text-xs font-medium text-muted-foreground">Share via</label>
            <div className="flex gap-2">
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out "${list.name}" on Otix`)}&url=${encodeURIComponent(shareUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-[#1d9bf0]/15 px-4 py-2 text-xs font-medium hover:bg-[#1d9bf0]/25 transition-colors"
              >
                Twitter/X
              </a>
              <a
                href={`https://bsky.app/intent/compose?text=${encodeURIComponent(`Check out "${list.name}" on Otix ${shareUrl}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-[#1185fe]/15 px-4 py-2 text-xs font-medium hover:bg-[#1185fe]/25 transition-colors"
              >
                Bluesky
              </a>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

// ── Collaborators Modal ───────────────────────────────────────────

interface CollaboratorsModalProps {
  list: UserListDetailOut
  open: boolean
  onClose: () => void
}

export function CollaboratorsModal({ list, open, onClose }: CollaboratorsModalProps) {
  const [inviteUserId, setInviteUserId] = useState('')
  const [permission, setPermission] = useState('VIEW')
  const invite = useInviteCollaborator(list.id)
  const remove = useRemoveCollaborator(list.id)

  if (!open) return null

  const handleInvite = () => {
    if (!inviteUserId.trim()) return
    invite.mutate({ userId: inviteUserId.trim(), permission })
    setInviteUserId('')
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-background/80 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          className="relative w-full max-w-md rounded-2xl border border-white/[0.08] bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-dialog)]"
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--dk-surface-glass)] ring-1 ring-white/[0.06] hover:bg-[var(--dk-surface-glass-hover)]"
          >
            <X className="h-4 w-4" />
          </button>

          <h3 className="text-lg font-semibold mb-4">Collaborators</h3>

          {/* Current collaborators */}
          {list.collaborators && list.collaborators.length > 0 ? (
            <div className="space-y-2 mb-4">
              {list.collaborators.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg bg-[var(--dk-surface-glass)] px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {c.user?.username || c.userId}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {c.permission} · {c.status}
                    </span>
                  </div>
                  <button
                    onClick={() => remove.mutate(c.userId)}
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mb-4">No collaborators yet.</p>
          )}

          {/* Invite */}
          <div className="flex gap-2">
            <input
              value={inviteUserId}
              onChange={(e) => setInviteUserId(e.target.value)}
              placeholder="User ID to invite..."
              className="flex-1 rounded-lg border border-white/[0.06] bg-[var(--dk-surface-glass)] px-3 py-2 text-xs"
            />
            <select
              value={permission}
              onChange={(e) => setPermission(e.target.value)}
              className="rounded-lg border border-white/[0.06] bg-[var(--dk-surface-glass)] px-2 py-2 text-xs"
            >
              <option value="VIEW">View</option>
              <option value="EDIT">Edit</option>
              <option value="ADMIN">Admin</option>
            </select>
            <button
              onClick={handleInvite}
              disabled={invite.isPending}
              className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Invite
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

// ── Rank History Timeline ─────────────────────────────────────────

export function RankHistoryTimeline({ listId }: { listId: string }) {
  const { data: history, isLoading } = useRankHistory(listId)

  if (isLoading) return <div className="text-xs text-muted-foreground py-4">Loading history...</div>
  if (!history || history.length === 0) {
    return (
      <div className="text-xs text-muted-foreground py-4">
        No ranking changes yet. Reorder items to see history.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">Rank Changes</h4>
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {history.map((entry) => (
          <div
            key={entry.id}
            className="flex items-center gap-3 rounded-lg bg-[var(--dk-surface-glass)] px-3 py-2 text-xs"
          >
            <span className="shrink-0 text-muted-foreground tabular-nums w-16">
              {new Date(entry.changedAt).toLocaleDateString()}
            </span>
            {entry.mediaItem ? (
              <span className="font-medium truncate flex-1">{entry.mediaItem.title}</span>
            ) : (
              <span className="text-muted-foreground flex-1">Unknown item</span>
            )}
            <span className="shrink-0 tabular-nums text-muted-foreground">
              #{entry.oldSortOrder + 1} → #{entry.newSortOrder + 1}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
