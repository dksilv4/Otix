import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createWrapper } from '@/test-utils'
import { ManageFriendModal } from '../components/modals/manage-friend-modal'
import type { Friend } from '../types'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    className,
    onClick,
  }: {
    children: React.ReactNode
    to: string
    params?: Record<string, unknown>
    className?: string
    onClick?: () => void
  }) => (
    <a href={to} data-params={JSON.stringify(params)} className={className} onClick={onClick}>
      {children}
    </a>
  ),
}))

describe('ManageFriendModal', () => {
  const friend: Friend = {
    id: 5,
    username: 'samwise',
    avatarUrl: null,
    friendsSince: '2024-02-14T00:00:00Z',
    bio: 'Loyal companion',
  }

  it('renders friendship details when open', () => {
    const handleOpenChange = vi.fn()

    render(
      <ManageFriendModal
        friend={friend}
        open={true}
        onOpenChange={handleOpenChange}
      />,
      { wrapper: createWrapper() },
    )

    expect(screen.getByText('Friendship Details')).toBeInTheDocument()
    expect(screen.getByText('samwise')).toBeInTheDocument()
    expect(screen.getByText('Friends since Feb 2024')).toBeInTheDocument()
    expect(screen.getByText('Loyal companion')).toBeInTheDocument()
    expect(screen.getByText('View Full Profile')).toBeInTheDocument()
    expect(screen.getByText('Remove Friend')).toBeInTheDocument()
  })

  it('shows confirmation step when remove friend is clicked', () => {
    render(
      <ManageFriendModal
        friend={friend}
        open={true}
        onOpenChange={vi.fn()}
      />,
      { wrapper: createWrapper() },
    )

    const removeBtn = screen.getByText('Remove Friend')
    fireEvent.click(removeBtn)

    expect(screen.getByText('Confirm Remove')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('returns null when friend is null', () => {
    const { container } = render(
      <ManageFriendModal
        friend={null}
        open={true}
        onOpenChange={vi.fn()}
      />,
      { wrapper: createWrapper() },
    )

    expect(container.firstChild).toBeNull()
  })
})
