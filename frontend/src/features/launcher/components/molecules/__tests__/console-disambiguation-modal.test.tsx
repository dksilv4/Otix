import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConsoleDisambiguationModal } from '../console-disambiguation-modal'
import type { LocalGame } from '@/features/launcher/types'

describe('ConsoleDisambiguationModal', () => {
  const sampleGame: LocalGame = {
    id: 'game-1',
    title: 'Final Fantasy X',
    exePath: 'C:/ISOs/FFX.iso',
    installDir: 'C:/ISOs',
    platform: 'iso',
  }

  it('renders candidates and allows selecting a console', () => {
    const handleSelect = vi.fn()
    const handleOpenChange = vi.fn()

    render(
      <ConsoleDisambiguationModal
        open={true}
        onOpenChange={handleOpenChange}
        game={sampleGame}
        candidatePlatforms={['ps2', 'gamecube', 'wii']}
        onSelectPlatform={handleSelect}
      />,
    )

    expect(screen.getByText('Select Console')).toBeDefined()
    expect(screen.getByText('Final Fantasy X')).toBeDefined()
    expect(screen.getByText('PlayStation 2')).toBeDefined()
    expect(screen.getByText('GameCube')).toBeDefined()
    expect(screen.getByText('Wii')).toBeDefined()

    const ps2Button = screen.getByText('PlayStation 2').closest('button')
    expect(ps2Button).not.toBeNull()
    fireEvent.click(ps2Button!)

    expect(handleSelect).toHaveBeenCalledWith('ps2')
  })
})
