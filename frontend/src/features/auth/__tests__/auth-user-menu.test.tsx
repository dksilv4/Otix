import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UserMenu } from '../components/organisms/auth-user-menu'
import { PanelProvider } from '@/features/activity/providers/panel-context'

vi.mock('@auth/hooks/use-auth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/features/launcher', () => ({
  useRunningGame: () => ({ runningGame: null, elapsedMs: 0 }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}))

import { useAuth } from '@auth/hooks/use-auth'

const renderWithContext = (ui: React.ReactNode) => {
  return render(<PanelProvider>{ui}</PanelProvider>)
}

describe('UserMenu with XPProgressRing', () => {
  it('renders circular XP progress bar around avatar in bare right nav mode', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: '1',
        email: 'user@example.com',
        username: 'testgamer',
        totalXp: 450, // Level 2 (300 XP per level, 150/300 into level 2 -> 50%)
        isVerified: true,
        twoFactorEnabled: false,
      },
      isAuthenticated: true,
      isLoading: false,
      logout: vi.fn(),
      login: vi.fn(),
      verifyTwoFactor: vi.fn(),
      cancelTwoFactor: vi.fn(),
      register: vi.fn(),
      refreshUser: vi.fn(),
      twoFactorChallenge: null,
    })

    renderWithContext(<UserMenu bare />)

    const button = screen.getByRole('button', { name: /User menu, Level 2/i })
    expect(button).toBeInTheDocument()
    expect(button).toHaveAttribute('title', expect.stringContaining('Level 2'))

    // SVG circular progress ring elements
    const svg = button.querySelector('svg')
    expect(svg).toBeInTheDocument()
    const circles = button.querySelectorAll('circle')
    expect(circles.length).toBe(2) // 1 track circle + 1 progress arc
  })

  it('renders sign in button when not authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      logout: vi.fn(),
      login: vi.fn(),
      verifyTwoFactor: vi.fn(),
      cancelTwoFactor: vi.fn(),
      register: vi.fn(),
      refreshUser: vi.fn(),
      twoFactorChallenge: null,
    })

    renderWithContext(<UserMenu bare />)

    expect(screen.getByText('Sign In')).toBeInTheDocument()
  })
})
