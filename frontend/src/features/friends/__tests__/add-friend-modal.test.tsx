import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createWrapper } from '@/test-utils'
import { AddFriendModal } from '../components/modals/add-friend-modal'

vi.mock('@/lib/providers/auth', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'testuser' },
    isAuthenticated: true,
  }),
}))

describe('AddFriendModal', () => {
  it('renders search input when open', () => {
    render(
      <AddFriendModal open={true} onOpenChange={vi.fn()} />,
      { wrapper: createWrapper() },
    )

    expect(screen.getByText('Add Friend')).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText('Type a username...'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Type at least one character to search/i),
    ).toBeInTheDocument()
  })

  it('renders nothing when open is false', () => {
    const { container } = render(
      <AddFriendModal open={false} onOpenChange={vi.fn()} />,
      { wrapper: createWrapper() },
    )

    expect(container.firstChild).toBeNull()
  })
})
