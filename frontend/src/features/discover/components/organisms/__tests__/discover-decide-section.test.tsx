import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DiscoverDecideSection } from '../discover-decide-section'

const mockOpenDecideWatch = vi.fn()
vi.mock('@discover/open-decide-watch', () => ({
  openDecideWatch: () => mockOpenDecideWatch(),
}))

describe('DiscoverDecideSection', () => {
  it('renders section title and quick action options', () => {
    render(<DiscoverDecideSection />)

    expect(screen.getByRole('heading', { level: 2, name: /can't decide what to watch or play\?/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /roll the dice/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /movie night/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /binge series/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /next game/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /surprise me/i })).toBeInTheDocument()
  })

  it('triggers openDecideWatch when action buttons are clicked', async () => {
    const user = userEvent.setup()
    render(<DiscoverDecideSection />)

    mockOpenDecideWatch.mockClear()
    const rollBtn = screen.getByRole('button', { name: /roll the dice/i })
    await user.click(rollBtn)
    expect(mockOpenDecideWatch).toHaveBeenCalledTimes(1)

    const movieBtn = screen.getByRole('button', { name: /movie night/i })
    await user.click(movieBtn)
    expect(mockOpenDecideWatch).toHaveBeenCalledTimes(2)
  })
})
