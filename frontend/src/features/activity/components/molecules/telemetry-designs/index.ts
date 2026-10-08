import type { FC } from 'react'
import type { UniversalGameTelemetry } from '@/features/activity/types/telemetry-types'
import { Cs2SteamTacticalDock } from './cs2-steam-tactical-dock'
import { Cs2TabularScoreboardStrip } from './cs2-tabular-scoreboard-strip'
import { Cs2CompactOperative } from './cs2-compact-operative-hud'
import { Cs2SleekGlassCapsule } from './cs2-sleek-glass-capsule'
import { Cs2TournamentMiniTicker } from './cs2-tournament-mini-ticker'
import { Cs2Source2MinimalConsole } from './cs2-source2-minimal-console'

export {
  Cs2SteamTacticalDock,
  Cs2TabularScoreboardStrip,
  Cs2CompactOperative,
  Cs2SleekGlassCapsule,
  Cs2TournamentMiniTicker,
  Cs2Source2MinimalConsole,
}

export interface TelemetryDesignOption {
  id: string
  title: string
  subtitle: string
  description: string
  tag: string
  component: FC<{ telemetry: UniversalGameTelemetry }>
}

export const TELEMETRY_DESIGNS: TelemetryDesignOption[] = [
  {
    id: 'cs2-steam-tactical-dock',
    title: 'Design 1: Steam Tactical Dock',
    subtitle: 'Minimal footprint + Steam team color pods + loadout & money',
    description:
      'Ultra-compact design inspired by Design 8 and Design 6: features team score pods with official Steam background colors (bg-cs2-ct / bg-cs2-t), active player economy and weapon loadout, and a continuous stats ribbon without individual stat boxes.',
    tag: 'Flagship Steam Dock',
    component: Cs2SteamTacticalDock,
  },
  {
    id: 'cs2-tabular-scoreboard-strip',
    title: 'Design 2: CS2 Tabular Scoreboard Strip',
    subtitle: 'Direct translation of the TAB scoreboard into an ultra-sleek widget',
    description:
      'Combines Steam team background colors, player loadout & money, and an unbroken horizontal tabular scoreboard row with clear numeric stat readouts (no isolated boxes).',
    tag: 'Tabular Ribbon',
    component: Cs2TabularScoreboardStrip,
  },
  {
    id: 'cs2-compact-operative-hud',
    title: 'Design 3: Compact Operative HUD',
    subtitle: 'Full-width vector loadout underneath vitals & money',
    description:
      'Full-width tactical vitals and floating cash above, authentic 3-slot vector weapon silhouettes strip underneath, topped with Steam team score containers and unbroken combat stats.',
    tag: 'Operative HUD',
    component: Cs2CompactOperative,
  },
  {
    id: 'cs2-sleek-glass-capsule',
    title: 'Design 4: Sleek Glass Capsule',
    subtitle: 'Minimalist rounded capsule aesthetic with fluid tracks',
    description:
      'Soft rounded glass capsule styling with Steam team color pods, smooth horizontal energy tracks, integrated economy & weapons, and an inline stat summary.',
    tag: 'Glass Capsule',
    component: Cs2SleekGlassCapsule,
  },
  {
    id: 'cs2-tournament-mini-ticker',
    title: 'Design 5: Tournament Mini-Ticker',
    subtitle: 'Compact broadcast ticker with Steam team backgrounds',
    description:
      'Esports broadcast mini-ticker featuring solid Steam team color containers, integrated money and loadout badges, and a continuous horizontal stat ribbon.',
    tag: 'Broadcast Ticker',
    component: Cs2TournamentMiniTicker,
  },
  {
    id: 'cs2-source2-minimal-console',
    title: 'Design 6: Source 2 Minimalist Console',
    subtitle: 'Dense tactical console with Steam team background pods',
    description:
      'Dark Source 2 console HUD featuring official Steam team background containers, compact tactical vitals, integrated player economy and loadout, and a clean tabular stat strip without boxes.',
    tag: 'Source 2 Console',
    component: Cs2Source2MinimalConsole,
  },
]
