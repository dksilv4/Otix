import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react'
import { useParams, useNavigate, useSearch } from '@tanstack/react-router'
import { Helmet } from 'react-helmet-async'
import { useAuth } from '@auth/hooks/use-auth'
import { useModal } from '@/lib/modals'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MediaManageModal } from '../components/organisms/media-manage-modal'

import { MediaStickyHeader } from '../components/organisms/media-sticky-header'
import { MediaHero } from '../components/organisms/media-hero'
import { MediaStoryline } from '../components/organisms/media-storyline'
import { RatingsHub } from '../components/organisms/media-ratings-hub'
import { WhereToWatch } from '../components/organisms/media-where-to-watch'
import { MediaSpecsCard } from '../components/organisms/media-specs-card'
import { CastCrew } from '../components/organisms/media-cast-crew'
import { GameCharacters } from '../game/components/organisms/game-characters'
import { SignInCTA } from '../components/organisms/media-signin-cta'

import type { ParsedBlueprint } from '@media/game/components/organisms/media-game-blueprint-vault'

const ShowSection = lazy(() =>
  import('@media/show/components/organisms/media-show-section').then((m) => ({ default: m.ShowSection })),
)
const MoreLikeThisSection = lazy(() =>
  import('../components/organisms/media-more-like-this-section').then((m) => ({ default: m.MoreLikeThisSection })),
)
const CollectionSection = lazy(() =>
  import('../components/organisms/media-collection-section').then((m) => ({ default: m.CollectionSection })),
)
const ReviewsListSection = lazy(() =>
  import('@/features/review/organisms/reviews-list-section').then((m) => ({ default: m.ReviewsListSection })),
)
const MediaDetailLibraryPanel = lazy(() =>
  import('../components/organisms/media-detail-library-panel').then((m) => ({ default: m.MediaDetailLibraryPanel })),
)
const GameSection = lazy(() =>
  import('@media/game/components/organisms/media-game-section').then((m) => ({ default: m.GameSection })),
)
const GameTabBar = lazy(() =>
  import('@media/game/components/molecules/media-game-tab-bar').then((m) => ({ default: m.GameTabBar })),
)
const BlueprintVault = lazy(() =>
  import('@media/game/components/organisms/media-game-blueprint-vault').then((m) => ({ default: m.BlueprintVault })),
)
const BlueprintCommunity = lazy(() =>
  import('@media/game/components/organisms/media-game-blueprint-community').then((m) => ({
    default: m.BlueprintCommunity,
  })),
)
const BlueprintDetail = lazy(() =>
  import('@media/game/components/organisms/media-game-blueprint-detail').then((m) => ({ default: m.BlueprintDetail })),
)
const MusicSection = lazy(() =>
  import('@media/music/components/organisms/media-music-section').then((m) => ({ default: m.MusicSection })),
)
const ArtistAlbumsSection = lazy(() =>
  import('@media/music/components/organisms/media-artist-albums-section').then((m) => ({
    default: m.ArtistAlbumsSection,
  })),
)
import { DeferredSection } from '@ui/molecules/deferred-section'
import { SectionSkeleton } from '../components/organisms/media-detail-section-skeleton'
import { DetailSkeleton } from '../components/organisms/media-detail-skeleton'
import { ErrorState } from '../components/organisms/media-detail-error-state'

import { mediaQueries } from '../queries/media-queries'
import {
  formatYear,
  isGame,
  isMusic,
  isShow,
  mediaTypeFromParam,
  seoDescription,
} from '../utils'
import { useDesktopPlatform } from '@/lib/desktop/platform'

export function MediaDetailPage() {
  const params = useParams({ strict: false }) as { mediaType?: string; mediaId?: string }
  const mediaType = mediaTypeFromParam(params.mediaType || 'movie')
  const mediaId = params.mediaId || ''

  const search = useSearch({ strict: false }) as { manage?: boolean; season?: number }
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuth()
  const queryClient = useQueryClient()
  const { openModal } = useModal()
  const closeManageModalRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (search?.manage && user?.isAdmin && !closeManageModalRef.current) {
      const close = openModal(
        <MediaManageModal
          mediaType={mediaType}
          mediaId={mediaId}
          onClose={() => {
            close()
            closeManageModalRef.current = null
            void (navigate as any)({
              to: '/media/$mediaType/$mediaId',
              params: { mediaType, mediaId },
              search: search.season ? { season: search.season } : {},
              replace: true,
            })
          }}
        />
      )
      closeManageModalRef.current = close
    }
  }, [search?.manage, user?.isAdmin, mediaType, mediaId, search?.season, openModal, navigate])

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

  useEffect(() => {
    const otixId = detail?.id ? String(detail.id) : null
    if (otixId && otixId !== mediaId) {
      const canonicalType = (detail.mediaType || mediaType) as 'movie' | 'show' | 'game' | 'music'
      queryClient.setQueryData(mediaQueries.detail(canonicalType, otixId).queryKey, detail)
      void (navigate as any)({
        to: '/media/$mediaType/$mediaId',
        params: { mediaType: canonicalType, mediaId: otixId },
        search: (search || {}) as any,
        replace: true,
      })
    }
  }, [detail, mediaId, mediaType, navigate, queryClient, search])

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
  const hasCharacters = Boolean(detail.characters && detail.characters.length > 0)

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
            <Suspense fallback={<SectionSkeleton height={220} />}>
              <ShowSection />
            </Suspense>
          </section>
        )}

        {/* ── MUSIC: ELEVATE TRACKLIST & ALBUM AUDIO DIRECTLY BENEATH HERO ── */}
        {isMusic(detail) && (
          <section className="glass-card p-6 sm:p-7 space-y-5">
            <Suspense fallback={<SectionSkeleton height={220} />}>
              <MusicSection />
            </Suspense>
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
                <Suspense fallback={<SectionSkeleton height={220} />}>
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
                </Suspense>
              </div>
            )}

            {/* Game Characters */}
            {hasCharacters && <GameCharacters characters={detail.characters} />}

            {/* Cast & Crew V4 with horizontal scroll buttons & full credits modal */}
            {hasCredits && <CastCrew credits={detail.credits} />}

            {/* Franchise / Movie Collections */}
            {detail.collection && (
              <div className="glass-card p-6 sm:p-7">
                <Suspense fallback={<SectionSkeleton height={180} />}>
                  <CollectionSection />
                </Suspense>
              </div>
            )}

            {/* Music Artist Discography */}
            {isMusic(detail) && (
              <div>
                <Suspense fallback={<SectionSkeleton height={180} />}>
                  <ArtistAlbumsSection />
                </Suspense>
              </div>
            )}
          </div>

          {/* ════════ RIGHT COLUMN (Sidebar Hub & Utilities, 4 cols) ════════ */}
          <div className="lg:col-span-4 space-y-6">
            {/* Unified 10-point Ratings Hub V4 */}
            <RatingsHub
              mediaId={String(detail.id)}
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
            {isAuthenticated && (
              <Suspense fallback={null}>
                <MediaDetailLibraryPanel
                  mediaType={mediaType}
                  mediaId={detail.id ? String(detail.id) : (detail.slug || mediaId)}
                  tmdbId={detail.tmdbId}
                />
              </Suspense>
            )}
          </div>
        </div>

        {/* ── Community Reviews Section (On top of More Like This to fill empty space) ── */}
        <DeferredSection fallback={<SectionSkeleton height={260} />} rootMargin="400px 0px">
          <div className="glass-card p-6 sm:p-8">
            <Suspense fallback={<SectionSkeleton height={260} />}>
              <ReviewsListSection mediaType={displayType} mediaId={String(detail.id)} />
            </Suspense>
          </div>
        </DeferredSection>
      </main>

      {/* ── True Viewport-to-Viewport More Like This Section (Edge-to-Edge, No Masking) ── */}
      <DeferredSection fallback={<SectionSkeleton height={220} />} rootMargin="480px 0px">
        <section className="relative z-10 w-full mt-12 mb-6">
          <Suspense fallback={<SectionSkeleton height={220} />}>
            <MoreLikeThisSection className="[mask-image:none] [-webkit-mask-image:none]" />
          </Suspense>
        </section>
      </DeferredSection>
    </div>
  )
}
