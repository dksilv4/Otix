import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UserXpProgressionBar } from '../components/molecules/user-xp-progression-bar'
import { LEVEL_TIERS } from '../constants'

describe('UserXpProgressionBar', () => {
  it('renders level, title, XP numbers, and percentage correctly', () => {
    const tier = LEVEL_TIERS[0].tier // Transcendent tier

    render(
      <UserXpProgressionBar
        totalXp={15450}
        level={52}
        tier={tier}
        levelTitle="Grandmaster"
        xpRank={42}
        xpPercentile={5}
      />,
    )

    expect(screen.getByText('LVL')).toBeInTheDocument()
    expect(screen.getByText('52')).toBeInTheDocument()
    expect(screen.getByText('Grandmaster')).toBeInTheDocument()
    expect(screen.getByText('15,450')).toBeInTheDocument()
    expect(screen.getByText(/#42/)).toBeInTheDocument()
    expect(screen.getByText(/Top 5%/)).toBeInTheDocument()
  })

  it('renders borderless glass container without inline border styles', () => {
    const tier = LEVEL_TIERS[2].tier // Expert tier

    const { container } = render(
      <UserXpProgressionBar
        totalXp={6200}
        level={21}
        tier={tier}
      />,
    )

    // Ensure zero inline borders exist
    const elementsWithBorder = container.querySelectorAll('[style*="border"]')
    expect(elementsWithBorder.length).toBe(0)
  })
})
