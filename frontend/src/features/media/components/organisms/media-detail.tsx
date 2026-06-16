import {Link, useParams} from '@tanstack/react-router'
import {Helmet} from 'react-helmet-async'
import {useAuth} from '@/old-features/auth'
import {Building2} from 'lucide-react'

import {MediaHero} from './media-hero'
import {MediaGeneralDetails} from './media-general-details'
import {SignInCTA} from './media-signin-cta'
import {MovieSection} from '@media/movie/components/organisms/media-movie-section'
import {ShowSection} from '@media/show/components/organisms/media-show-section'
import {GameSection} from '@media/game/components/organisms/media-game-section'
import {MusicSection} from '@media/music/components/organisms/media-music-section'
import {ArtistAlbumsSection} from '@media/music/components/organisms/media-artist-albums-section'
import {MoreLikeThisSection} from './media-more-like-this-section'
import {CastCrewList} from './media-cast-crew-list'
import {CollectionSection} from './media-collection-section'
import {DeferredSection} from '@ui/molecules/deferred-section'
import {Badge} from '@ui/atoms/badge'
import {Image} from '@ui/atoms/image'
import {ReviewSection} from '@/old-features/review/organisms/review-section'
import {ReviewsListSection} from '@/old-features/review/organisms/reviews-list-section'
import {RatingsSection} from '@/old-features/review/organisms/ratings-section'
import {ReviewActionButton} from '@/old-features/review/molecules/review-action-button'
import {InteractionSection} from '@/old-features/interaction/molecules/interaction-buttons'
import {WhereToWatchSection} from './media-where-to-watch-section'
import {SectionSkeleton} from './media-detail-section-skeleton'
import {DetailSkeleton} from './media-detail-skeleton'
import {ErrorState} from './media-detail-error-state'
import {DownloadGameButton} from '@media/game/components/organisms/media-download-game-button'

import {useEpisodeInteractions, useMarkShowWatched} from '@/old-features/interaction/episode-interaction-queries'
import {useQuery} from '@tanstack/react-query'
import {formatYear, isGame, isMovie, isMusic, isShow, mediaQueries, mediaTypeFromParam, seoDescription} from '@media'
import {AdminActionsMenu} from '@/old-features/admin/molecules/admin-actions-menu'
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
        <div className={`animate-fade-in pb-16 ${isDesktop ? 'pt-[var(--title-bar-height,38px)]' : ''}`}>
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
                <link rel="canonical"
                      href={window.location.origin + `/media/${displayType}/${detail.slug || mediaId}`}/>
                {detail.logoUrl && <link rel="preload" as="image" href={detail.logoUrl} fetchPriority="high"/>}
            </Helmet>

            {/* ── Hero ── */}
            <MediaHero/>

            {/* ── Content sections — overlaps hero for floating depth ── */}
            <div
                className="glass-card flex flex-1 flex-col mx-auto w-full max-w-6xl px-6 py-6 space-y-8 mt-8 relative z-10">

                {/* ── Main content card (the only glass surface) ── */}
                <div className="space-y-6" style={{boxShadow: '0 -1px 0 0 hsl(var(--primary) / 0.08), var(--dk-shadow-glass)'}}>
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

                    {/* Activity + Ratings — inside the main card, not a separate box */}
                    {isAuthenticated && (
                        <>
                            <hr className="border-white/5"/>
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

                            {detail.mediaType === 'game' && (
                                <div className="flex flex-wrap items-center gap-4">
                                    <DownloadGameButton/>
                                </div>
                            )}

                            <RatingsSection
                                overallRating={detail.overallRating}
                                overallRatingSource={detail.overallRatingSource}
                                avgRating={detail.avgRating}
                                ratingCount={detail.ratingCount}
                            />
                        </>
                    )}

                    {!isAuthenticated && (
                        <>
                            <hr className="border-white/5"/>
                            <RatingsSection
                                overallRating={detail.overallRating}
                                overallRatingSource={detail.overallRatingSource}
                                avgRating={detail.avgRating}
                                ratingCount={detail.ratingCount}
                            />
                        </>
                    )}

                    {/* ── Reviews — deserves its own glass surface, distinct from main content ── */}
                    <div className="">
                        <DeferredSection
                            fallback={<SectionSkeleton height={120}/>}
                            rootMargin="200px 0px"
                        >
                            <ReviewSection mediaId={detail.id}/>
                        </DeferredSection>

                        <DeferredSection
                            fallback={<SectionSkeleton height={260}/>}
                            rootMargin="400px 0px"
                        >
                            <ReviewsListSection mediaId={detail.id}/>
                        </DeferredSection>
                    </div>
                </div>


                {/* ── Companies — logo cards with glass-inset ── */}
                {detail.involvedCompanies && detail.involvedCompanies.length > 0 && (
                        <section className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
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
                                        className="glass-inset flex flex-col items-center gap-2.5 p-4 text-center transition-all duration-200 hover:scale-[1.02]"
                                    >
                                        {ic.company.logoUrl ? (
                                            <div className="flex h-10 w-10 items-center justify-center">
                                                <img
                                                    src={ic.company.logoUrl}
                                                    alt={ic.company.name}
                                                    className="max-h-10 max-w-full object-contain brightness-0 invert opacity-80"
                                                />
                                            </div>
                                        ) : (
                                            <div
                                                className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-muted-foreground">
                                                <Building2 className="h-5 w-5"/>
                                            </div>
                                        )}
                                        <div className="min-w-0 w-full">
                                            <p className="text-xs font-semibold truncate">{ic.company.name}</p>
                                            {roles.length > 0 && (
                                                <p className="mt-0.5 text-[10px] text-muted-foreground">
                                                    {roles.join(' · ')}
                                                </p>
                                            )}
                                        </div>
                                    </Link>
                                )
                            })}
                        </section>
                )}

                {/* ── Where to Watch — button that opens modal ── */}

                <WhereToWatchSection/>


                {/* ── Discovery — open flow, no boxes ── */}
                <ArtistAlbumsSection/>

                {detail.collection && <CollectionSection/>}

                <MoreLikeThisSection/>

                {/* ── Cast & Crew (deferred) — open flow ── */}
                <DeferredSection
                    fallback={<SectionSkeleton height={260}/>}
                    rootMargin="400px 0px"
                >
                    <CastCrewList/>
                </DeferredSection>


            </div>
        </div>
    )
}
