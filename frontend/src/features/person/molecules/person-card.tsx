import { Link } from '@tanstack/react-router'
import { Heart, UserRound } from 'lucide-react'
import { Image } from '@ui/atoms/image'
import { cn } from '@/lib/utils'

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
      className={cn(
        'group relative h-48 w-28 shrink-0 overflow-hidden rounded-lg bg-muted shadow-[0_4px_16px_rgb(0_0_0/0.2)] transition-[transform,box-shadow] duration-300 ease-out sm:h-52 sm:w-32',
        'hover:scale-[1.02] hover:shadow-[0_20px_40px_rgb(0_0_0/0.35)] active:scale-[1.01]',
        className,
      )}
    >
      <Link
        to="/person/$personId"
        params={{ personId: id }}
        aria-label={`View ${name} details`}
        className="absolute inset-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={name}
            className="absolute inset-0 h-full w-full rounded-lg transition-transform duration-500 ease-out group-hover:scale-[1.08]"
            fallback={
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-950 text-white/45">
                <UserRound className="h-10 w-10" aria-hidden="true" />
              </div>
            }
          />
        ) : (
          <div className="absolute inset-0 flex h-full w-full items-center justify-center rounded-lg bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-950 text-white/45 transition-transform duration-500 ease-out group-hover:scale-[1.08]">
            <UserRound className="h-10 w-10" aria-hidden="true" />
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 rounded-lg bg-gradient-to-t from-black/90 via-black/45 to-transparent opacity-90 transition-opacity duration-300 group-hover:opacity-95" />

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-3 text-white transition-transform duration-300 group-hover:translate-y-0">
          {showMeta && (
            <div className="mb-1 flex min-w-0 items-center gap-2">
              {label && (
                <p
                  className="min-w-0 truncate text-[11px] font-medium uppercase leading-tight text-white/75"
                  title={role ?? label}
                >
                  {label}
                </p>
              )}
              {isVoice && (
                <span className="shrink-0 rounded-full bg-white/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white/90 ring-1 ring-white/15">
                  Voice
                </span>
              )}
            </div>
          )}
          <h3 className="truncate text-sm font-semibold leading-tight text-white drop-shadow-[0_2px_8px_rgb(0_0_0/0.75)] sm:text-base">
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
          className="absolute right-2.5 top-2.5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full text-rose-500 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90"
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
