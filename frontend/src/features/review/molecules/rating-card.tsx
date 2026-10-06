import { Link } from '@tanstack/react-router'
import { Shield, Pencil } from 'lucide-react'
import { StarRating } from '@ui/atoms/star-rating'
import { cn } from '@/lib/utils'
import type { MediaRatingWithUserOut } from '../rating-queries'
import './rating-card.scss'

interface RatingCardProps {
  rating: MediaRatingWithUserOut
  isOwn?: boolean
  onEdit?: () => void
  className?: string
}

import { formatDate } from '../utils'

export const RatingCard = ({ rating, isOwn, onEdit, className }: RatingCardProps) => {
  const username = rating.user?.username || 'Anonymous'
  const initial = username.charAt(0).toUpperCase()

  return (
    <div className={cn('dk-rating-card', className)}>
      <div className="dk-rating-card__left">
        <div className="dk-rating-card__avatar" aria-hidden="true">
          {initial}
        </div>

        <div className="dk-rating-card__meta">
          <div className="dk-rating-card__user-row">
            <Link
              to="/u/$username"
              params={{ username }}
              className="dk-rating-card__username"
            >
              {username}
              {rating.user?.isAdmin && (
                <Shield className="h-3 w-3 inline-block text-amber-400/80 ml-1" />
              )}
            </Link>

            <span className="dk-rating-card__separator">·</span>
            <span className="dk-rating-card__date">{formatDate(rating.createdAt)}</span>

            {isOwn && (
              <span className="dk-rating-card__badge--own">you</span>
            )}
          </div>

          <div className="dk-rating-card__action-text">
            <span>rated this</span>
            <span className="text-amber-400/90 font-medium">
              {(rating.score / 2).toFixed(rating.score % 2 === 0 ? 0 : 1)} / 5 ★
            </span>
          </div>
        </div>
      </div>

      <div className="dk-rating-card__right">
        <div className="dk-rating-card__score-block">
          <StarRating score={rating.score} maxScore={10} size="sm" />
          <span className="dk-rating-card__score-value">{rating.score}/10</span>
        </div>

        {isOwn && onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="dk-rating-card__edit-btn"
            title="Edit rating or add a review"
          >
            <Pencil className="w-3 h-3" />
            <span className="hidden sm:inline">Edit</span>
          </button>
        )}
      </div>
    </div>
  )
};
