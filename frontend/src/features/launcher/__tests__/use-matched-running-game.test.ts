import { describe, it, expect } from 'vitest'
import { cleanGameTitle } from '../hooks/use-matched-running-game'

describe('cleanGameTitle', () => {
  it('maps known executable signatures to official titles', () => {
    expect(cleanGameTitle('bg3.exe')).toBe("Baldur's Gate 3")
    expect(cleanGameTitle('cyberpunk2077.exe')).toBe('Cyberpunk 2077')
    expect(cleanGameTitle('eldenring.exe')).toBe('Elden Ring')
    expect(cleanGameTitle('rdr2.exe')).toBe('Red Dead Redemption 2')
    expect(cleanGameTitle('c:/games/witcher3/witcher3.exe')).toBe('The Witcher 3: Wild Hunt')
    expect(cleanGameTitle('BloonsTD6.exe')).toBe('Bloons TD 6')
    expect(cleanGameTitle('bloonstd6.exe')).toBe('Bloons TD 6')
    expect(cleanGameTitle('D:\\SteamLibrary\\steamapps\\common\\BloonsTD6\\BloonsTD6.exe')).toBe('Bloons TD 6')
    expect(cleanGameTitle('WardogsClient-Win64-Shipping.exe')).toBe('Wardogs')
    expect(cleanGameTitle('D:\\SteamLibrary\\steamapps\\common\\Wardogs\\Wardogs\\Binaries\\Win64\\WardogsClient-Win64-Shipping.exe')).toBe('Wardogs')
    expect(cleanGameTitle('WardogsLauncher-Shipping.exe')).toBe('Wardogs')
  })

  it('cleans suffixes and format characters for unknown games', () => {
    expect(cleanGameTitle('hollow_knight_dx11.exe')).toBe('Hollow Knight')
    expect(cleanGameTitle('some_awesome_game-win64-shipping.exe')).toBe('some awesome game')
    expect(cleanGameTitle('Dead.Cells.v1.2.exe')).toBe('Dead Cells v1 2')
    expect(cleanGameTitle('TransportFever3')).toBe('Transport Fever 3')
    expect(cleanGameTitle('SupermarketTogether.exe')).toBe('Supermarket Together')
  })
})
