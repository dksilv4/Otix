/** Maps standard CS2 internal map IDs to clean display names */
export const formatCs2MapName = (raw?: string | null): string => {
  if (!raw) return 'Unknown Map'
  const lower = raw.toLowerCase().trim()
  const mapDictionary: Record<string, string> = {
    de_mirage: 'Mirage',
    de_dust2: 'Dust II',
    de_inferno: 'Inferno',
    de_nuke: 'Nuke',
    de_ancient: 'Ancient',
    de_anubis: 'Anubis',
    de_vertigo: 'Vertigo',
    de_overpass: 'Overpass',
    de_train: 'Train',
    de_thera: 'Thera',
    de_mills: 'Mills',
    cs_office: 'Office',
    cs_italy: 'Italy',
  }
  if (mapDictionary[lower]) {
    return mapDictionary[lower]
  }
  return raw
    .replace(/^(de_|cs_|ar_)/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Formats current match or round phase with bomb state */
export const formatCs2Phase = (phase?: string | null, bombState?: string | null): string => {
  if (bombState === 'planted') return 'Bomb Planted'
  if (bombState === 'defused') return 'Bomb Defused'
  if (bombState === 'exploded') return 'Bomb Exploded'

  switch (phase?.toLowerCase()) {
    case 'warmup':
      return 'Warmup'
    case 'intermission':
    case 'halftime':
      return 'Halftime'
    case 'gameover':
      return 'Match Ended'
    case 'freezetime':
      return 'Freeze Time'
    case 'live':
      return 'Live'
    default:
      return phase ? phase.charAt(0).toUpperCase() + phase.slice(1) : 'Live'
  }
}

/** Determines if a game title or process matches Counter-Strike 2 */
export const isCs2Game = (titleOrExe?: string | null): boolean => {
  if (!titleOrExe) return false
  const lower = titleOrExe.toLowerCase()
  return (
    lower.includes('counter-strike') ||
    lower.includes('cs2') ||
    lower.includes('csgo') ||
    lower === 'cs2.exe' ||
    lower === 'csgo.exe'
  )
}

/** Formats a compact status summary for user profile and activity shelf */
export const formatCs2Status = (state?: {
  isInGame?: boolean
  activity?: string
  mapName?: string
  scoreCt?: number
  scoreT?: number
} | null): string => {
  if (!state) return 'In Game'
  if (!state.isInGame || state.activity === 'menu') {
    return 'In Lobby (Waiting for match)'
  }
  const map = state.mapName || 'In Match'
  return `${map} (CT ${state.scoreCt ?? 0} : ${state.scoreT ?? 0} T)`
}
