import './list-actions.scss'
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
 'dk-list__like-btn',
 isLiked && 'dk-list__like-btn--active',
 !isLiked && 'dk-list__like-btn--inactive',
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
 <div className="dk-list__modal-overlay">
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 className="dk-list__modal-backdrop"
 onClick={onClose}
 />
 <motion.div
 initial={{ opacity: 0, scale: 0.95, y: 16 }}
 animate={{ opacity: 1, scale: 1, y: 0 }}
 exit={{ opacity: 0, scale: 0.95, y: 16 }}
 className="dk-list__modal-content"
 >
 <button
 onClick={onClose}
 className="dk-list__modal-close"
 >
 <X className="h-4 w-4" />
 </button>

 <h3 className="dk-list__modal-title">Share List</h3>

 {/* Copy link */}
 <div className="dk-list__modal-section">
 <label className="dk-list__modal-label">Link</label>
 <div className="dk-list__modal-input-group">
 <input
 readOnly
 value={shareUrl}
 className="dk-list__modal-input dk-list__modal-input--mono"
 onFocus={(e) => e.target.select()}
 />
 <button
 onClick={handleCopy}
 className="dk-list__share-copy-btn"
 >
 {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
 {copied ? 'Copied' : 'Copy'}
 </button>
 </div>
 </div>

 {/* Export options */}
 <div className="dk-list__modal-section dk-list__modal-section--spaced">
 <label className="dk-list__modal-label">Export</label>
 <div className="dk-list__modal-input-group">
 <a
 href={getExportUrl(list.id, 'json')}
 target="_blank"
 rel="noopener noreferrer"
 className="dk-list__share-export-btn"
 >
 <Download className="h-3.5 w-3.5" />
 JSON
 </a>
 <a
 href={getExportUrl(list.id, 'csv')}
 target="_blank"
 rel="noopener noreferrer"
 className="dk-list__share-export-btn"
 >
 <Download className="h-3.5 w-3.5" />
 CSV
 </a>
 </div>
 </div>

 {/* Social share */}
 <div className="dk-list__modal-section dk-list__modal-section--spaced">
 <label className="dk-list__modal-label">Share via</label>
 <div className="dk-list__modal-input-group">
 <a
 href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out "${list.name}" on Otix`)}&url=${encodeURIComponent(shareUrl)}`}
 target="_blank"
 rel="noopener noreferrer"
 className="dk-list__share-social-btn dk-list__share-social-btn--twitter"
 >
 Twitter/X
 </a>
 <a
 href={`https://bsky.app/intent/compose?text=${encodeURIComponent(`Check out "${list.name}" on Otix ${shareUrl}`)}`}
 target="_blank"
 rel="noopener noreferrer"
 className="dk-list__share-social-btn dk-list__share-social-btn--bluesky"
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
 <div className="dk-list__modal-overlay">
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 className="dk-list__modal-backdrop"
 onClick={onClose}
 />
 <motion.div
 initial={{ opacity: 0, scale: 0.95, y: 16 }}
 animate={{ opacity: 1, scale: 1, y: 0 }}
 exit={{ opacity: 0, scale: 0.95, y: 16 }}
 className="dk-list__modal-content"
 >
 <button
 onClick={onClose}
 className="dk-list__modal-close"
 >
 <X className="h-4 w-4" />
 </button>

 <h3 className="dk-list__modal-title">Collaborators</h3>

 {/* My pending invitations */}
 {myPending.length > 0 && (
 <div className="dk-list__collab-section dk-list__collab-section--padded">
 <label className="dk-list__modal-label--sm">
 Your Invitations
 </label>
 {myPending.map((c) => (
 <div
 key={c.id}
 className="dk-list__collab-invitation"
 >
 <div className="dk-list__collab-invitation-details">
 <span className="dk-list__collab-invitation-name">{list.name}</span>
 <span className="dk-list__collab-invitation-status">
 {c.permission} · pending
 </span>
 </div>
 <div className="dk-list__collab-actions">
 <button
 onClick={() => accept.mutate()}
 disabled={accept.isPending}
 className="dk-list__collab-accept-btn"
 >
 Accept
 </button>
 <button
 onClick={() => decline.mutate()}
 disabled={decline.isPending}
 className="dk-list__collab-decline-btn"
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
 <div className="dk-list__collab-section dk-list__collab-section--padded">
 {myPending.length > 0 && (
 <label className="dk-list__modal-label--sm">
 Collaborators
 </label>
 )}
 {others.map((c) => (
 <div
 key={c.id}
 className="dk-list__collab-item"
 >
 <div className="dk-list__collab-item-name">
 <span className="dk-list__collab-item-username">
 {c.user?.username || c.userId}
 </span>
 <span className="dk-list__collab-item-status">
 {c.permission}
 {c.status === 'pending' && ' · pending'}
 </span>
 </div>
 {isOwner && (
 <button
 onClick={() => remove.mutate(c.userId)}
 className="dk-list__collab-remove-btn"
 >
 Remove
 </button>
 )}
 </div>
 ))}
 </div>
 ) : (
 myPending.length === 0 && (
 <p className="dk-list__collab-empty">
 No collaborators yet.
 </p>
 )
 )}

 {/* Invite (owner only) */}
 {isOwner && (
 <div className="dk-list__collab-section">
 <label className="dk-list__modal-label--sm">
 Invite
 </label>
 <div className="dk-list__modal-input-group">
 <input
 value={inviteUsername}
 onChange={(e) => {
 setInviteUsername(e.target.value)
 setLookupError(null)
 }}
 placeholder="Username to invite..."
 className="dk-list__modal-input"
 onKeyDown={(e) => {
 if (e.key === 'Enter') handleInvite()
 }}
 />
 <select
 value={permission}
 onChange={(e) => setPermission(e.target.value)}
 className="dk-list__modal-select"
 >
 <option value="VIEW">View</option>
 <option value="EDIT">Edit</option>
 <option value="ADMIN">Admin</option>
 </select>
 <button
 onClick={handleInvite}
 disabled={invite.isPending || isLookingUp || !inviteUsername.trim()}
 className="dk-list__collab-invite-btn"
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
 <p className="dk-list__collab-error">{lookupError}</p>
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

 if (isLoading) return <div className="dk-list__timeline-loading">Loading history...</div>
 if (!history || history.length === 0) {
 return (
 <div className="dk-list__timeline-empty">
 No ranking changes yet. Reorder items to see history.
 </div>
 )
 }

 return (
 <div className="dk-list__timeline">
 <h4 className="dk-list__timeline-title">Rank Changes</h4>
 <div className="dk-list__timeline-list">
 {history.map((entry) => (
 <div
 key={entry.id}
 className="dk-list__timeline-entry"
 >
 <span className="dk-list__timeline-date">
 {new Date(entry.changedAt).toLocaleDateString()}
 </span>
 {entry.mediaItem ? (
 <span className="dk-list__timeline-item">{entry.mediaItem.title}</span>
 ) : (
 <span className="dk-list__timeline-unknown">Unknown item</span>
 )}
 <span className="dk-list__timeline-rank">
 #{entry.oldSortOrder + 1} â†’ #{entry.newSortOrder + 1}
 </span>
 </div>
 ))}
 </div>
 </div>
 )
}
