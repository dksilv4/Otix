import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { formatEditionName, getEditionYear, getEditionStores } from '../../../utils/editions'
import { GameEditionSelector } from '../../atoms/game-edition-selector'
import { GameEditionsSection } from '../game-editions-section'
import { GameEditionsProvider, useGameEditionsContext } from '../../../contexts/game-editions-context'
import type { GameEdition } from '../../../types'

const mockEditions: GameEdition[] = [
  {
    id: 1,
    name: 'Definitive Edition',
    rawTitle: 'Divinity: Original Sin II - Definitive Edition',
    igdbId: '103337',
    releaseDate: '2018-08-31',
    externalIds: { steam: '380370', gog: '1438078988' },
    summary: 'Master deep, tactical combat in the Definitive Edition.',
    isDefault: false,
  },
  {
    id: 2,
    name: 'Collector’s Edition',
    rawTitle: 'Divinity: Original Sin II - Collector’s Edition',
    igdbId: '103338',
    releaseDate: '2017-09-14',
    externalIds: { steam: '380370' },
    summary: 'Includes digital lorebook and art pack.',
    isDefault: false,
  },
]

describe('Game Editions Utilities', () => {
  it('formats edition name correctly', () => {
    expect(formatEditionName(null, 'Base Game')).toBe('Standard Edition')
    expect(formatEditionName(mockEditions[0], 'Base Game')).toBe('Definitive Edition')
  })

  it('extracts release year correctly', () => {
    expect(getEditionYear('2018-08-31')).toBe('2018')
    expect(getEditionYear(null)).toBeNull()
  })

  it('resolves external store badges', () => {
    const stores = getEditionStores(mockEditions[0].externalIds)
    expect(stores).toHaveLength(2)
    expect(stores.map((s) => s.label)).toEqual(['Steam', 'GOG'])
  })
})

describe('GameEditionSelector', () => {
  it('renders selector trigger button with edition count', () => {
    render(
      <GameEditionSelector
        editions={mockEditions}
        selectedEditionId={null}
        onSelectEdition={vi.fn()}
        baseGameTitle="Divinity: Original Sin II"
        baseReleaseDate="2017-09-14"
      />,
    )

    expect(screen.getByRole('button', { name: /standard edition/i })).toBeInTheDocument()
    expect(screen.getByText('3 Editions')).toBeInTheDocument()
  })

  it('opens menu and selects alternate edition', () => {
    const onSelect = vi.fn()
    render(
      <GameEditionSelector
        editions={mockEditions}
        selectedEditionId={null}
        onSelectEdition={onSelect}
        baseGameTitle="Divinity: Original Sin II"
        baseReleaseDate="2017-09-14"
      />,
    )

    const trigger = screen.getByRole('button', { name: /standard edition/i })
    fireEvent.click(trigger)

    const option = screen.getByRole('option', { name: /definitive edition/i })
    expect(option).toBeInTheDocument()
    fireEvent.click(option)

    expect(onSelect).toHaveBeenCalledWith(1)
  })
})

describe('GameEditionsSection', () => {
  it('renders base game and all edition cards', () => {
    const onSelect = vi.fn()
    render(
      <GameEditionsSection
        editions={mockEditions}
        selectedEditionId={null}
        onSelectEdition={onSelect}
        baseGameTitle="Divinity: Original Sin II"
        baseReleaseDate="2017-09-14"
      />,
    )

    expect(screen.getByText('Available Editions')).toBeInTheDocument()
    expect(screen.getByText('Standard Edition')).toBeInTheDocument()
    expect(screen.getByText('Definitive Edition')).toBeInTheDocument()
    expect(screen.getByText('Collector’s Edition')).toBeInTheDocument()

    const definitiveCard = screen.getByText('Definitive Edition').closest('[role="button"]')
    expect(definitiveCard).toBeInTheDocument()
    fireEvent.click(definitiveCard!)
    expect(onSelect).toHaveBeenCalledWith(1)
  })

  it('returns null if editions array is empty', () => {
    const { container } = render(
      <GameEditionsSection
        editions={[]}
        selectedEditionId={null}
        onSelectEdition={vi.fn()}
        baseGameTitle="Game"
      />,
    )
    expect(container.firstChild).toBeNull()
  })
})

describe('GameEditionsProvider & Context', () => {
  const TestConsumer = () => {
    const ctx = useGameEditionsContext()
    return (
      <div>
        <span data-testid="title">{ctx.activeTitle}</span>
        <button onClick={() => ctx.selectEdition(1)}>Select Definitive</button>
      </div>
    )
  }

  it('provides reactive editions state to child components', () => {
    render(
      <GameEditionsProvider
        editions={mockEditions}
        baseGameTitle="Divinity: Original Sin II"
      >
        <TestConsumer />
      </GameEditionsProvider>,
    )

    expect(screen.getByTestId('title').textContent).toBe('Divinity: Original Sin II')
    fireEvent.click(screen.getByText('Select Definitive'))
    expect(screen.getByTestId('title').textContent).toBe(
      'Divinity: Original Sin II - Definitive Edition',
    )
  })
})
