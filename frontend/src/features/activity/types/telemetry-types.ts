export interface TelemetryTeamScore {
  label: string
  score: number
  side?: 'attack' | 'defense' | 'home' | 'away' | string
}

export interface TelemetryVitals {
  health?: number
  armor?: number
  resource?: number
  hasSecondaryArmor?: boolean
  resourceLabel?: string
}

export interface TelemetryStatItem {
  label: string
  value: string | number
  iconType?: 'crosshair' | 'deaths' | 'assists' | 'trophy' | 'speed' | 'lap' | 'score' | 'rank' | 'gold' | 'flag'
}

export interface UniversalGameTelemetry {
  id: string
  gameTitle: string
  activity: 'lobby' | 'match' | 'menu'
  playerName?: string
  mapOrZone?: string
  roundOrLap?: string | number
  mode?: string
  phase?: string
  scores?: {
    teamA: TelemetryTeamScore
    teamB?: TelemetryTeamScore
  }
  vitals?: TelemetryVitals
  stats?: TelemetryStatItem[]
  summaryKda?: string
  statusSide?: string
  alert?: {
    type: 'danger' | 'warning' | 'info' | 'success'
    text: string
  }
  isSpectating?: boolean
  spectatingPlayerName?: string
  money?: number
  loadout?: {
    primary?: string
    secondary?: string
    knife?: string
    activeWeapon?: string
    activeSlot?: 1 | 2 | 3 | 'c4'
    grenades?: string[]
    hasDefuser?: boolean
    hasBomb?: boolean
  }
  matchResult?: {
    isCompleted: boolean
    isWin?: boolean
    kills?: number
    deaths?: number
    assists?: number
    kdr?: number
  }
  timestamp: number
}
