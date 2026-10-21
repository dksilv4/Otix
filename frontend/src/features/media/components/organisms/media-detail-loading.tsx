import { useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { MediaLogo } from '@/lib/media/media-logo'
import { Logo } from '@ui/atoms/logo'
import { useDesktopPlatform } from '@/lib/desktop/platform'
import { MEDIA_TYPE_LABEL } from '@/constants/media'
import { cn } from '@/lib/utils'
import { backdropSrc, mediaTypeFromParam } from '../../utils'
import { mediaQueries } from '../../queries/media-queries'
import { useMediaPreview } from '../../hooks/use-media-preview'
import { useMediaParams } from '../../hooks/use-media-params'

export interface MediaDetailLoadingProps {
  mediaType?: string
  mediaId?: string
}

export const MediaDetailLoading = ({
  mediaType: propType,
  mediaId: propId,
}: MediaDetailLoadingProps = {}) => {
  const { isDesktop } = useDesktopPlatform()
  const { mediaType: paramType, mediaId: paramId } = useMediaParams()
  const params = useParams({ strict: false }) as { mediaType?: string; mediaId?: string }

  const effectiveType = mediaTypeFromParam(propType || paramType || params.mediaType || 'movie')
  const effectiveId = propId || paramId || params.mediaId || ''

  const preview = useMediaPreview(effectiveType, effectiveId)
  const { data: detail } = useQuery({
    ...mediaQueries.detail(effectiveType, effectiveId),
    enabled: Boolean(effectiveId),
  })

  const [logoFailed, setLogoFailed] = useState(false)

  const title = detail?.title || preview?.title || null
  const logoUrl = detail?.logoUrl || preview?.logoUrl || null
  const logoColorGuess = detail?.logoUrl ? detail.logoColorGuess : preview?.logoColorGuess
  const backdropUrl = detail?.backdropUrl || preview?.backdropUrl || null
  const posterUrl = detail?.posterUrl || preview?.posterUrl || null
  const heroBackdrop = backdropUrl || posterUrl || null
  const hasLogo = Boolean(logoUrl && !logoFailed)

  return (
    <div
      id="media-detail-loading"
      role="status"
      aria-label={title ? `Loading ${title}…` : 'Loading media details…'}
      className={cn(
        'relative min-h-[100vh] w-full flex flex-col items-center justify-center overflow-hidden bg-background select-none animate-fade-in',
        isDesktop && 'pt-[var(--title-bar-height,38px)]',
      )}
    >
      {/* ── Fixed / Ambient Atmospheric Backdrop ── */}
      {heroBackdrop ? (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
          <img
            src={backdropSrc(heroBackdrop)}
            alt=""
            loading="eager"
            fetchPriority="high"
            decoding="async"
            className="h-full w-full object-cover blur-2xl scale-110 brightness-[0.25] saturate-125"
            style={{
              objectPosition: 'center 25%',
              animation: 'kenBurns 32s ease-out forwards',
            }}
          />
          {/* Ambient radial blur + multi-stop veil */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 50% 45%, color-mix(in oklch, var(--background) 35%, transparent) 0%, var(--background) 85%)',
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(to top, var(--background) 0%, color-mix(in oklch, var(--background) 80%, transparent) 30%, transparent 70%, var(--background) 100%)',
            }}
          />
        </div>
      ) : (
        <div
          className="absolute inset-0 pointer-events-none z-0"
          style={{
            background:
              'radial-gradient(ellipse 70% 60% at 50% 45%, color-mix(in oklch, var(--primary) 14%, transparent) 0%, var(--background) 80%)',
          }}
        />
      )}

      {/* ── Foreground Centerpiece Stage ── */}
      <div className="relative z-10 flex flex-col items-center justify-center px-6 py-12 max-w-2xl mx-auto text-center">
        {/* Ambient radial glow aura behind the logo */}
        <div className="relative flex items-center justify-center">
          <div
            className="absolute -inset-10 sm:-inset-16 rounded-full blur-3xl opacity-35 animate-media-logo-glow pointer-events-none"
            style={{
              background:
                'radial-gradient(circle, color-mix(in oklch, var(--primary) 40%, transparent) 0%, transparent 70%)',
            }}
          />

          {/* Logo with breathing / floating loading animation */}
          <div className="relative z-10 animate-media-logo-breathe">
            {hasLogo ? (
              <MediaLogo
                src={logoUrl!}
                alt={title || ''}
                colorGuess={logoColorGuess}
                background="dark"
                shadow="drop-shadow(0 12px 36px rgba(0,0,0,0.85)) drop-shadow(0 0 24px color-mix(in oklch, var(--primary) 22%, transparent))"
                className="max-h-24 sm:max-h-32 md:max-h-40 max-w-[85vw] sm:max-w-md md:max-w-lg object-contain select-none"
                onError={() => setLogoFailed(true)}
              />
            ) : title ? (
              <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-foreground select-none drop-shadow-md">
                {title}
              </h1>
            ) : (
              <Logo
                className="h-20 sm:h-24 drop-shadow-[0_0_32px_color-mix(in_oklch,var(--primary)_35%,transparent)]"
                animateInfinity
              />
            )}
          </div>
        </div>

        {/* ── Loading Animation Bar & Indicator ── */}
        <div className="mt-8 flex flex-col items-center gap-3">
          <div
            className="relative h-1 w-36 sm:w-48 overflow-hidden rounded-full bg-[var(--dk-surface-ghost)] backdrop-blur-md"
            role="progressbar"
            aria-label="Loading media detail"
          >
            <div
              className="absolute inset-y-0 w-1/2 rounded-full bg-gradient-to-r from-transparent via-[var(--primary)] to-transparent animate-media-loading-sweep"
            />
          </div>

          <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground select-none">
            {title ? `Loading ${MEDIA_TYPE_LABEL[effectiveType] || 'media'}…` : 'Loading…'}
          </span>
        </div>
      </div>
    </div>
  )
}
