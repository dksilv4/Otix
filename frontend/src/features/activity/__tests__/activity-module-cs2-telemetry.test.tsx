import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ActivityModuleCs2Telemetry } from '../components/molecules/activity-module-cs2-telemetry'
import type { Cs2LiveState } from '@/lib/desktop/api'

describe('ActivityModuleCs2Telemetry', () => {
  const baseState: Cs2LiveState = {
    rawMapName: 'de_mirage',
    mapName: 'Mirage',
    activity: 'playing',
    isInGame: true,
    mode: 'competitive',
    phase: 'live',
    round: 15,
    scoreCt: 8,
    scoreT: 7,
    health: 75,
    armor: 95,
    helmet: true,
    team: 'CT',
    kills: 19,
    deaths: 9,
    assists: 4,
    mvps: 3,
    roundKills: 2,
    bombState: null,
    timestamp: Date.now(),
  }

  it('renders map name, round, and live match score', () => {
    render(<ActivityModuleCs2Telemetry state={baseState} />)

    expect(screen.getByText('Mirage')).toBeInTheDocument()
    expect(screen.getByText('(R15)')).toBeInTheDocument()
    expect(screen.getByText('CT 8 : 7 T')).toBeInTheDocument()
  })

  it('renders player vitals, K/D, and MVPs', () => {
    render(<ActivityModuleCs2Telemetry state={baseState} />)

    expect(screen.getByText('75')).toBeInTheDocument()
    expect(screen.getByText('95')).toBeInTheDocument()
    expect(screen.getByText('19K / 9D')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument() // MVPs
    expect(screen.getByText('Playing as CT')).toBeInTheDocument()
  })

  it('renders bomb planted alert when bombState is planted', () => {
    const bombState: Cs2LiveState = {
      ...baseState,
      bombState: 'planted',
    }

    render(<ActivityModuleCs2Telemetry state={bombState} />)

    expect(screen.getByText('Bomb Planted')).toBeInTheDocument()
  })

  it('renders lobby status when player is in menu', () => {
    const lobbyState: Cs2LiveState = {
      ...baseState,
      isInGame: false,
      activity: 'menu',
      playerName: 'S1mple',
    }

    render(<ActivityModuleCs2Telemetry state={lobbyState} />)

    expect(screen.getByTestId('cs2-lobby-telemetry')).toBeInTheDocument()
    expect(screen.getByText('In Lobby')).toBeInTheDocument()
    expect(screen.getByText('S1mple · Waiting for match')).toBeInTheDocument()
  })

  it('renders dead placeholder vitals with 0 HP, 0 AP, and Dead tag when player health is 0', () => {
    const eliminatedState: Cs2LiveState = {
      ...baseState,
      health: 0,
      armor: 0,
      helmet: false,
    }

    render(<ActivityModuleCs2Telemetry state={eliminatedState} />)

    expect(screen.getByText('Dead')).toBeInTheDocument()
    expect(screen.getAllByText('0')).toHaveLength(2) // 0 HP and 0 Armor
    expect(screen.getByText('Health')).toBeInTheDocument()
    expect(screen.getByText('Armor')).toBeInTheDocument()
  })

  it('renders dead placeholder vitals when spectating, isolates player stats, and does not show spectating label', () => {
    const spectatingState: Cs2LiveState = {
      ...baseState,
      isSpectating: true,
      health: 0,
      armor: 0,
      kills: 19,
      deaths: 9,
    }

    render(<ActivityModuleCs2Telemetry state={spectatingState} />)

    // Health and armor section is preserved with dead placeholder
    expect(screen.getByText('Health')).toBeInTheDocument()
    expect(screen.getByText('Armor')).toBeInTheDocument()
    expect(screen.getByText('Dead')).toBeInTheDocument()
    // Local player's own stats are displayed
    expect(screen.getByText('19K / 9D')).toBeInTheDocument()
    // Spectating target is NOT displayed
    expect(screen.queryByText(/Spectating/i)).not.toBeInTheDocument()
  })

  it('renders team scoreboard with authentic CS side colours', () => {
    const { container } = render(<ActivityModuleCs2Telemetry state={baseState} />)

    const ctSpan = container.querySelector('.text-cs2-ct')
    const tSpan = container.querySelector('.text-cs2-t')

    expect(ctSpan).toBeInTheDocument()
    expect(ctSpan?.textContent).toBe('CT 8')
    expect(tSpan).toBeInTheDocument()
    expect(tSpan?.textContent).toBe('7 T')
  })

  it('renders live dynamic guns when loadout is provided', () => {
    const stateWithGuns: Cs2LiveState = {
      ...baseState,
      loadout: {
        primary: 'weapon_awp',
        secondary: 'weapon_deagle',
        knife: 'weapon_knife_karambit',
        activeSlot: 1,
        hasDefuser: false,
        hasBomb: false,
      },
    }

    render(<ActivityModuleCs2Telemetry state={stateWithGuns} />)

    expect(screen.getByText('AWP')).toBeInTheDocument()
    expect(screen.getByText('Desert Eagle')).toBeInTheDocument()
    expect(screen.getByText('Karambit')).toBeInTheDocument()
  })

  it('renders M4A4 cleanly when GSI sends weapon_m4a1 and M4A1-S for weapon_m4a1_silencer', () => {
    const m4a4State: Cs2LiveState = {
      ...baseState,
      loadout: {
        primary: 'weapon_m4a1',
        secondary: 'weapon_hkp2000',
        knife: 'weapon_knife_butterfly',
        activeSlot: 1,
      },
    }

    const { rerender } = render(<ActivityModuleCs2Telemetry state={m4a4State} />)
    expect(screen.getByText('M4A4')).toBeInTheDocument()
    expect(screen.getByText('P2000')).toBeInTheDocument()
    expect(screen.getByText('Butterfly Knife')).toBeInTheDocument()

    const m4a1sState: Cs2LiveState = {
      ...baseState,
      loadout: {
        primary: 'weapon_m4a1_silencer',
        secondary: 'weapon_usp_silencer',
        knife: 'weapon_bayonet',
        activeSlot: 2,
      },
    }

    rerender(<ActivityModuleCs2Telemetry state={m4a1sState} />)
    expect(screen.getByText('M4A1-S')).toBeInTheDocument()
    expect(screen.getByText('USP-S')).toBeInTheDocument()
    expect(screen.getByText('Bayonet')).toBeInTheDocument()
  })

  it('renders empty slot when player has no primary weapon in eco/pistol rounds', () => {
    const pistolRoundState: Cs2LiveState = {
      ...baseState,
      loadout: {
        primary: undefined,
        secondary: 'weapon_glock',
        knife: 'weapon_knife',
        activeSlot: 2,
        hasDefuser: false,
        hasBomb: true,
      },
    }

    render(<ActivityModuleCs2Telemetry state={pistolRoundState} />)

    expect(screen.queryByText('AK-47')).not.toBeInTheDocument()
    expect(screen.queryByText('M4A1-S')).not.toBeInTheDocument()
    expect(screen.getByText('Glock-18')).toBeInTheDocument()
    expect(screen.getByText('Knife')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
