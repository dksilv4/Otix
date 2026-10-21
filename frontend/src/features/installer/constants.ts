import type { CarouselSlide } from './types'

export const REQUIRED_DISK_SPACE_BYTES = 450 * 1024 * 1024 // 450 MB

export const INSTALLER_CAROUSEL_SLIDES: CarouselSlide[] = [
  {
    id: 'library',
    title: 'Unified Game Library',
    subtitle: 'Consolidate games from Steam, Epic, GOG, and custom local installations into one seamless collection.',
    iconName: 'gamepad',
  },
  {
    id: 'performance',
    title: 'Instant Execution & Tracking',
    subtitle: 'Lightning-fast game launches, automatic process detection, and accurate playtime telemetry.',
    iconName: 'zap',
  },
  {
    id: 'cloud',
    title: 'Automatic Cloud Saves',
    subtitle: 'Safeguard your progress with automatic save backups and seamless multi-device synchronization.',
    iconName: 'cloud',
  },
  {
    id: 'plugins',
    title: 'Extensible Ecosystem',
    subtitle: 'Supercharge your gaming client with community extensions, custom trackers, and rich metadata.',
    iconName: 'blocks',
  },
]
