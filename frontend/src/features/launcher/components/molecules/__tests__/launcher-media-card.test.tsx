import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LauncherMediaCard } from '../launcher-media-card'
import type { DisplayGame } from '@/features/launcher/types'

const mockNavigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('@ui/molecules/media-card', () => ({
  MediaCard: ({ title, className }: { title: string; className?: string }) => (
    <div data-testid="media-card-mock" className={className}>
      <span>{title}</span>
    </div>
  ),
}))

const sampleGame: DisplayGame = {
  id: 'steam-1091500',
  title: 'Cyberpunk 2077',
  posterUrl: '/poster.jpg',
  platform: 'steam',
  playtime: '12h',
  achievements: '15/45',
  isDefault: false,
}

describe('LauncherMediaCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders card as an accessible button element without illegal nested buttons', () => {
    const { container } = render(<LauncherMediaCard game={sampleGame} />)

    const card = screen.getByRole('button', { name: /cyberpunk 2077/i })
    expect(card).toBeInTheDocument()
    expect(card.tagName.toLowerCase()).toBe('div')
    expect(container.querySelectorAll('button')).toHaveLength(0)
  })

  it('navigates to /launcher/$gameId on click when no onClick is provided', async () => {
    const user = userEvent.setup()
    render(<LauncherMediaCard game={sampleGame} />)

    const card = screen.getByRole('button', { name: /cyberpunk 2077/i })
    await user.click(card)

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/launcher/$gameId',
      params: { gameId: 'steam-1091500' },
    })
  })

  it('triggers custom onClick handler when provided', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    render(<LauncherMediaCard game={sampleGame} onClick={handleClick} />)

    const card = screen.getByRole('button', { name: /cyberpunk 2077/i })
    await user.click(card)

    expect(handleClick).toHaveBeenCalledTimes(1)
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('navigates on Enter and Space keys', async () => {
    const user = userEvent.setup()
    render(<LauncherMediaCard game={sampleGame} />)

    const card = screen.getByRole('button', { name: /cyberpunk 2077/i })
    card.focus()

    await user.keyboard('{Enter}')
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/launcher/$gameId',
      params: { gameId: 'steam-1091500' },
    })

    vi.clearAllMocks()
    await user.keyboard(' ')
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/launcher/$gameId',
      params: { gameId: 'steam-1091500' },
    })
  })
})
