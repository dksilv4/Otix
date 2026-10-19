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

  it('marks unread notification as read and navigates when card is clicked', () => {
    const onMarkRead = vi.fn()
    render(
      <NotificationCard
        notification={mockNotification}
        onMarkRead={onMarkRead}
        actionCallbacks={mockCallbacks}
      />
    )
    const card = screen.getByRole('button', { name: /new follower/i })
    card.click()
    expect(onMarkRead).toHaveBeenCalledWith('notif-1')
  })

  it('marks unread notification without link as read when clicked', () => {
    const onMarkRead = vi.fn()
    const systemUnread: Notification = {
      id: 'notif-system-unread',
      type: 'system',
      title: 'System alert unread',
      body: 'Maintenance soon',
      metadataJson: {},
      isRead: false,
      createdAt: new Date().toISOString(),
    }
    render(
      <NotificationCard
        notification={systemUnread}
        onMarkRead={onMarkRead}
        actionCallbacks={mockCallbacks}
      />
    )
    const card = screen.getByRole('button', { name: /system alert unread/i })
    card.click()
    expect(onMarkRead).toHaveBeenCalledWith('notif-system-unread')
  })

  it('clicking mark as read button does not trigger card navigation', () => {
    const onMarkRead = vi.fn()
    render(
      <NotificationCard
        notification={mockNotification}
        onMarkRead={onMarkRead}
        actionCallbacks={mockCallbacks}
      />
    )
    const markReadBtn = screen.getByLabelText('Mark as read')
    markReadBtn.click()
    expect(onMarkRead).toHaveBeenCalledWith('notif-1')
  })
})

