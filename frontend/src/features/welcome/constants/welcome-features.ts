import type { ComponentType } from 'react'
import {
  Compass,
  Library,
  Gamepad2,
  Download,
  Trophy,
  Puzzle,
} from 'lucide-react'

export interface WelcomeFeatureHighlight {
  title: string
  description: string
}

export interface WelcomeFeature {
  id: 'discover' | 'library' | 'launcher' | 'downloads' | 'progression' | 'integrations'
  title: string
  tagline: string
  shortDescription: string
  fullDescription: string
  icon: ComponentType<{ className?: string }>
  route: string
  routeLabel: string
  tags?: string[]
  highlights: WelcomeFeatureHighlight[]
  proTip: string
  shortcutHint?: string
  colorToken: string
}

export const WELCOME_FEATURES: WelcomeFeature[] = [
  {
    id: 'discover',
    title: 'Discover & Recommendations',
    tagline: 'Personalized recommendations across cinema, television, and gaming',
    shortDescription:
      'Explore trending titles, upcoming releases, and tailored picks shaped by your taste.',
    fullDescription:
      'Discover is your personal entertainment feed. It curates movies, series, and games tailored to your preferences, helping you explore new titles, watch trailers, and decide what to experience next.',
    icon: Compass,
    route: '/',
    routeLabel: 'Explore Discover',
    colorToken: 'var(--primary)',
    highlights: [
      {
        title: 'Decide For Me',
        description:
          'Quickly pick what to watch or play based on available time, genres, and your taste.',
      },
      {
        title: 'Unified Browsing',
        description:
          'Browse cinema, shows, and games side-by-side in one coherent, fluid interface.',
      },
      {
        title: 'Media Previews',
        description:
          'Watch trailers, review ratings, and find where titles are available to stream or play.',
      },
    ],
    proTip: 'Open the Command Palette anytime to launch the quick recommendation picker.',
    shortcutHint: 'Cmd+K → Decide for me',
  },
  {
    id: 'library',
    title: 'Unified Library',
    tagline: 'All your media, games, and storage locations in one collection',
    shortDescription:
      'Gather titles across your game stores, media servers, and local storage into a unified gallery.',
    fullDescription:
      'Your collection often spans multiple platforms and servers. The Unified Library brings everything together into a clean, synchronized wall with automatic artwork, summaries, and play statuses.',
    icon: Library,
    route: '/library',
    routeLabel: 'Open Library',
    colorToken: 'var(--media-show)',
    highlights: [
      {
        title: 'Multi-Source Sync',
        description:
          'Aggregate titles from linked accounts, personal media servers, and disk folders.',
      },
      {
        title: 'Rich Artwork & Details',
        description:
          'Enjoy high-resolution posters, backdrops, and complete cast and summary metadata.',
      },
      {
        title: 'Filtering & Search',
        description:
          'Sort and filter your entire collection by format, release year, install state, or personal tags.',
      },
    ],
    proTip: 'Filter by specific storage locations or browse your complete collection as a single wall.',
  },
  {
    id: 'launcher',
    title: 'Gaming Launcher',
    tagline: 'Launch desktop titles, track hours, and manage installations',
    shortDescription:
      'Native game launching with automated playtime tracking, title matching, and disc image mounting.',
    fullDescription:
      'The launcher scans your local game directories, automatically identifies your titles with artwork, tracks live play sessions, and captures match statistics for supported games.',
    icon: Gamepad2,
    route: '/launcher',
    routeLabel: 'Open Launcher',
    colorToken: 'var(--media-game)',
    highlights: [
      {
        title: 'Automatic Title Matching',
        description:
          'Recognizes game folders and executables, attaching posters, summaries, and requirements.',
      },
      {
        title: 'Live Session Tracking',
        description:
          'Measures exact play sessions and awards gamer progression points while you play.',
      },
      {
        title: 'Disc & Image Handling',
        description:
          'Mount disc images and run installers directly within the app interface.',
      },
    ],
    proTip: 'Add custom game folder paths in Settings to keep your offline collection organized.',
  },
  {
    id: 'downloads',
    title: 'Background Node & Downloads',
    tagline: 'Distributed background tasks, hardware telemetry, and download management',
    shortDescription:
      'Coordinate media managers, query indexers, and monitor system resources seamlessly.',
    fullDescription:
      'A lightweight companion worker runs background jobs, tracks system metrics such as memory and storage headroom, and coordinates with your automated download clients and media managers.',
    icon: Download,
    route: '/settings/downloads',
    routeLabel: 'Configure Downloads',
    colorToken: 'var(--primary)',
    highlights: [
      {
        title: 'System Telemetry',
        description:
          'Keep an eye on processor load, memory usage, and storage headroom in real time.',
      },
      {
        title: 'Manager Orchestration',
        description:
          'Connect your download clients and automation managers to track queues in one place.',
      },
      {
        title: 'Companion Daemon',
        description:
          'Run the background helper on your desktop or server for responsive file operations.',
      },
    ],
    proTip: 'Check the Downloads tab in Settings to connect your download clients or install the worker.',
  },
  {
    id: 'progression',
    title: 'Progression & Activity',
    tagline: 'Earn experience points, unlock ranks, and showcase favorites',
    shortDescription:
      'Level up through entertainment milestones, publish reviews, and curate custom collections.',
    fullDescription:
      'Track your journey across movies, series, and games. Gain experience points for logging activity, writing reviews, and completing play sessions, leveling up through distinct tiers.',
    icon: Trophy,
    route: '/settings/profile',
    routeLabel: 'View Profile',
    colorToken: 'var(--media-music)',
    highlights: [
      {
        title: 'Ranks & Progress Rings',
        description:
          'Gain experience points through watches and play sessions to unlock higher tiers.',
      },
      {
        title: 'Showcase Picks',
        description:
          'Highlight your all-time favorite movie, series, and video game on your profile.',
      },
      {
        title: 'Lists & Reviews',
        description:
          'Write formatted reviews, rate titles, and compile customized collections.',
      },
    ],
    proTip: 'Click your avatar at any time to check your current level and progress toward the next tier.',
  },
  {
    id: 'integrations',
    title: 'Connections & Plugins',
    tagline: 'Link external services and extend functionality with modular plugins',
    shortDescription:
      'Connect external accounts for two-way sync, backup preferences, and enable superpowers.',
    fullDescription:
      'Connect your external accounts and cloud backups to keep your libraries synchronized. Modular plugins let you extend the interface with gameplay capture, custom utilities, and community enhancements.',
    icon: Puzzle,
    route: '/settings/integrations',
    routeLabel: 'Manage Connections',
    colorToken: 'var(--media-movie)',
    highlights: [
      {
        title: 'Single-Sign-On & Linking',
        description:
          'Link external accounts to synchronize library items, ratings, and watch progress.',
      },
      {
        title: 'Cloud Backups',
        description:
          'Safely backup your preferences, watch history, and playlists to cloud storage.',
      },
      {
        title: 'Modular Extensions',
        description:
          'Enable specialized plugins for performance overlays, blueprints, and custom widgets.',
      },
    ],
    proTip: 'Visit Connections in Settings to manage active links or install new plugins.',
  },
]
