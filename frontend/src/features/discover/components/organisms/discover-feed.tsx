import { useMemo } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { DiscoverHero } from './discover-hero'
import { DiscoverIntentBar } from '../molecules/discover-intent-bar'
import { DiscoverWelcomeBanner } from '../molecules/discover-welcome-banner'
import { DiscoverFanCarousel } from './discover-fan-carousel'
import { DiscoverContinueWatchingSection } from './discover-continue-watching-section'
import { DiscoverDecideSection } from './discover-decide-section'
import { TrendingSeasonsSection } from './trending-seasons-section'
import { FreeGamesSection } from './free-games-section'
import { DiscoverPlayerActivitySection } from './discover-player-activity-section'
import { DiscoverGenresSection } from './discover-genres-section'
import { MediaSection } from './discover-media-section'
import { DiscoverCustomizeModal } from './discover-customize-modal'
import { useDiscoverSections } from '../../hooks/use-discover-sections'
import { discoverQueries } from '../../queries/discover-queries'

const EXTENDED_RAILS = [
  { title: 'Popular Movies', mediaType: 'movie', listType: 'popular' },
  { title: 'Popular Shows', mediaType: 'show', listType: 'popular' },
  { title: 'Upcoming Games', mediaType: 'game', listType: 'upcoming' },
  { title: 'Best on PC', mediaType: 'game', listType: 'top_rated', platform: 'windows' },
  { title: 'Best on PlayStation 5', mediaType: 'game', listType: 'top_rated', platform: 'playstation-5' },
  { title: 'Best on Xbox Series', mediaType: 'game', listType: 'top_rated', platform: 'xbox-series-x-s' },
  { title: 'Best on Nintendo Switch', mediaType: 'game', listType: 'top_rated', platform: 'nintendo-switch' },
] as const

export const DiscoverFeed = () => {
  const { data: heroData, isFetched } = useInfiniteQuery(discoverQueries.hero())
  const hasFeedContent = useMemo(() => {
    const pages = heroData?.pages ?? []
    return pages.some((p) => {
      const items = (p as { items?: unknown } | undefined)?.items
      return Array.isArray(items) && items.length > 0
    })
  }, [heroData])
  const catalogEmpty = isFetched && !hasFeedContent

  const {
    sections,
    activeIntent,
    setActiveIntent,
    isCustomizeOpen,
    setIsCustomizeOpen,
    toggleSection,
    moveSection,
    applyPreset,
    resetToDefault,
  } = useDiscoverSections()

  const shouldRenderSection = (id: string): boolean => {
    const item = sections.find((s) => s.id === id)
    if (!item || !item.enabled) return false

    // Intent filtering
    if (activeIntent === 'movies') {
      return (
        id === 'trending_movies' ||
        id === 'continue_watching' ||
        id === 'player_activity' ||
        id === 'decide_for_me' ||
        id === 'fan_spotlight' ||
        id === 'genres_explore' ||
        id === 'extended_catalog'
      )
    }
    if (activeIntent === 'shows') {
      return (
        id === 'trending_shows' ||
        id === 'trending_seasons' ||
        id === 'continue_watching' ||
        id === 'player_activity' ||
        id === 'decide_for_me' ||
        id === 'fan_spotlight' ||
        id === 'genres_explore' ||
        id === 'extended_catalog'
      )
    }
    if (activeIntent === 'games') {
      return (
        id === 'free_games' ||
        id === 'gaming_rails' ||
        id === 'decide_for_me' ||
        id === 'fan_spotlight' ||
        id === 'continue_watching' ||
        id === 'player_activity' ||
        id === 'genres_explore' ||
        id === 'extended_catalog'
      )
    }
    if (activeIntent === 'free_games') {
      return id === 'free_games' || id === 'gaming_rails'
    }
    if (activeIntent === 'streamable') {
      return (
        id === 'trending_movies' ||
        id === 'trending_shows' ||
        id === 'extended_catalog' ||
        id === 'continue_watching' ||
        id === 'player_activity' ||
        id === 'decide_for_me'
      )
    }
    return true
  }

  return (
    <div id="discover-feed" className="space-y-10 sm:space-y-12 pb-16">
      {/* 1. Master Hero and Floating Filter Buttons */}
      <div className="space-y-3 sm:space-y-4">
        <DiscoverHero />
        <DiscoverIntentBar
          activeIntent={activeIntent}
          onSelectIntent={setActiveIntent}
          onOpenCustomize={() => setIsCustomizeOpen(true)}
        />
      </div>

      {/* 3. Welcome Banner */}
      <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
        <DiscoverWelcomeBanner />
      </div>

      {/* 4. Modular Sections */}
      {!catalogEmpty && (
        <div className="space-y-12 sm:space-y-14">
          {sections.map((section) => {
            if (!shouldRenderSection(section.id)) return null

            switch (section.id) {
              case 'fan_spotlight':
                return <DiscoverFanCarousel key={section.id} />

              case 'continue_watching':
                return <DiscoverContinueWatchingSection key={section.id} eager />

              case 'player_activity':
                return <DiscoverPlayerActivitySection key={section.id} />

              case 'decide_for_me':
                return <DiscoverDecideSection key={section.id} />

              case 'trending_movies':
                return (
                  <MediaSection
                    key={section.id}
                    title="Trending Movies"
                    mediaType="movie"
                    listType="trending"
                    eager
                    activeIntent={activeIntent}
                  />
                )

              case 'trending_shows':
                return (
                  <MediaSection
                    key={section.id}
                    title="Trending Shows"
                    mediaType="show"
                    listType="trending"
                    eager
                    activeIntent={activeIntent}
                  />
                )

              case 'trending_seasons':
                return <TrendingSeasonsSection key={section.id} eager />

              case 'free_games':
                return <FreeGamesSection key={section.id} />

              case 'gaming_rails':
                return (
                  <div key={section.id} className="space-y-12 sm:space-y-14">
                    <MediaSection
                      title="Now Playing Games"
                      mediaType="game"
                      listType="now_playing"
                      eager
                      activeIntent={activeIntent}
                    />
                    <MediaSection
                      title="Top Rated Games"
                      mediaType="game"
                      listType="top_rated"
                      activeIntent={activeIntent}
                    />
                  </div>
                )

              case 'genres_explore':
                return <DiscoverGenresSection key={section.id} />

              case 'extended_catalog':
                return hasFeedContent ? (
                  <div key={section.id} className="space-y-12 sm:space-y-14">
                    {EXTENDED_RAILS.map((rail) => (
                      <MediaSection
                        key={`${rail.mediaType}-${rail.listType}-${'platform' in rail ? rail.platform : ''}`}
                        title={rail.title}
                        mediaType={rail.mediaType}
                        listType={rail.listType}
                        platform={'platform' in rail ? rail.platform : undefined}
                        activeIntent={activeIntent}
                      />
                    ))}
                  </div>
                ) : null

              default:
                return null
            }
          })}
        </div>
      )}

      {/* 5. Customization Modal */}
      <DiscoverCustomizeModal
        open={isCustomizeOpen}
        onOpenChange={setIsCustomizeOpen}
        sections={sections}
        onToggleSection={toggleSection}
        onMoveSection={moveSection}
        onApplyPreset={applyPreset}
        onResetToDefault={resetToDefault}
      />
    </div>
  )
}
