import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NotificationCard } from '../molecules/notification-card'
import type { Notification, ActionCallbacks } from '../../types'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

const mockNotification: Notification = {
  id: 'notif-1',
  type: 'follow',
  title: 'New follower',
  body: 'john_doe followed you',
  metadataJson: { followerUsername: 'john_doe' },
  isRead: false,
  createdAt: new Date().toISOString(),
}

const mockCallbacks: ActionCallbacks = {
  acceptFriendRequest: vi.fn(),
  rejectFriendRequest: vi.fn(),
  acceptListInvitation: vi.fn(),
  declineListInvitation: vi.fn(),
}

describe('NotificationCard', () => {
  it('renders notification title and body', () => {
    render(
      <NotificationCard
        notification={mockNotification}
        onMarkRead={vi.fn()}
        actionCallbacks={mockCallbacks}
      />
    )
    expect(screen.getByText('New follower')).toBeInTheDocument()
    expect(screen.getByText('john_doe followed you')).toBeInTheDocument()
  })

  it('shows unread dot when not read', () => {
    render(
      <NotificationCard
        notification={mockNotification}
        onMarkRead={vi.fn()}
        actionCallbacks={mockCallbacks}
      />
    )
    expect(screen.getByLabelText('Mark as read')).toBeInTheDocument()
  })
})
