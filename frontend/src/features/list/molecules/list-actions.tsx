import { useState } from 'react'
import { Heart, Download, X, Copy, Check, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { apiClient } from '@/lib/api-client'
import { useAuth } from '@/features/auth'
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
 className="relative w-full max-w-md rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-dialog)]"
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
 className="flex-1 rounded-lg bg-[var(--dk-surface-glass)] px-3 py-2 text-xs font-mono"
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
 const { user } = useAuth()
 const [inviteUsername, setInviteUsername] = useState('')
 const [permission, setPermission] = useState('VIEW')
 const [lookupError, setLookupError] = useState<string | null>(null)
 const [isLookingUp, setIsLookingUp] = useState(false)
 const invite = useInviteCollaborator(list.id)
 const remove = useRemoveCollaborator(list.id)
 const accept = useAcceptInvitation(list.id)
 const decline = useDeclineInvitation(list.id)

 const isOwner = user?.id === list.userId
 const collaborators = list.collaborators ?? []

 // Pending invitations for the current user
 const myPending = collaborators.filter(
 (c) => c.userId === user?.id && c.status === 'pending',
 )
 // Other collaborators (accepted, or pending for other users)
 const others = collaborators.filter(
 (c) => !(c.userId === user?.id && c.status === 'pending'),
 )

 const handleInvite = async () => {
 const username = inviteUsername.trim()
 if (!username) return
 setLookupError(null)
 setIsLookingUp(true)
 try {
 const { data } = await apiClient.get<{ id: string; username: string }>(
 '/users/' + encodeURIComponent(username),
 )
 invite.mutate(
 { userId: data.id, permission },
 {
 onSuccess: () => setInviteUsername(''),
 onError: () => setLookupError('Failed to send invitation.'),
 },
 )
 } catch {
 setLookupError('User not found.')
 } finally {
 setIsLookingUp(false)
 }
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
 className="relative w-full max-w-md rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-dialog)]"
 >
 <button
 onClick={onClose}
 className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--dk-surface-glass)] ring-1 ring-white/[0.06] hover:bg-[var(--dk-surface-glass-hover)]"
 >
 <X className="h-4 w-4" />
 </button>

 <h3 className="text-lg font-semibold mb-4">Collaborators</h3>

 {/* My pending invitations */}
 {myPending.length > 0 && (
 <div className="space-y-2 mb-4">
 <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
 Your Invitations
 </label>
 {myPending.map((c) => (
 <div
 key={c.id}
 className="flex items-center justify-between rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2"
 >
 <div className="flex items-center gap-2">
 <span className="text-sm font-medium">{list.name}</span>
 <span className="text-[10px] text-amber-400">
 {c.permission} · pending
 </span>
 </div>
 <div className="flex gap-1.5">
 <button
 onClick={() => accept.mutate()}
 disabled={accept.isPending}
 className="rounded-lg bg-emerald-500/20 px-2.5 py-1 text-[11px] font-medium text-emerald-400 hover:bg-emerald-500/30 transition-colors"
 >
 Accept
 </button>
 <button
 onClick={() => decline.mutate()}
 disabled={decline.isPending}
 className="rounded-lg bg-red-500/20 px-2.5 py-1 text-[11px] font-medium text-red-400 hover:bg-red-500/30 transition-colors"
 >
 Decline
 </button>
 </div>
 </div>
 ))}
 </div>
 )}

 {/* Collaborator list */}
 {others.length > 0 ? (
 <div className="space-y-2 mb-4">
 {myPending.length > 0 && (
 <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
 Collaborators
 </label>
 )}
 {others.map((c) => (
 <div
 key={c.id}
 className="flex items-center justify-between rounded-lg bg-[var(--dk-surface-glass)] px-3 py-2"
 >
 <div className="flex items-center gap-2">
 <span className="text-sm font-medium">
 {c.user?.username || c.userId}
 </span>
 <span className="text-[10px] text-muted-foreground">
 {c.permission}
 {c.status === 'pending' && ' · pending'}
 </span>
 </div>
 {isOwner && (
 <button
 onClick={() => remove.mutate(c.userId)}
 className="text-xs text-muted-foreground hover:text-destructive transition-colors"
 >
 Remove
 </button>
 )}
 </div>
 ))}
 </div>
 ) : (
 myPending.length === 0 && (
 <p className="text-xs text-muted-foreground mb-4">
 No collaborators yet.
 </p>
 )
 )}

 {/* Invite (owner only) */}
 {isOwner && (
 <div className="space-y-2">
 <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
 Invite
 </label>
 <div className="flex gap-2">
 <input
 value={inviteUsername}
 onChange={(e) => {
 setInviteUsername(e.target.value)
 setLookupError(null)
 }}
 placeholder="Username to invite..."
 className="flex-1 rounded-lg bg-[var(--dk-surface-glass)] px-3 py-2 text-xs"
 onKeyDown={(e) => {
 if (e.key === 'Enter') handleInvite()
 }}
 />
 <select
 value={permission}
 onChange={(e) => setPermission(e.target.value)}
 className="rounded-lg bg-[var(--dk-surface-glass)] px-2 py-2 text-xs"
 >
 <option value="VIEW">View</option>
 <option value="EDIT">Edit</option>
 <option value="ADMIN">Admin</option>
 </select>
 <button
 onClick={handleInvite}
 disabled={invite.isPending || isLookingUp || !inviteUsername.trim()}
 className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
 >
 {isLookingUp ? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ) : invite.isPending ? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ) : null}
 Invite
 </button>
 </div>
 {lookupError && (
 <p className="text-[11px] text-red-400">{lookupError}</p>
 )}
 </div>
 )}
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
 #{entry.oldSortOrder + 1} â†’ #{entry.newSortOrder + 1}
 </span>
 </div>
 ))}
 </div>
 </div>
 )
}
