import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WelcomeCommandPaletteBar } from '../components/molecules/welcome-command-palette-bar'

const mockOpenCommandPalette = vi.fn()
const mockOpenDecideWatch = vi.fn()
const mockNavigate = vi.fn()

vi.mock('@/features/hub', () => ({
  openCommandPalette: () => mockOpenCommandPalette(),
}))

vi.mock('@/features/discover/open-decide-watch', () => ({
  openDecideWatch: () => mockOpenDecideWatch(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

describe('WelcomeCommandPaletteBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders title, shortcut badge, and command chips', () => {
    render(<WelcomeCommandPaletteBar />)

    expect(screen.getByText(/command palette & quick launcher/i)).toBeInTheDocument()
    expect(screen.getByText(/instant access from anywhere/i)).toBeInTheDocument()
    expect(screen.getByText(/⌘K \/ Ctrl\+K/i)).toBeInTheDocument()
    expect(screen.getByText(/decide for me/i)).toBeInTheDocument()
    expect(screen.getByText(/browse movies/i)).toBeInTheDocument()
    expect(screen.getByText(/game launcher/i)).toBeInTheDocument()
  })

  it('triggers openCommandPalette when command bar is clicked', () => {
    render(<WelcomeCommandPaletteBar />)

    const searchBar = screen.getByRole('button', { name: /search titles, jump to pages/i })
    fireEvent.click(searchBar)

    expect(mockOpenCommandPalette).toHaveBeenCalledTimes(1)
  })

  it('triggers openDecideWatch when Decide for me chip is clicked', () => {
    render(<WelcomeCommandPaletteBar />)

    const decideChip = screen.getByRole('button', { name: /decide for me/i })
    fireEvent.click(decideChip)

    expect(mockOpenDecideWatch).toHaveBeenCalledTimes(1)
  })

  it('triggers router navigation when navigation chips are clicked', () => {
    render(<WelcomeCommandPaletteBar />)

    const gameLauncherChip = screen.getByRole('button', { name: /game launcher/i })
    fireEvent.click(gameLauncherChip)

    expect(mockNavigate).toHaveBeenCalledWith({ to: '/launcher' })
  })
})
