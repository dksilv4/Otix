import { useState, useEffect } from "react"
import { Link } from '@tanstack/react-router'
import { Trash2, Pencil, Shield, ThumbsUp, ThumbsDown, Clock } from "lucide-react"
import { StarRating } from "@ui/atoms/star-rating"
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/providers/auth'
import { useReviewVoteCounts, useVoteReview } from "../review-vote-queries"
import type { ReviewWithUserOut } from "../review-queries"
import './review-card.scss'

import { formatRemaining, formatDate, isInCooldown } from '../utils'

const CooldownBadge = ({ cooldownUntil }: { cooldownUntil: string }) => {
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
		<span className="dk-review-card__cooldown">
			<Clock className="w-2.5 h-2.5" />
			{formatRemaining(remaining)}
		</span>
	)
};

interface ReviewCardProps {
	review: ReviewWithUserOut
	isOwn?: boolean
	onEdit?: () => void
	onDelete?: () => void
}


const ReviewCard = ({ review, isOwn, onEdit, onDelete }: ReviewCardProps) => {
	const reviewScore = review.rating?.score ?? null

	return (
		<div className="dk-review-card">
			{/* Top row: user, date, score */}
			<div className="dk-review-card__top-row">
				<div className="dk-review-card__user-info">
					<Link
						to="/u/$username"
						params={{ username: review.user.username }}
						className="dk-review-card__username"
					>
						{review.user.username}
						{review.user.isAdmin && (
							<Shield className="h-3 w-3 inline-block text-amber-400/80 ml-1" />
						)}
					</Link>
					<span className="dk-review-card__separator">·</span>
					<span className="dk-review-card__date">{formatDate(review.createdAt)}</span>

					{/* Subtle badges */}
					{isOwn && (
						<span className="dk-review-card__badge--own">you</span>
					)}
					{isOwn && review.cooldownUntil && isInCooldown(review.cooldownUntil) && (
						<CooldownBadge cooldownUntil={review.cooldownUntil} />
					)}
					{review.isSpoiler && (
						<span className="dk-review-card__badge--spoiler">spoiler</span>
					)}
					{isOwn && review.isPrivate && (
						<span className="dk-review-card__badge--private">private</span>
					)}
				</div>

				{reviewScore != null && (
					<div className="dk-review-card__score">
						<StarRating score={reviewScore} maxScore={10} size="sm" />
						<span className="dk-review-card__score-value">{reviewScore}</span>
					</div>
				)}
			</div>

			{/* Content */}
			{review.content && (
				<p className="dk-review-card__content">
					{review.content}
				</p>
			)}

			{/* Actions row: votes + edit/delete */}
			<div className="dk-review-card__actions">
				<ReviewVoteSection review={review} />
				{isOwn && (
					<div className="dk-review-card__action-group">
						<button
							onClick={onEdit}
							className="dk-review-card__action-btn dk-review-card__action-btn--edit"
						>
							<Pencil className="w-3 h-3" />
							Edit
						</button>
						<button
							onClick={onDelete}
							className="dk-review-card__action-btn dk-review-card__action-btn--delete"
						>
							<Trash2 className="w-3 h-3" />
							Delete
						</button>
					</div>
				)}
			</div>
		</div>
	)
};

const ReviewVoteSection = ({ review }: { review: ReviewWithUserOut }) => {
	const { user: currentUser } = useAuth()
	const { data: voteCounts } = useReviewVoteCounts(review.userId, review.mediaItemId)
	const voteMutation = useVoteReview(review.userId, review.mediaItemId)

	if (!currentUser) return <div />

	const upvotes = voteCounts?.up ?? 0
	const downvotes = voteCounts?.down ?? 0
	const myVote = voteCounts?.my_vote ?? null

	return (
		<div className="dk-review-card__votes">
			<button
				onClick={() => voteMutation.mutate('up')}
				disabled={voteMutation.isPending}
				className={cn(
					"dk-review-card__vote-btn dk-review-card__vote-btn--up",
					myVote === 'up' && "dk-review-card__vote-btn--active"
				)}
			>
				<ThumbsUp className="h-3 w-3" />
				{upvotes > 0 && <span className="tabular-nums">{upvotes}</span>}
			</button>
			<button
				onClick={() => voteMutation.mutate('down')}
				disabled={voteMutation.isPending}
				className={cn(
					"dk-review-card__vote-btn dk-review-card__vote-btn--down",
					myVote === 'down' && "dk-review-card__vote-btn--active"
				)}
			>
				<ThumbsDown className="h-3 w-3" />
				{downvotes > 0 && <span className="tabular-nums">{downvotes}</span>}
			</button>
		</div>
	)
};

export { ReviewCard }
