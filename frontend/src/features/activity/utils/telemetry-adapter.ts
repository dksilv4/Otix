import type { Cs2LiveState } from '@/lib/desktop/api'
import type { UniversalGameTelemetry, TelemetryStatItem } from '../types/telemetry-types'
import { formatCs2Phase } from '@/features/launcher'

/**
 * Normalizes Counter-Strike 2 Game State Integration (GSI) data into UniversalGameTelemetry.
 */
export const cs2ToUniversalTelemetry = (
  state: Cs2LiveState | null
): UniversalGameTelemetry | null => {
  if (!state) return null

  const isLobby = !state.isInGame || state.activity === 'menu'
  const isSpectating = Boolean(state.isSpectating)
  const phaseLabel = formatCs2Phase(state.phase, state.bombState)

  let alert: UniversalGameTelemetry['alert'] = undefined
  if (state.bombState === 'planted') {
    alert = { type: 'danger', text: 'Bomb Planted' }
  } else if (state.bombState === 'defused') {
    alert = { type: 'success', text: 'Bomb Defused' }
  }

  // Detect match completion and win outcome for local user
  const isCompleted = state.phase === 'gameover'
  let isWin: boolean | undefined = undefined
  if (isCompleted && state.team) {
    const teamUpper = state.team.toUpperCase()
    if (teamUpper === 'CT') {
      isWin = state.scoreCt > state.scoreT
    } else if (teamUpper === 'T') {
      isWin = state.scoreT > state.scoreCt
    }
  }

  const kdr = Number((state.kills / Math.max(state.deaths, 1)).toFixed(2))

  const stats: TelemetryStatItem[] = [
    { label: 'Kills', value: state.kills, iconType: 'crosshair' },
    { label: 'Deaths', value: state.deaths, iconType: 'deaths' },
    { label: 'Assists', value: state.assists, iconType: 'assists' },
    { label: 'MVPs', value: state.mvps, iconType: 'trophy' },
  ]

  // NEVER show health/armor of a spectated player as the user's vitals!
  const vitals = isSpectating
    ? undefined
    : {
        health: state.health,
        armor: state.armor,
        hasSecondaryArmor: state.helmet,
      }

  const statusSide = state.team ? `Playing as ${state.team}` : undefined

  return {
    id: 'cs2',
    gameTitle: 'Counter-Strike 2',
    activity: isLobby ? 'lobby' : 'match',
    playerName: state.playerName,
    mapOrZone: state.mapName,
    roundOrLap: state.round > 0 ? state.round : undefined,
    mode: state.mode,
    phase: phaseLabel,
    scores: {
      teamA: { label: 'CT', score: state.scoreCt },
      teamB: { label: 'T', score: state.scoreT },
    },
    vitals,
    stats,
    summaryKda: `${state.kills}K / ${state.deaths}D`,
    statusSide,
    money: state.money,
    loadout: state.loadout,
    alert,
    isSpectating,
    matchResult: {
      isCompleted,
      isWin,
      kills: state.kills,
      deaths: state.deaths,
      assists: state.assists,
      kdr,
    },
    timestamp: state.timestamp,
  }
}
