import {Badge} from '@ui/atoms/badge'
import {Image} from '@ui/atoms/image'
import {MEDIA_TYPE_LABEL} from '@/constants/media'
import {Calendar, Clock, Languages, Film, Tv, Gamepad2, Music, Sparkles} from 'lucide-react'
import {useQuery} from '@tanstack/react-query'
import {useAuth} from '@/old-features/auth'
import {backdropSrc, formatAlbumDuration, formatMusicCreditsLine, formatRuntime, formatYear, isMusic, languageName, mediaQueries, GLASS_PILL, useMediaParams} from '@media'
import { DownloadGameButton } from '@/features/media/game/components/organisms/media-download-game-button'

interface MediaHeroProps {
    className?: string
}

export function MediaHero({
                              className,
                          }: MediaHeroProps = {}) {
    const {mediaType, mediaId} = useMediaParams()

    const {user} = useAuth()
    const {data} = useQuery(mediaQueries.detail(mediaType, mediaId))
    if (!data) return null

    const detail = data
    const {
        title,
        backdropUrl,
        posterUrl,
        logoUrl,
        textlessPosterUrl,
        releaseDate,
        originalLanguage,
        isAdult,
    } = detail
    const isAnime = detail.movie?.isAnime || detail.show?.isAnime || false

    const musicCreditsLine = isMusic(detail) ? formatMusicCreditsLine(detail.credits) : null
    const tagline = detail.movie?.tagline || detail.game?.reviewSummary || musicCreditsLine

    const status = detail.show?.status || detail.game?.releaseStatus
    const runtime = detail.movie?.runtime
    const albumDurationMs = detail.album?.durationMs

    const userCountry = (user?.country || 'us').toLowerCase()
    const certification =
        detail.releases?.find(
            (r) => r.countryCode === userCountry && r.certification,
        )?.certification ||
        (userCountry !== 'us'
            ? detail.releases?.find((r) => r.countryCode === 'us' && r.certification)?.certification
            : null) ||
        null

    const year = formatYear(releaseDate)
    const formattedRuntime = formatRuntime(runtime)
    const formattedAlbumLength = formatAlbumDuration(albumDurationMs)
    const languageDisplay = originalLanguage ? languageName(originalLanguage) : null

    const logo: string | undefined = logoUrl || textlessPosterUrl || undefined
    const hasLogo = Boolean(logo)
    const heroBackdrop =
        backdropUrl || (mediaType === 'music' && posterUrl ? posterUrl : null)


    return (
        <div id="media-hero" className={`relative flex min-h-[45vh] items-end  rounded-3xl lg:min-h-[50vh] mx-12 mt-20 pb-14 ${className || ''}`} style={{ boxShadow: '0 -1px 0 0 hsl(var(--primary) / 0.12) inset' }}>
            {/* Backdrop with cinematic gradient */}
            {heroBackdrop && (
                <div className="fixed pointer-events-none inset-0 z-0 overflow-hidden">
                    <img
                        src={backdropSrc(heroBackdrop)}
                        alt=""
                        className="h-full w-full object-cover brightness-50"
                        style={{objectPosition: 'center 20%', animation: 'kenBurns 25s ease-out forwards'}}
                    />
                    <div
                        className="fixed inset-0"
                        style={{
                            background: 'linear-gradient(to top, color-mix(in oklab, var(--background) 95%, transparent) 0%, color-mix(in oklab, var(--background) 70%, transparent) 35%, color-mix(in oklab, var(--background) 30%, transparent) 100%)',
                        }}
                    />
                </div>
            )}
            {/* Image darken for text readability */}
            {/*<div*/}
            {/*    className="pointer-events-none absolute inset-0 z-[1]"*/}
            {/*    style={{ backgroundColor: 'color-mix(in oklab, var(--background) 50%, transparent)' }}*/}
            {/*/>*/}

            {/* Content (Inside the Hero banner) */}
            <div className="relative z-10 mx-auto w-full lg:max-w-7xl px-6 pb-2 pt-24 sm:px-6 lg:px-6" style={{animation: 'heroFadeIn 0.6s ease-out forwards'}}>
                <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-end sm:justify-start sm:gap-8 lg:gap-12">
                    {/* Poster — floats below hero, overlapping content card */}
                    <div className="w-40 shrink-0 sm:w-44 lg:w-56 xl:w-64 translate-y-10">
                        <div className="overflow-hidden rounded-2xl shadow-2xl">
                            <Image
                                src={posterUrl || undefined}
                                alt={`${title} poster`}
                                className={`w-full ${mediaType === 'music' ? 'aspect-square' : 'aspect-[2/3]'}`}
                                fallback={title[0]}
                            />
                        </div>
                    </div>

                    {/* Info */}
                    <div className="flex min-w-0 flex-1 flex-col items-center gap-3 text-center sm:items-start sm:text-left">
                        {/* Logo or title */}
                        {hasLogo ? (
                            <img
                                src={logo}
                                alt={title}
                                className="mb-2 max-h-24 max-w-[85%] object-contain sm:max-h-24 sm:max-w-[55%] lg:max-h-28 lg:max-w-[45%]"
                                style={{filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))'}}
                            />
                        ) : (
                            <h1
                                className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl text-white"
                                style={{textShadow: '0 2px 20px rgba(0,0,0,0.5)'}}
                            >
                                {title}
                            </h1>
                        )}

                        {/* Tagline */}
                        {tagline && (
                            <p
                                className="max-w-[60ch] text-base italic text-muted-foreground sm:text-lg animate-fade-in"
                                style={{textShadow: '0 1px 12px rgba(0,0,0,0.5)'}}
                            >
                                {tagline}
                            </p>
                        )}

                        {/* Option 2 Borderless Glassmorphic Detail Pills */}
                        <div className="flex flex-wrap gap-2 mt-2">
                            <Badge variant="secondary" className={`${GLASS_PILL}`}>
                                {mediaType === 'movie' && <Film className="h-3.5 w-3.5 text-primary" />}
                                {mediaType === 'show' && <Tv className="h-3.5 w-3.5 text-primary" />}
                                {mediaType === 'game' && <Gamepad2 className="h-3.5 w-3.5 text-primary" />}
                                {mediaType === 'music' && <Music className="h-3.5 w-3.5 text-primary" />}
                                {MEDIA_TYPE_LABEL[mediaType]}
                            </Badge>
                            {year && (
                                <Badge variant="secondary" className={`${GLASS_PILL}`}>
                                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                    {year}
                                </Badge>
                            )}
                            {(formattedRuntime || formattedAlbumLength) && (
                                <Badge variant="secondary" className={`${GLASS_PILL}`}>
                                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                    {formattedRuntime || formattedAlbumLength}
                                </Badge>
                            )}
                            {languageDisplay && (
                                <Badge variant="secondary" className={`${GLASS_PILL}`}>
                                    <Languages className="h-3.5 w-3.5 text-muted-foreground" />
                                    {languageDisplay}
                                </Badge>
                            )}
                            {status && (
                                <Badge variant="secondary" className={`${GLASS_PILL} capitalize`}>
                                    {status.replace(/_/g, ' ')}
                                </Badge>
                            )}
                            {certification && (
                                <Badge variant="secondary" className={`${GLASS_PILL}`}>
                                    {certification}
                                </Badge>
                            )}
                            <Badge
                                show={isAdult}
                                variant="destructive"
                                className="px-3 py-1.5 text-xs font-semibold bg-red-600/90 text-white border-0 font-bold"
                            >
                                18+
                            </Badge>
                            <Badge
                                show={isAnime}
                                variant="secondary"
                                className="bg-pink-500/95 hover:bg-pink-500 text-white gap-1.5 px-3 py-1.5 text-xs font-semibold border-0"
                            >
                                <Sparkles className="h-3.5 w-3.5" />
                                Anime
                            </Badge>
                        </div>

                        {mediaType === 'game' && <DownloadGameButton />}

                    </div>
                </div>
            </div>
        </div>
    )
}
