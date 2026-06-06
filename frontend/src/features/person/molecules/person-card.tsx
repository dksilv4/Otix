// TODO: Review this file
import { Link } from '@tanstack/react-router'
import { Heart, UserRound } from 'lucide-react'
import { Image } from '@ui/atoms/image'
import { cn } from '@/lib/utils'
import './person-card.scss'

export interface PersonCardProps {
  id: string
  name: string
  imageUrl?: string | null
  role?: string | null
  className?: string
  isFavorite?: boolean
  onFavoriteToggle?: () => void
}

const voiceMarkerPattern = /\(\s*voice\s*\)/i
const voiceOnlyPattern = /^(voice actor|voice)$/i

function getRoleMeta(role?: string | null) {
  const rawLabel = role?.trim() ?? ''
  if (!rawLabel) return { label: '', isVoice: false }

  const isVoice = voiceMarkerPattern.test(rawLabel) || voiceOnlyPattern.test(rawLabel)
  const label = rawLabel
    .replace(/\s*\(\s*voice\s*\)\s*/gi, ' ')
    .replace(voiceOnlyPattern, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

  return { label, isVoice }
}

export function PersonCard({
  id,
  name,
  imageUrl,
  role,
  className,
  isFavorite = false,
  onFavoriteToggle,
}: PersonCardProps) {
  const { label, isVoice } = getRoleMeta(role)
  const showMeta = Boolean(label || isVoice)

  return (
    <div
      className={cn('dk-person-card', className)}
    >
      <Link
        to="/person/$personId"
        params={{ personId: id }}
        aria-label={`View ${name} details`}
        className="dk-person-card__link"
      >
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={name}
            className="dk-person-card__media"
            fallback={
              <div className="dk-person-card__media-fallback">
                <UserRound className="h-10 w-10" aria-hidden="true" />
              </div>
            }
          />
        ) : (
          <div className="dk-person-card__no-media">
            <UserRound className="h-10 w-10" aria-hidden="true" />
          </div>
        )}

        <div className="dk-person-card__overlay" />

        <div className="dk-person-card__content">
          {showMeta && (
            <div className="dk-person-card__meta">
              {label && (
                <p
                  className="dk-person-card__role"
                  title={role ?? label}
                >
                  {label}
                </p>
              )}
              {isVoice && (
                <span className="dk-person-card__badge">
                  Voice
                </span>
              )}
            </div>
          )}
          <h3 className="dk-person-card__name">
            {name}
          </h3>
        </div>
      </Link>

      {onFavoriteToggle && (
        <button
          type="button"
          aria-label={isFavorite ? `Remove ${name} from favorites` : `Add ${name} to favorites`}
          aria-pressed={isFavorite}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onFavoriteToggle()
          }}
          className="dk-person-card__favorite-btn"
        >
          <Heart
            className={cn('h-5 w-5', isFavorite && 'fill-current')}
            aria-hidden="true"
          />
        </button>
      )}
    </div>
  )
}
