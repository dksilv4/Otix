import { describe, it, expect } from 'vitest'
import { formatCs2MapName, formatCs2Phase, formatCs2Status, isCs2Game } from '../utils/cs2-gsi'

describe('CS2 GSI frontend utils', () => {
  describe('formatCs2MapName', () => {
    it('formats known competitive maps cleanly', () => {
      expect(formatCs2MapName('de_mirage')).toBe('Mirage')
      expect(formatCs2MapName('de_dust2')).toBe('Dust II')
      expect(formatCs2MapName('de_inferno')).toBe('Inferno')
      expect(formatCs2MapName('de_nuke')).toBe('Nuke')
      expect(formatCs2MapName('de_ancient')).toBe('Ancient')
      expect(formatCs2MapName('de_anubis')).toBe('Anubis')
      expect(formatCs2MapName('de_vertigo')).toBe('Vertigo')
      expect(formatCs2MapName('cs_office')).toBe('Office')
    })

    it('formats arbitrary map names', () => {
      expect(formatCs2MapName('de_overpass')).toBe('Overpass')
      expect(formatCs2MapName(null)).toBe('Unknown Map')
      expect(formatCs2MapName('')).toBe('Unknown Map')
    })
  })

  describe('formatCs2Phase', () => {
    it('prioritizes bomb states', () => {
      expect(formatCs2Phase('live', 'planted')).toBe('Bomb Planted')
      expect(formatCs2Phase('live', 'defused')).toBe('Bomb Defused')
      expect(formatCs2Phase('live', 'exploded')).toBe('Bomb Exploded')
    })

    it('formats game phases correctly', () => {
      expect(formatCs2Phase('warmup')).toBe('Warmup')
      expect(formatCs2Phase('intermission')).toBe('Halftime')
      expect(formatCs2Phase('gameover')).toBe('Match Ended')
      expect(formatCs2Phase('live')).toBe('Live')
      expect(formatCs2Phase(null)).toBe('Live')
    })
  })

  describe('formatCs2Status', () => {
    it('formats lobby state when not in game', () => {
      expect(formatCs2Status({ isInGame: false, activity: 'menu' })).toBe('In Lobby (Waiting for match)')
      expect(formatCs2Status(null)).toBe('In Game')
    })

    it('formats live match state when in game', () => {
      expect(formatCs2Status({ isInGame: true, mapName: 'Mirage', scoreCt: 8, scoreT: 7 })).toBe('Mirage (CT 8 : 7 T)')
    })
  })

  describe('isCs2Game', () => {
    it('identifies CS2 and CS:GO processes and titles', () => {
      expect(isCs2Game('Counter-Strike 2')).toBe(true)
      expect(isCs2Game('Counter-Strike: Global Offensive')).toBe(true)
      expect(isCs2Game('cs2.exe')).toBe(true)
      expect(isCs2Game('csgo.exe')).toBe(true)
      expect(isCs2Game('C:/Games/Steam/cs2.exe')).toBe(true)
      expect(isCs2Game('Cyberpunk 2077')).toBe(false)
      expect(isCs2Game(null)).toBe(false)
    })
  })
})
