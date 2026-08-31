import {useState, useCallback} from 'react'
import {Link, useParams} from '@tanstack/react-router'
import {Helmet} from 'react-helmet-async'
import {useAuth} from '@auth/hooks/use-auth'
import {Building2} from 'lucide-react'
import {cn} from '@/lib/utils'
import {MediaDetailPluginActions} from '@media/components/organisms/plugin-detail-actions'

import {MediaHero} from '../components/organisms/media-hero'
import {MediaGeneralDetails} from '../components/organisms/media-general-details'
import {SignInCTA} from '../components/organisms/media-signin-cta'
import {MovieSection} from '@media/movie/components/organisms/media-movie-section'
import {ShowSection} from '@media/show/components/organisms/media-show-section'
import {GameSection} from '@media/game/components/organisms/media-game-section'
import {GameTabBar} from '@media/game/components/molecules/media-game-tab-bar'
import {BlueprintVault, type ParsedBlueprint} from '@media/game/components/organisms/media-game-blueprint-vault'
import {BlueprintCommunity} from '@media/game/components/organisms/media-game-blueprint-community'
import {BlueprintDetail} from '@media/game/components/organisms/media-game-blueprint-detail'
import {MusicSection} from '@media/music/components/organisms/media-music-section'
import {ArtistAlbumsSection} from '@media/music/components/organisms/media-artist-albums-section'
import {MoreLikeThisSection} from '../components/organisms/media-more-like-this-section'
import {CastCrewList} from '../components/organisms/media-cast-crew-list'
import {CollectionSection} from '../components/organisms/media-collection-section'
import {DeferredSection} from '@ui/molecules/deferred-section'
import {ReviewSection} from '@/features/review/organisms/review-section'
import {ReviewsListSection} from '@/features/review/organisms/reviews-list-section'
import {RatingsSection} from '@/features/review/organisms/ratings-section'
import {ReviewActionButton} from '@/features/review/molecules/review-action-button'
import {InteractionSection} from '@/features/interaction/molecules/interaction-buttons'
import {WhereToWatchSection} from '../components/organisms/media-where-to-watch-section'
import {SectionSkeleton} from '../components/organisms/media-detail-section-skeleton'
import {DetailSkeleton} from '../components/organisms/media-detail-skeleton'
import {ErrorState} from '../components/organisms/media-detail-error-state'
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

// ── Reusable section card wrapper ─────────────────────────────────
function SectionCard({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
}) {
  return (
    <div
      className={cn('glass-card px-6 py-6 sm:px-8 sm:py-7', className)}
      style={{'--section-delay': `${delay}ms`} as React.CSSProperties}
    >
      {children}
    </div>
  )
}

// ── Section heading ───────────────────────────────────────────────
function SectionHeading({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5 mb-5', className)}>
      <div className="h-4 w-0.5 rounded-full bg-primary/60 shrink-0" />
      <h2 className="text-base font-semibold tracking-tight">{children}</h2>
    </div>
  )
}

export function MediaDetailPage() {
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

    const {data, isError, isPending, isFetching} = useMediaDetail(mediaType, mediaId)
    const isShowDetail = data?.mediaType === 'show'
    const episodeInteractions = useEpisodeInteractions(mediaType, mediaId, {enabled: isShowDetail && isAuthenticated})
    const markShowWatched = useMarkShowWatched(mediaType, mediaId)

    // Route param not available yet during hard refresh — show skeleton, not error
    if (!mediaId) return <DetailSkeleton/>
    if (isPending) return <DetailSkeleton/>
    if (isError || !data) {
      if (isFetching) return <DetailSkeleton/>
      return <ErrorState mediaType={mediaType}/>
    }

    const detail = data
    const year = formatYear(detail.releaseDate)
    const titleWithYear = year ? `${detail.title} (${year})` : detail.title
    const displayType = detail.mediaType as 'movie' | 'show' | 'game' | 'music'
    const gameExternalId = isGame(detail) ? String(detail.game?.steamAppId || detail.id) : null
    const hasMediaSection = isMovie(detail) || isShow(detail) || isGame(detail) || isMusic(detail)
    const hasCompanies = detail.involvedCompanies && detail.involvedCompanies.length > 0

    return (
        <div id="media-detail" className={`animate-fade-in pb-20 ${isDesktop ? 'pt-[var(--title-bar-height,38px)]' : ''}`}>
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

            {/* ── Content sections ── */}
            <div className="flex flex-1 flex-col mx-auto w-full max-w-6xl px-4 sm:px-6 space-y-4 mt-6 relative z-10">

                {/* ─── Card 1: About (Overview + Genres + Trailers) ─── */}
                <SectionCard delay={40}>
                    <SectionHeading>About</SectionHeading>
                    <MediaGeneralDetails/>
                </SectionCard>

                {/* ─── Card 2: Sign-in CTA (unauthenticated) ─── */}
                {!isAuthenticated && (
                    <div className="animate-section-in" style={{'--section-delay': '60ms'} as React.CSSProperties}>
                        <SignInCTA/>
                    </div>
                )}

                {/* ─── Card 3: Interaction + Ratings ─── */}
                <SectionCard delay={80} className="relative overflow-hidden">
                    {/* Ambient primary glow behind actions */}
                    <div
                        className="pointer-events-none absolute inset-0 opacity-[0.04]"
                        style={{
                            background: 'radial-gradient(ellipse 60% 50% at 50% 0%, hsl(var(--primary)) 0%, transparent 100%)',
                        }}
                    />

                    <div className="relative space-y-6">
                        <InteractionSection
                            mediaId={detail.id}
                            mediaType={displayType}
                            userInteractions={isAuthenticated ? detail.userInteractions : null}
                            onShowWatchedToggle={
                                isShowDetail && isAuthenticated
                                    ? (active) => markShowWatched.mutate(active)
                                    : undefined
                            }
                            showEpisodeInfo={
                                isShowDetail && isAuthenticated && episodeInteractions.data
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
                            {isAuthenticated && (
                                <>
                                    <ReviewActionButton mediaType={displayType} mediaId={detail.id}/>
                                    <AdminActionsMenu mediaId={detail.id} media={detail}/>
                                    <AddToListButton mediaItemId={detail.id}/>
                                </>
                            )}
                        </InteractionSection>

                        {isAuthenticated && detail.mediaType === 'game' && (
                            <div className="flex flex-wrap items-center gap-3 px-2">
                                <DownloadGameButton/>
                            </div>
                        )}

                        {/* Plugin actions (request on your Radarr/Sonarr etc.) — these talk to
                            your own servers via the desktop plugins, so they work without signing in. */}
                        <MediaDetailPluginActions mediaId={detail.id} mediaType={displayType} tmdbId={detail.tmdbId} />

                        <div className={cn(isAuthenticated && 'border-t border-white/[0.06] pt-6')}>
                            <RatingsSection
                                overallRating={detail.overallRating}
                                overallRatingSource={detail.overallRatingSource}
                                avgRating={detail.avgRating}
                                ratingCount={detail.ratingCount}
                            />
                        </div>
                    </div>
                </SectionCard>

                {/* ─── Card 4: Your Rating + Reviews ─── */}
                {isAuthenticated && (
                    <SectionCard delay={140} className="space-y-0">
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
                    </SectionCard>
                )}

                {/* ─── Card 5: Media-type specific section ─── */}
                {hasMediaSection && (
                    <SectionCard delay={240} className="space-y-6">
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
                                {activeGameTab !== 'info' && (
                                    <>
                                        <div className="flex items-center gap-1 border-b border-white/[0.08] pb-1">
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
                    </SectionCard>
                )}

                {/* ─── Card 6: Involved Companies ─── */}
                {hasCompanies && (
                    <SectionCard delay={280}>
                        <SectionHeading>Production Companies</SectionHeading>
                        <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                            {detail.involvedCompanies!.map((ic) => {
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
                                        className="glass-inset group flex flex-col items-center gap-3 p-4 text-center transition-all duration-200 hover:scale-[1.02]"
                                    >
                                        {ic.company.logoUrl ? (
                                            <div className="flex h-10 w-10 items-center justify-center">
                                                <img
                                                    src={ic.company.logoUrl}
                                                    alt={ic.company.name}
                                                    className="max-h-10 max-w-full object-contain opacity-70 group-hover:opacity-90 transition-opacity"
                                                />
                                            </div>
                                        ) : (
                                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-muted-foreground group-hover:bg-white/8 transition-colors">
                                                <Building2 className="h-5 w-5"/>
                                            </div>
                                        )}
                                        <div className="min-w-0 w-full">
                                            <p className="text-xs font-semibold truncate group-hover:text-white transition-colors">{ic.company.name}</p>
                                            {roles.length > 0 && (
                                                <p className="mt-0.5 text-[10px] text-muted-foreground">
                                                    {roles.join(' · ')}
                                                </p>
                                            )}
                                        </div>
                                    </Link>
                                )
                            })}
                        </div>
                    </SectionCard>
                )}

                {/* ─── Card 7: Where to Watch ─── */}
                <div
                    className="animate-section-in"
                    style={{'--section-delay': '320ms'} as React.CSSProperties}
                >
                    <WhereToWatchSection/>
                </div>

                {/* ─── Carousels: Collection + Artist Albums ─── */}
                <div
                    className="animate-section-in space-y-6"
                    style={{'--section-delay': '340ms'} as React.CSSProperties}
                >
                    <ArtistAlbumsSection/>
                    {detail.collection && <CollectionSection/>}
                </div>

                {/* ─── Card 8: More Like This ─── */}
                <div
                    className="animate-section-in"
                    style={{'--section-delay': '360ms'} as React.CSSProperties}
                >
                    <MoreLikeThisSection/>
                </div>

                {/* ─── Card 9: Cast & Crew ─── */}
                <div
                    className="animate-section-in"
                    style={{'--section-delay': '380ms'} as React.CSSProperties}
                >
                    <DeferredSection
                        fallback={<SectionSkeleton height={260}/>}
                        rootMargin="400px 0px"
                    >
                        <div className="glass-card">
                            <SectionHeading className="px-6 pt-6 sm:px-8 sm:pt-7 mb-0">Cast & Crew</SectionHeading>
                            <CastCrewList credits={detail.credits}/>
                        </div>
                    </DeferredSection>
                </div>

            </div>
        </div>
    )
}
