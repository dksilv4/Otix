import { useState, useEffect, Suspense } from 'react'
import { isDesktop } from '@/lib/desktop/api'
import { safeLazy } from '@/lib/utils/chunk-reload'

const CommandPaletteMount = safeLazy(() =>
  import('@/features/hub/components/command-palette-mount').then((m) => ({
    default: m.CommandPaletteMount,
  })),
)
const DecideWatchHost = safeLazy(() =>
  import('@/features/discover/components/organisms/decide-watch-host').then((m) => ({
    default: m.DecideWatchHost,
  })),
)
const FeatureSpotlightHost = safeLazy(() =>
  import('@/features/spotlight/components/organisms/feature-spotlight-host').then((m) => ({
    default: m.FeatureSpotlightHost,
  })),
)
const LevelUpHost = safeLazy(() =>
  import('@user/components/organisms/level-up-host').then((m) => ({
    default: m.LevelUpHost,
  })),
)
const GamingXpHost = safeLazy(() =>
  import('@/features/launcher/components/organisms/gaming-xp-host').then((m) => ({
    default: m.GamingXpHost,
  })),
)
const IndexerSearchHost = safeLazy(() =>
  import('@/features/downloads/molecules/indexer-search-host').then((m) => ({
    default: m.IndexerSearchHost,
  })),
)
const GlobalMusicBar = safeLazy(() =>
  import('@/features/music/components/molecules/global-music-bar').then((m) => ({
    default: m.GlobalMusicBar,
  })),
)
const GlobalDropOverlay = safeLazy(() =>
  import('@/features/drop/components/organisms/global-drop-overlay').then((m) => ({
    default: m.GlobalDropOverlay,
  })),
)
const UpdateNotificationToast = safeLazy(() =>
  import('@/features/updater/components/update-notification-toast').then((m) => ({
    default: m.UpdateNotificationToast,
  })),
)
const UpdateModal = safeLazy(() =>
  import('@/features/updater/components/update-modal').then((m) => ({
    default: m.UpdateModal,
  })),
)
const ReleaseNotesModal = safeLazy(() =>
  import('@/features/updater/components/release-notes-modal').then((m) => ({
    default: m.ReleaseNotesModal,
  })),
)

export const DeferredHosts = () => {
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        setIsReady(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const handle = (window as any).requestIdleCallback(
        () => setIsReady(true),
        { timeout: 2500 }
      )
      return () => {
        window.removeEventListener('keydown', handleKeyDown)
        ;(window as any).cancelIdleCallback(handle)
      }
    }

    const timer = setTimeout(() => setIsReady(true), 2000)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      clearTimeout(timer)
    }
  }, [])

  if (!isReady) return null

  return (
    <Suspense fallback={null}>
      <CommandPaletteMount />
      <DecideWatchHost />
      <FeatureSpotlightHost />
      <LevelUpHost />
      <GamingXpHost />
      <IndexerSearchHost />
      <GlobalMusicBar />
      <GlobalDropOverlay />
      {isDesktop() && (
        <>
          <UpdateNotificationToast />
          <UpdateModal />
          <ReleaseNotesModal />
        </>
      )}
    </Suspense>
  )
};
