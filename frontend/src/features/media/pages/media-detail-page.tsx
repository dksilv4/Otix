import { useState, useCallback } from 'react'
import { useParams } from '@tanstack/react-router'
import { Helmet } from 'react-helmet-async'
import { useAuth } from '@auth/hooks/use-auth'
import { useQuery } from '@tanstack/react-query'

import { MediaStickyHeader } from '../components/organisms/media-sticky-header'
import { MediaHero } from '../components/organisms/media-hero'
import { MediaStoryline } from '../components/organisms/media-storyline'
import { RatingsHub } from '../components/organisms/media-ratings-hub'
import { WhereToWatch } from '../components/organisms/media-where-to-watch'
import { MediaSpecsCard } from '../components/organisms/media-specs-card'
import { CastCrew } from '../components/organisms/media-cast-crew'
import { MediaDetailPluginLibraryStatus } from '../components/organisms/plugin-detail-actions'
import { useMediaDetailPluginActions } from '../hooks/use-media-detail-plugin-actions'
import { SignInCTA } from '../components/organisms/media-signin-cta'

import { ShowSection } from '@media/show/components/organisms/media-show-section'
import { GameSection } from '@media/game/components/organisms/media-game-section'
import { GameTabBar } from '@media/game/components/molecules/media-game-tab-bar'
import { BlueprintVault, type ParsedBlueprint } from '@media/game/components/organisms/media-game-blueprint-vault'
import { BlueprintCommunity } from '@media/game/components/organisms/media-game-blueprint-community'
import { BlueprintDetail } from '@media/game/components/organisms/media-game-blueprint-detail'
import { MusicSection } from '@media/music/components/organisms/media-music-section'
import { ArtistAlbumsSection } from '@media/music/components/organisms/media-artist-albums-section'
import { MoreLikeThisSection } from '../components/organisms/media-more-like-this-section'
import { CollectionSection } from '../components/organisms/media-collection-section'
import { ReviewsListSection } from '@/features/review/organisms/reviews-list-section'
import { DeferredSection } from '@ui/molecules/deferred-section'
import { SectionSkeleton } from '../components/organisms/media-detail-section-skeleton'
import { DetailSkeleton } from '../components/organisms/media-detail-skeleton'
import { ErrorState } from '../components/organisms/media-detail-error-state'

import {
  formatYear,
  isGame,
  isMusic,
  isShow,
  mediaQueries,
  mediaTypeFromParam,
  seoDescription,
} from '@media'
import { useDesktopPlatform } from '@/lib/desktop/platform'

export function MediaDetailPage() {
  const params = useParams({ strict: false }) as { mediaType?: string; mediaId?: string }
  const mediaType = mediaTypeFromParam(params.mediaType || 'movie')
  const mediaId = params.mediaId || ''

  const { isAuthenticated } = useAuth()
  const { isDesktop } = useDesktopPlatform()
  const [activeGameTab, setActiveGameTab] = useState('info')
  const [pluginTabs, setPluginTabs] = useState<Array<{ tabId: string; pluginId: string }>>([])
  const [detailBlueprint, setDetailBlueprint] = useState<ParsedBlueprint | null>(null)
  const [blueprintSubTab, setBlueprintSubTab] = useState<'vault' | 'community'>('vault')

  const pluginIdForTab = useCallback(
    (tabId: string) => {
      return pluginTabs.find((t) => t.tabId === tabId)?.pluginId || ''
    },
    [pluginTabs],
  )

  const handleDeleteBlueprint = useCallback(
    async (id: string) => {
      const pluginId = pluginIdForTab(activeGameTab)
      if (!pluginId) return
      const api = (window as unknown as Record<string, unknown>).desktopAPI as Record<string, unknown> | undefined
      if (!api?.plugin || typeof api.plugin !== 'object') return
      const plugin = api.plugin as Record<string, unknown>
      if (typeof plugin.callData !== 'function') return
      try {
        await (plugin.callData as (...args: unknown[]) => Promise<Record<string, unknown>>)(
          pluginId,
          'deleteBlueprint',
          { id },
        )
      } catch {
        /* ignore */
      }
    },
    [pluginIdForTab, activeGameTab],
  )

  const { data: detail, isError, isPending, isFetching } = useQuery(
    mediaQueries.detail(mediaType, mediaId),
  )
  const pluginActions = useMediaDetailPluginActions(
    mediaType,
    mediaId,
    detail?.tmdbId,
    Boolean(detail),
  )

  if (!mediaId || isPending) return <DetailSkeleton />
  if (isError || !detail) {
    if (isFetching) return <DetailSkeleton />
    return <ErrorState mediaType={mediaType} />
  }

  const year = formatYear(detail.releaseDate)
  const titleWithYear = year ? `${detail.title} (${year})` : detail.title
  const displayType = detail.mediaType as 'movie' | 'show' | 'game' | 'music'
  const gameExternalId = isGame(detail) ? String(detail.game?.steamAppId || detail.id) : null
  const hasCredits = Boolean(detail.credits && detail.credits.length > 0)

  return (
    <div id="media-detail" className={`animate-fade-in pb-28 ${isDesktop ? 'pt-[var(--title-bar-height,38px)]' : ''}`}>
      {/* ── SEO ── */}
      <Helmet>
        <title>{`${titleWithYear} - Otix`}</title>
        <meta name="description" content={seoDescription(detail.overview, detail.title)} />
        <meta property="og:title" content={`${titleWithYear} - Otix`} />
        <meta property="og:description" content={seoDescription(detail.overview, detail.title)} />
        <meta
          property="og:type"
          content={
            detail.mediaType === 'show'
              ? 'video.tv_show'
              : detail.mediaType === 'music'
                ? 'music.album'
                : 'video.movie'
          }
        />
        {detail.posterUrl && <meta property="og:image" content={detail.posterUrl} />}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${titleWithYear} - Otix`} />
        <meta name="twitter:description" content={seoDescription(detail.overview, detail.title)} />
        {detail.posterUrl && <meta name="twitter:image" content={detail.posterUrl} />}
        <link rel="canonical" href={window.location.origin + `/media/${displayType}/${detail.slug || mediaId}`} />
        {detail.logoUrl && <link rel="preload" as="image" href={detail.logoUrl} fetchPriority="high" />}
      </Helmet>

      {/* ── Sticky Navigation Header (Slides in on scroll) ── */}
      <MediaStickyHeader detail={detail} mediaType={displayType} />


      {/* ── Hero Banner with Distinct Primary CTA & Integrated Genres ── */}
      <MediaHero />

      {/* ══════════════════════════════════════════════════════════════════════
          ADAPTIVE MAIN CONTENT CONTAINER
          Uniform max-w-7xl to avoid awkward width jumps
         ══════════════════════════════════════════════════════════════════════ */}
      <main className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-4 space-y-8">
        {/* ── TV SHOWS: ELEVATE EPISODES & SEASONS BROWSER FRONT-AND-CENTER ── */}
        {isShow(detail) && (
          <section className="glass-card p-6 sm:p-7 space-y-5">
            <ShowSection />
          </section>
        )}

        {/* ── MUSIC: ELEVATE TRACKLIST & ALBUM AUDIO DIRECTLY BENEATH HERO ── */}
        {isMusic(detail) && (
          <section className="glass-card p-6 sm:p-7 space-y-5">
            <MusicSection />
          </section>
        )}

        {/* ── 2-COLUMN BALANCED METADATA & EXPLORATION GRID ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* ════════ LEFT COLUMN (Main Narrative & Personnel, 8 cols) ════════ */}
          <div className="lg:col-span-8 space-y-6">
            {/* Storyline without redundant starring list */}
            <MediaStoryline detail={detail} mediaType={mediaType} />

            {/* Unauthenticated Sign-in CTA */}
            {!isAuthenticated && (
              <div className="animate-fade-in">
                <SignInCTA />
              </div>
            )}

            {/* Games: Blueprints, Vault & Community */}
            {isGame(detail) && (
              <div className="glass-card p-6 sm:p-7 space-y-6">
                <GameTabBar
                  gameExternalId={gameExternalId || ''}
                  activeTab={activeGameTab}
                  onTabChange={setActiveGameTab}
                  onTabsLoaded={setPluginTabs}
                />
                {activeGameTab === 'info' && <GameSection />}
                {activeGameTab !== 'info' && (
                  <>
                    <div className="flex items-center gap-1 border-b border-white/[0.08] pb-1">
                      <button
                        onClick={() => setBlueprintSubTab('vault')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${blueprintSubTab === 'vault'
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:text-white hover:bg-white/5'
                          }`}
                      >
                        Vault
                      </button>
                      <button
                        onClick={() => setBlueprintSubTab('community')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${blueprintSubTab === 'community'
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
                    onDelete={(id) => {
                      handleDeleteBlueprint(id)
                      setDetailBlueprint(null)
                    }}
                  />
                )}
              </div>
            )}

            {/* Cast & Crew V4 with horizontal scroll buttons & full credits modal */}
            {hasCredits && <CastCrew credits={detail.credits} />}

            {/* Franchise / Movie Collections */}
            {detail.collection && (
              <div className="glass-card p-6 sm:p-7">
                <CollectionSection />
              </div>
            )}

            {/* Music Artist Discography */}
            {isMusic(detail) && (
              <div>
                <ArtistAlbumsSection />
              </div>
            )}
          </div>

          {/* ════════ RIGHT COLUMN (Sidebar Hub & Utilities, 4 cols) ════════ */}
          <div className="lg:col-span-4 space-y-6">
            {/* Unified 10-point Ratings Hub V4 */}
            <RatingsHub
              mediaId={detail.id}
              mediaType={displayType}
              overallRating={detail.overallRating}
              overallRatingSource={detail.overallRatingSource}
              avgRating={detail.avgRating}
              ratingCount={detail.ratingCount}
              tmdbId={detail.tmdbId}
              imdbId={detail.movie?.imdbId}
            />

            {/* Where to Watch V4 with Personal Library Spotlight */}
            <WhereToWatch watchProviders={detail.watchProviders} />

            {/* Technical Information & Specs */}
            <MediaSpecsCard detail={detail} />

            {/* Library / Server Status (Plex / Radarr / Sonarr) */}
            {pluginActions.hasLibraryStatus && (
              <div className="glass-card p-5 sm:p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-0.5 rounded-full bg-primary/60 shrink-0" />
                  <h3 className="text-sm font-semibold tracking-tight">Library Server Status</h3>
                </div>
                <MediaDetailPluginLibraryStatus widgets={pluginActions.widgets} />
              </div>
            )}
          </div>
        </div>

        {/* ── Community Reviews Section (On top of More Like This to fill empty space) ── */}
        <DeferredSection fallback={<SectionSkeleton height={260} />} rootMargin="400px 0px">
          <div className="glass-card p-6 sm:p-8">
            <ReviewsListSection mediaType={displayType} mediaId={detail.id} />
          </div>
        </DeferredSection>
      </main>

      {/* ── True Viewport-to-Viewport More Like This Section (Edge-to-Edge, No Masking) ── */}
      <section className="relative z-10 w-full mt-12 mb-6">
        <MoreLikeThisSection className="[mask-image:none] [-webkit-mask-image:none]" />
      </section>
    </div>
  )
}
