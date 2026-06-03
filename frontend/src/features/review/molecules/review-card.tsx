import { useState, useEffect } from "react"
import { Link } from '@tanstack/react-router'
import { Trash2, Pencil, Shield, ThumbsUp, ThumbsDown, Clock } from "lucide-react"
import { StarRating } from "@ui/atoms/star-rating"
import { useAuth } from '@/features/auth/auth-provider'
import { useReviewVoteCounts, useVoteReview } from "../review-vote-queries"
import type { ReviewWithUserOut } from "../review-queries"

function isInCooldown(cooldownUntil: string | null): boolean {
 if (!cooldownUntil) return false
 return new Date(cooldownUntil) > new Date()
}

function formatRemaining(ms: number): string {
 const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
 const m = Math.floor(totalSeconds / 60)
 const s = totalSeconds % 60
 if (m > 0) return `${m}m ${s}s`
 return `${s}s`
}

function CooldownBadge({ cooldownUntil }: { cooldownUntil: string }) {
 const [remaining, setRemaining] = useState(() => new Date(cooldownUntil).getTime() - Date.now())

 useEffect(() => {
 const timer = setInterval(() => {
 const ms = new Date(cooldownUntil).getTime() - Date.now()
 if (ms <= 0) {
 setRemaining(0)
 clearInterval(timer)
 } else {
 setRemaining(ms)
 }
 }, 1000)
 return () => clearInterval(timer)
 }, [cooldownUntil])

 if (remaining <= 0) return null

 return (
 <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-500/60">
 <Clock className="w-2.5 h-2.5" />
 {formatRemaining(remaining)}
 </span>
 )
}

interface ReviewCardProps {
 review: ReviewWithUserOut
 isOwn?: boolean
 onEdit?: () => void
 onDelete?: () => void
}

function formatDate(dateStr: string): string {
 const d = new Date(dateStr)
 const now = new Date()
 const diff = now.getTime() - d.getTime()
 const days = Math.floor(diff / (1000 * 60 * 60 * 24))
 if (days < 1) return "Today"
 if (days < 2) return "Yesterday"
 if (days < 7) return `${days}d ago`
 if (days < 365) return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
 return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function ReviewCard({ review, isOwn, onEdit, onDelete }: ReviewCardProps) {
 const reviewScore = review.rating?.score ?? null

 return (
 <div className="w-fit rounded-xl bg-[var(--dk-surface-base)] px-4 py-3.5">
 {/* Top row: user, date, score */}
 <div className="flex items-center gap-3">
 <div className="flex-1 min-w-0 flex items-center gap-2">
 <Link
 to="/u/$username"
 params={{ username: review.user.username }}
 className="text-sm font-medium hover:text-primary transition-colors truncate"
 >
 {review.user.username}
 {review.user.isAdmin && (
 <Shield className="h-3 w-3 inline-block text-amber-400/80 ml-1" />
 )}
 </Link>
 <span className="text-xs text-muted-foreground/40">·</span>
 <span className="text-xs text-muted-foreground/50">{formatDate(review.createdAt)}</span>

 {/* Subtle badges */}
 {isOwn && (
 <span className="text-[10px] text-primary/60">you</span>
 )}
 {isOwn && review.cooldownUntil && isInCooldown(review.cooldownUntil) && (
 <CooldownBadge cooldownUntil={review.cooldownUntil} />
 )}
 {review.isSpoiler && (
 <span className="text-[10px] text-amber-500/60">spoiler</span>
 )}
 {isOwn && review.isPrivate && (
 <span className="text-[10px] text-muted-foreground/50">private</span>
 )}
 </div>

 {reviewScore != null && (
 <div className="shrink-0 flex items-center gap-1">
 <StarRating score={reviewScore} maxScore={10} size="sm" />
 <span className="text-sm font-semibold tabular-nums">{reviewScore}</span>
 </div>
 )}
 </div>

 {/* Content */}
 {review.content && (
 <p className="mt-2 text-sm text-foreground/75 leading-relaxed">
 {review.content}
 </p>
 )}

 {/* Actions row: votes + edit/delete */}
 <div className="mt-2.5 flex items-center justify-between">
 <ReviewVoteSection review={review} />
 {isOwn && (
 <div className="flex items-center gap-0.5">
 <button
 onClick={onEdit}
 className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-muted-foreground/50 hover:text-foreground hover:bg-white/[0.04] transition-colors"
 >
 <Pencil className="w-3 h-3" />
 Edit
 </button>
 <button
 onClick={onDelete}
 className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-muted-foreground/50 hover:text-red-400 hover:bg-red-500/10 transition-colors"
 >
 <Trash2 className="w-3 h-3" />
 Delete
 </button>
 </div>
 )}
 </div>
 </div>
 )
}

function ReviewVoteSection({ review }: { review: ReviewWithUserOut }) {
 const { user: currentUser } = useAuth()
 const { data: voteCounts } = useReviewVoteCounts(review.userId, review.mediaItemId)
 const voteMutation = useVoteReview(review.userId, review.mediaItemId)

 if (!currentUser) return <div />

 const upvotes = voteCounts?.up ?? 0
 const downvotes = voteCounts?.down ?? 0
 const myVote = voteCounts?.my_vote ?? null

 return (
 <div className="flex items-center gap-1">
 <button
 onClick={() => voteMutation.mutate('up')}
 disabled={voteMutation.isPending}
 className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] transition-colors ${
 myVote === 'up'
 ? 'text-emerald-400'
 : 'text-muted-foreground/40 hover:text-emerald-400'
 }`}
 >
 <ThumbsUp className="h-3 w-3" />
 {upvotes > 0 && <span className="tabular-nums">{upvotes}</span>}
 </button>
 <button
 onClick={() => voteMutation.mutate('down')}
 disabled={voteMutation.isPending}
 className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] transition-colors ${
 myVote === 'down'
 ? 'text-red-400'
 : 'text-muted-foreground/40 hover:text-red-400'
 }`}
 >
 <ThumbsDown className="h-3 w-3" />
 {downvotes > 0 && <span className="tabular-nums">{downvotes}</span>}
 </button>
 </div>
 )
}

export { ReviewCard }
