import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AuthGate } from '../components/auth-gate'

vi.mock('@ui/organisms/app-loading-screen', () => ({
  AppLoadingScreen: () => <div data-testid="app-loading-screen">Loading Screen</div>,
}))

describe('AuthGate', () => {
  it('renders children underneath AppLoadingScreen overlay', () => {
    render(
      <AuthGate>
        <div data-testid="app-content">App Content</div>
      </AuthGate>,
    )

    expect(screen.getByTestId('app-content')).toBeInTheDocument()
    expect(screen.getByTestId('app-loading-screen')).toBeInTheDocument()
  })
})
