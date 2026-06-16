import {Link, useParams} from '@tanstack/react-router'
import {Helmet} from 'react-helmet-async'
import {useAuth} from '@/old-features/auth'

import {MediaHero} from './media-hero'
import {MediaGeneralDetails} from './media-general-details'
import {SignInCTA} from './media-signin-cta'
import {MovieSection} from './media-movie-section'
import {ShowSection} from './media-show-section'
import {GameSection} from './media-game-section'
import {MusicSection} from './media-music-section'
import {ArtistAlbumsSection} from './media-artist-albums-section'
import {MoreLikeThisSection} from './media-more-like-this-section'
import {CastCrewList} from './media-cast-crew-list'
import {CollectionSection} from './media-collection-section'
import {DeferredSection} from '@ui/molecules/deferred-section'
import {Badge} from '@ui/atoms/badge'
import {ReviewSection} from '@/old-features/review/organisms/review-section'
import {ReviewsListSection} from '@/old-features/review/organisms/reviews-list-section'
import {RatingsSection} from '@/old-features/review/organisms/ratings-section'
import {ReviewActionButton} from '@/old-features/review/molecules/review-action-button'
import {InteractionSection} from '@/old-features/interaction/molecules/interaction-buttons'
import {WhereToWatchSection} from './media-where-to-watch-section'
import {SectionSkeleton} from './media-detail-section-skeleton'
import {DetailSkeleton} from './media-detail-skeleton'
import {ErrorState} from './media-detail-error-state'
import {DownloadGameButton} from './media-download-game-button'

import {useEpisodeInteractions, useMarkShowWatched} from '@/old-features/interaction/episode-interaction-queries'
import {useQuery} from '@tanstack/react-query'
import {formatYear, isGame, isMovie, isMusic, isShow, mediaQueries, mediaTypeFromParam, seoDescription} from '@media'
import {AdminActionsMenu} from '@/old-features/admin/molecules/admin-actions-menu'
import {cn} from '@/lib/utils'
import {useDesktopPlatform} from '@/lib/desktop/platform'

function useMediaDetail(mediaType: string, id: string) {
    return useQuery(mediaQueries.detail(mediaType, id))
}


export function MediaDetail() {
    const params = useParams({strict: false}) as { mediaType?: string; mediaId?: string }
    const mediaType = mediaTypeFromParam(params.mediaType || 'movie')
    const mediaId = params.mediaId || ''


    const {isAuthenticated} = useAuth()
    const {isDesktop} = useDesktopPlatform()

    const {data, isError} = useMediaDetail(mediaType, mediaId)
    const isShowDetail = data?.mediaType === 'show'
    const episodeInteractions = useEpisodeInteractions(mediaId, {enabled: isShowDetail})
    const markShowWatched = useMarkShowWatched(mediaId)

    // Route param not available yet during hard refresh — show skeleton, not error
    if (!mediaId) return <DetailSkeleton/>
    if (isError || !data) return <ErrorState mediaType={mediaType}/>

    const detail = data
    const year = formatYear(detail.releaseDate)
    const titleWithYear = year ? `${detail.title} (${year})` : detail.title
    const displayType = detail.mediaType as 'movie' | 'show' | 'game' | 'music'


    return (
        <div className={cn('animate-fade-in pb-16', isDesktop && 'pt-[var(--title-bar-height,38px)]')}>
            {/* ── SEO ── */}
            <Helmet>
                <title>{`${titleWithYear} - Otix`}</title>
                <meta name="description" content={seoDescription(detail.overview, detail.title)}/>
                <meta property="og:title" content={`${titleWithYear} - Otix`}/>
                <meta property="og:description" content={seoDescription(detail.overview, detail.title)}/>
                <meta property="og:type" content={
                    detail.mediaType === 'show'
                        ? 'video.tv_show'
                        : detail.mediaType === 'music'
                            ? 'music.album'
                            : 'video.movie'
                }/>
                {detail.posterUrl && <meta property="og:image" content={detail.posterUrl}/>}
                <meta name="twitter:card" content="summary_large_image"/>
                <meta name="twitter:title" content={`${titleWithYear} - Otix`}/>
                <meta name="twitter:description" content={seoDescription(detail.overview, detail.title)}/>
                {detail.posterUrl && <meta name="twitter:image" content={detail.posterUrl}/>}
                <link rel="canonical" href={window.location.origin + `/media/${displayType}/${detail.slug || mediaId}`}/>
                {detail.logoUrl && <link rel="preload" as="image" href={detail.logoUrl} fetchPriority="high"/>}
            </Helmet>

            {/* ── Hero ── */}
            <MediaHero/>

            {/* ── Content sections ── */}
            <div className="flex flex-1 flex-col mx-auto w-full max-w-6xl px-6 space-y-6">

                {/* ── Group 1: About ── */}
                <div className="glass-card p-6 sm:p-8 space-y-5">
                    {!isAuthenticated && <SignInCTA/>}

                    <MediaGeneralDetails/>

                    {isMovie(detail) && <MovieSection/>}
                    {isShow(detail) && <ShowSection/>}
                    {isGame(detail) && <GameSection/>}
                    {isMusic(detail) && <MusicSection/>}
                    {detail.mediaType === 'music' && !detail.album && (
                        <p className="text-center text-sm text-muted-foreground">
                            Album details are still syncing for this release.
                        </p>
                    )}
                </div>

                {/* ── Group 2: Your Activity ── */}
                {isAuthenticated && (
                    <div className="glass-card p-6 sm:p-8 space-y-5">
                        <InteractionSection
                            mediaId={detail.id}
                            mediaType={displayType}
                            userInteractions={detail.userInteractions}
                            onShowWatchedToggle={
                                isShowDetail
                                    ? (active) => markShowWatched.mutate(active)
                                    : undefined
                            }
                            showEpisodeInfo={
                                isShowDetail && episodeInteractions.data
                                    ? (() => {
                                        const eps = Object.values(episodeInteractions.data.episodes)
                                        return {
                                            watched: eps.filter((e) => e.watched).length,
                                            total: eps.length,
                                        }
                                    })()
                                    : undefined
                            }
                        >
                            <ReviewActionButton mediaId={detail.id}/>
                            <AdminActionsMenu mediaId={detail.id} media={detail}/>
                        </InteractionSection>

                        {/* Unified game action button (Play / Install / Download) */}
                        {detail.mediaType === 'game' && (
                            <div className="flex flex-wrap items-center gap-4">
                                <DownloadGameButton mediaId={detail.id} mediaTitle={detail.title}/>
                            </div>
                        )}

                        {/* Ratings — Otix community + external */}
                        <RatingsSection
                            avgRating={detail.avgRating}
                            ratingCount={detail.ratingCount}
                            externalRatings={detail.externalRatings}
                        />
                    </div>
                )}

                {/* Ratings for unauthenticated users (no interaction buttons) */}
                {!isAuthenticated && (
                    <div className="glass-card p-6 sm:p-8">
                        <RatingsSection
                            avgRating={detail.avgRating}
                            ratingCount={detail.ratingCount}
                            externalRatings={detail.externalRatings}
                        />
                    </div>
                )}

                {/* ── Group 3: Discovery (full-bleed carousels, no glass card) ── */}

                {/* Other albums by same artist */}
                {detail.mediaType === 'music' && (() => {
                    const primaryArtist = detail.credits.find((c) => c.role === 'primary')
                    if (primaryArtist) {
                        return (
                            <ArtistAlbumsSection
                                artistPersonId={primaryArtist.person.id}
                                artistName={primaryArtist.person.name}
                                currentMediaId={detail.id}
                            />
                        )
                    }
                    return null
                })()}

                {/* Collection (movies only) */}
                {detail.collection && (
                    <CollectionSection collection={detail.collection} currentMediaId={detail.id}/>
                )}

                {/* Similar + Recommendations (merged, tabbed) */}
                <MoreLikeThisSection/>

                {/* ── Group 4: Details ── */}
                {(detail.involvedCompanies?.length > 0 || detail.credits?.length > 0 || detail.watchProviders?.length > 0) && (
                    <div className="glass-card p-6 sm:p-8 space-y-6">
                        {/* Companies */}
                        {detail.involvedCompanies && detail.involvedCompanies.length > 0 && (
                            <section className="space-y-3">
                                <h2 className="text-lg font-semibold">Companies</h2>
                                <div className="flex flex-wrap gap-1.5">
                                    {detail.involvedCompanies.map((ic) => {
                                        const roles: string[] = []
                                        if (ic.production) roles.push('Production')
                                        if (ic.developer) roles.push('Dev')
                                        if (ic.publisher) roles.push('Pub')
                                        if (ic.porting) roles.push('Port')
                                        if (ic.supporting) roles.push('Support')
                                        return (
                                            <Link
                                                key={ic.id}
                                                to="/company/$companyId"
                                                params={{companyId: ic.company.id}}
                                            >
                                                <Badge variant="secondary" className="gap-1.5 border-0 bg-white/5 transition-colors hover:bg-white/10">
                                                    {ic.company.name}
                                                    {roles.length > 0 && (
                                                        <span className="text-[10px] text-muted-foreground">
                                                            {roles.join('/')}
                                                        </span>
                                                    )}
                                                </Badge>
                                            </Link>
                                        )
                                    })}
                                </div>
                            </section>
                        )}

                        {/* Cast & Crew (deferred) */}
                        {detail.credits && detail.credits.length > 0 && (
                            <DeferredSection
                                fallback={<SectionSkeleton height={260}/>}
                                rootMargin="400px 0px"
                            >
                                <CastCrewList credits={detail.credits}/>
                            </DeferredSection>
                        )}

                        {/* Where to Watch */}
                        <WhereToWatchSection
                            watchProviders={detail.watchProviders}
                            mediaType={displayType}
                        />
                    </div>
                )}

                {/* ── Group 5: Reviews ── */}
                <div className="glass-card p-6 sm:p-8 space-y-5">
                    {/* User reviews — Your Rating */}
                    <DeferredSection
                        fallback={<SectionSkeleton height={120}/>}
                        rootMargin="200px 0px"
                    >
                        <ReviewSection mediaId={detail.id}/>
                    </DeferredSection>

                    {/* User reviews — Community Reviews */}
                    <DeferredSection
                        fallback={<SectionSkeleton height={260}/>}
                        rootMargin="400px 0px"
                    >
                        <ReviewsListSection mediaId={detail.id}/>
                    </DeferredSection>
                </div>
            </div>
        </div>
    )
}
