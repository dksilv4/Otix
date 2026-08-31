import {useState, useCallback} from 'react'
import {Link, useParams} from '@tanstack/react-router'
import {Helmet} from 'react-helmet-async'
import {useAuth} from '@auth/hooks/use-auth'
import {Building2} from 'lucide-react'
import {MediaDetailPluginActions} from './plugin-detail-actions'

import {MediaHero} from './media-hero'
import {MediaGeneralDetails} from './media-general-details'
import {SignInCTA} from './media-signin-cta'
import {MovieSection} from '@media/movie/components/organisms/media-movie-section'
import {ShowSection} from '@media/show/components/organisms/media-show-section'
import {GameSection} from '@media/game/components/organisms/media-game-section'
import {GameTabBar} from '@media/game/components/molecules/media-game-tab-bar'
import {BlueprintVault, type ParsedBlueprint} from '@media/game/components/organisms/media-game-blueprint-vault'
import {BlueprintCommunity} from '@media/game/components/organisms/media-game-blueprint-community'
import {BlueprintDetail} from '@media/game/components/organisms/media-game-blueprint-detail'
import {MusicSection} from '@media/music/components/organisms/media-music-section'
import {ArtistAlbumsSection} from '@media/music/components/organisms/media-artist-albums-section'
import {MoreLikeThisSection} from './media-more-like-this-section'
import {CastCrewList} from './media-cast-crew-list'
import {CollectionSection} from './media-collection-section'
import {DeferredSection} from '@ui/molecules/deferred-section'
import {ReviewSection} from '@/features/review/organisms/review-section'
import {ReviewsListSection} from '@/features/review/organisms/reviews-list-section'
import {RatingsSection} from '@/features/review/organisms/ratings-section'
import {ReviewActionButton} from '@/features/review/molecules/review-action-button'
import {InteractionSection} from '@/features/interaction/molecules/interaction-buttons'
import {WhereToWatchSection} from './media-where-to-watch-section'
import {SectionSkeleton} from './media-detail-section-skeleton'
import {DetailSkeleton} from './media-detail-skeleton'
import {ErrorState} from './media-detail-error-state'
import {DownloadGameButton} from '@media/game/components/organisms/media-download-game-button'

import {useEpisodeInteractions, useMarkShowWatched} from '@/features/interaction/episode-interaction-queries'
import {useQuery} from '@tanstack/react-query'
import {formatYear, isGame, isMovie, isMusic, isShow, mediaQueries, mediaTypeFromParam, seoDescription} from '@media'
import {AdminActionsMenu} from '@/old-features/admin/molecules/admin-actions-menu'
import {AddToListButton} from '@list/molecules/add-to-list-button'
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
    const [activeGameTab, setActiveGameTab] = useState('info')
    const [pluginTabs, setPluginTabs] = useState<Array<{tabId: string; pluginId: string}>>([])
    const [detailBlueprint, setDetailBlueprint] = useState<ParsedBlueprint | null>(null)
    const [blueprintSubTab, setBlueprintSubTab] = useState<'vault' | 'community'>('vault')
    const pluginIdForTab = useCallback((tabId: string) => {
      return pluginTabs.find((t) => t.tabId === tabId)?.pluginId || ''
    }, [pluginTabs])

    const handleDeleteBlueprint = useCallback(async (id: string) => {
      const pluginId = pluginIdForTab(activeGameTab)
      if (!pluginId) return
      const api = (window as unknown as Record<string, unknown>).desktopAPI as Record<string, unknown> | undefined
      if (!api?.plugin || typeof api.plugin !== 'object') return
      const plugin = api.plugin as Record<string, unknown>
      if (typeof plugin.callData !== 'function') return
      try {
        await (plugin.callData as (...args: unknown[]) => Promise<Record<string, unknown>>)(
          pluginId, 'deleteBlueprint', { id },
        )
      } catch {
        /* ignore */
      }
    }, [pluginIdForTab, activeGameTab])

    const {data, isError, isPending} = useMediaDetail(mediaType, mediaId)
    const isShowDetail = data?.mediaType === 'show'
    const episodeInteractions = useEpisodeInteractions(mediaType, mediaId, {enabled: isShowDetail})
    const markShowWatched = useMarkShowWatched(mediaType, mediaId)

    // Route param not available yet during hard refresh — show skeleton, not error
    if (!mediaId) return <DetailSkeleton/>
    if (isPending) return <DetailSkeleton/>
    if (isError || !data) return <ErrorState mediaType={mediaType}/>

    const detail = data
    const year = formatYear(detail.releaseDate)
    const titleWithYear = year ? `${detail.title} (${year})` : detail.title
    const displayType = detail.mediaType as 'movie' | 'show' | 'game' | 'music'
    const gameExternalId = isGame(detail) ? String(detail.game?.steamAppId || detail.id) : null


    return (
        <div id="media-detail" className={`animate-fade-in pb-16 ${isDesktop ? 'pt-[var(--title-bar-height,38px)]' : ''}`}>
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

                    {/* ── Activity + Reviews — action buttons above overview ── */}
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
                                <ReviewActionButton mediaType={displayType} mediaId={detail.id}/>
                                <AdminActionsMenu mediaId={detail.id} media={detail}/>
                                <AddToListButton mediaItemId={detail.id}/>
                            </InteractionSection>

                            {detail.mediaType === 'game' && (
                                <div className="flex flex-wrap items-center gap-4">
                                    <DownloadGameButton/>
                                </div>
                            )}
                        </>
                    )}

                    {/* Plugin actions (request on your Radarr/Sonarr etc.) — these talk to
                        your own servers via the desktop plugins, so they work without signing in. */}
                    <MediaDetailPluginActions mediaId={detail.id} mediaType={displayType} tmdbId={detail.tmdbId} />

                    <hr className="border-white/5"/>
                    <RatingsSection
                        overallRating={detail.overallRating}
                        overallRatingSource={detail.overallRatingSource}
                        avgRating={detail.avgRating}
                        ratingCount={detail.ratingCount}
                    />

                    {/* ── Reviews — deserves its own glass surface, distinct from main content ── */}
                    <div className="">
                        <DeferredSection
                            fallback={<SectionSkeleton height={120}/>}
                            rootMargin="200px 0px"
                        >
                            <ReviewSection mediaType={displayType} mediaId={detail.id}/>
                        </DeferredSection>

                        <DeferredSection
                            fallback={<SectionSkeleton height={260}/>}
                            rootMargin="400px 0px"
                        >
                            <ReviewsListSection mediaType={displayType} mediaId={detail.id}/>
                        </DeferredSection>
                    </div>

                    <MediaGeneralDetails/>

                    {isMovie(detail) && <MovieSection/>}
                    {isShow(detail) && <ShowSection/>}
                    {isGame(detail) && (
                      <div className="space-y-6">
                        <GameTabBar
                          gameExternalId={gameExternalId || ''}
                          activeTab={activeGameTab}
                          onTabChange={setActiveGameTab}
                          onTabsLoaded={setPluginTabs}
                        />
                        {activeGameTab === 'info' && <GameSection/>}
                        {/* Plugin tabs render their content here */}
                        {activeGameTab !== 'info' && (
                          <>
                            {/* Sub-tabs: Vault | Community */}
                            <div className="flex items-center gap-1 border-b border-white/10 pb-1 mb-6">
                              <button
                                onClick={() => setBlueprintSubTab('vault')}
                                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                                  blueprintSubTab === 'vault'
                                    ? 'bg-primary/10 text-primary'
                                    : 'text-muted-foreground hover:text-white hover:bg-white/5'
                                }`}
                              >
                                Vault
                              </button>
                              <button
                                onClick={() => setBlueprintSubTab('community')}
                                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                                  blueprintSubTab === 'community'
                                    ? 'bg-primary/10 text-primary'
                                    : 'text-muted-foreground hover:text-white hover:bg-white/5'
                                }`}
                              >
                                Community
                              </button>
                            </div>
                            {blueprintSubTab === 'vault' ? (
                              <BlueprintVault
                                pluginId={pluginIdForTab(activeGameTab)}
                                onViewDetail={(bp) => setDetailBlueprint(bp)}
                              />
                            ) : (
                              <BlueprintCommunity
                                pluginId={pluginIdForTab(activeGameTab)}
                                onViewDetail={(bp) => setDetailBlueprint(bp)}
                              />
                            )}
                          </>
                        )}
                        {detailBlueprint && (
                          <BlueprintDetail
                            blueprint={detailBlueprint}
                            onClose={() => setDetailBlueprint(null)}
                            onCopy={(raw) => navigator.clipboard.writeText(raw)}
                            onDelete={(id) => { handleDeleteBlueprint(id); setDetailBlueprint(null) }}
                          />
                        )}
                      </div>
                    )}
                    {isMusic(detail) && <MusicSection/>}
                    {detail.mediaType === 'music' && !detail.album && (
                        <p className="text-center text-sm text-muted-foreground">
                            Album details are still syncing for this release.
                        </p>
                    )}

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
                                                    className="max-h-10 max-w-full object-contain opacity-80"
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
                    <CastCrewList credits={detail.credits}/>
                </DeferredSection>

            </div>
        </div>
    )
}

