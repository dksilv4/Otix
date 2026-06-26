import type { LauncherThemeModule } from '../types'

// Organisms
import { LauncherGameHero } from '@/features/launcher/components/organisms/launcher-game-hero'
import { LauncherShelf } from '@/features/launcher/components/organisms/launcher-shelf'
import { LauncherFooter } from '@/features/launcher/components/organisms/launcher-footer'
import { LauncherGameButtons } from '@/features/launcher/components/organisms/launcher-game-buttons'

// Molecules
import { FloatingGameSelector } from '@/features/launcher/components/molecules/launcher-floating-game-selector'
import { ShelfCard } from '@/features/launcher/components/molecules/launcher-shelf-card'
import { LauncherGameStats } from '@/features/launcher/components/molecules/launcher-game-stats'
import { LauncherGameCompanies } from '@/features/launcher/components/molecules/launcher-game-companies'
import { LauncherGameDetailInfo } from '@/features/launcher/components/molecules/launcher-game-detail-info'
import { LauncherEmptyState } from '@/features/launcher/components/molecules/launcher-empty-state'
import { LauncherLoading } from '@/features/launcher/components/molecules/launcher-loading'
import { MatchGameModal } from '@/features/launcher/components/molecules/launcher-match-game-modal'
import { DiskSpaceWidget } from '@/features/launcher/components/molecules/launcher-disk-space-widget'
import { LauncherScanWidget } from '@/features/launcher/components/molecules/launcher-scan-widget'

// Atoms
import GameThumb from '@/features/launcher/components/atoms/launcher-game-thumb'
import { PlayGameButton } from '@/features/launcher/components/atoms/launcher-play-game-button'
import { LauncherPlaytimeStats } from '@/features/launcher/components/atoms/launcher-playtime-stats'
import { LauncherRatingStats } from '@/features/launcher/components/atoms/launcher-rating-stats'
import { LauncherProgressBar } from '@/features/launcher/components/atoms/launcher-progress-bar'

const theme: LauncherThemeModule = {
  default: {
    meta: {
      id: 'default',
      name: 'Otix Dark',
      description: 'The default dark launcher theme with glass-morphism cards and parallax hero.',
      author: 'Otix',
      version: '1.0.0',
      preview: '',
    },
    components: {
      Hero: LauncherGameHero,
      Shelf: LauncherShelf,
      Footer: LauncherFooter,
      GameButtons: LauncherGameButtons,
      FloatingSelector: FloatingGameSelector,
      ShelfCard: ShelfCard,
      GameStats: LauncherGameStats,
      GameCompanies: LauncherGameCompanies,
      GameDetailInfo: LauncherGameDetailInfo,
      EmptyState: LauncherEmptyState,
      LoadingState: LauncherLoading,
      MatchGameModal: MatchGameModal,
      DiskSpaceWidget: DiskSpaceWidget,
      ScanWidget: LauncherScanWidget,
      GameThumb: GameThumb,
      PlayButton: PlayGameButton,
      PlaytimeStats: LauncherPlaytimeStats,
      RatingStats: LauncherRatingStats,
      ProgressBar: LauncherProgressBar,
    },
    tokens: {},
    layout: {
      navPosition: 'left',
      heroHeight: 'full',
      heroParallax: true,
      shelfDensity: 'comfortable',
      showFloatingSelector: true,
      backgroundType: 'gradient',
    },
  },
}

export default theme
