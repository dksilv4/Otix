import type { TrackOut } from '../queries/media-queries'
import { Clock, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ── Music ──

/** Spotify-style audio feature keys shown on album/track detail */
export const ALBUM_AUDIO_FEATURE_ORDER = [
  ['tempo', 'Tempo'],
  ['energy', 'Energy'],
  ['danceability', 'Dance'],
  ['valence', 'Valence'],
  ['acousticness', 'Acoustic'],
  ['instrumentalness', 'Instrumental'],
  ['liveness', 'Live'],
  ['speechiness', 'Speech'],
] as const

export const EMPTY_TRACKS: TrackOut[] = []

// ── Hero ──

export const GLASS_PILL = 'bg-white/5 hover:bg-white/10 text-white gap-1.5 px-3 py-1.5 text-xs font-semibold backdrop-blur border-0 transition-colors'

// ── Download Game ──

export interface StatusLabelConfig {
  icon: LucideIcon
  label: string
  color: string
}

export const DOWNLOAD_STATUS_LABELS: Record<string, StatusLabelConfig> = {
  queued: { icon: Clock, label: 'Queued in SABnzbd', color: 'text-amber-400' },
  downloading: { icon: Loader2, label: 'Downloading...', color: 'text-blue-400' },
  processing: { icon: Loader2, label: 'Unpacking/Verifying...', color: 'text-purple-400' },
  completed: { icon: CheckCircle2, label: 'Download complete', color: 'text-green-400' },
  failed: { icon: XCircle, label: 'Download failed', color: 'text-red-400' },
}

// ── Episode Modal ──

export const FLIP_TRANSITION = { duration: 0.32, ease: [0.16, 1, 0.3, 1] } as const

// ── Card Layout (Collection / Artist Albums) ──

export const CARD_BASE_ITEM_WIDTH = 160
export const CARD_BASE_GAP = 12         // matches gap-3
