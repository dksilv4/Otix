import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ActivityModuleNotifications } from '../components/molecules/activity-module-notifications'

const mockNavigate = vi.fn()
const mockMarkReadMutate = vi.fn()
const mockMarkAllReadMutate = vi.fn()

const sampleNotifications = [
  {
    id: 'notif-1',
    type: 'follow',
    title: 'New follower',
    body: 'john_doe followed you',
    metadataJson: { followerUsername: 'john_doe' },
    isRead: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'notif-2',
    type: 'system',
    title: 'System alert',
    body: 'Maintenance notice',
    metadataJson: {},
    isRead: false,
    createdAt: new Date().toISOString(),
  },
]

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  Link: ({
    children,
    to,
    onClick,
    className,
  }: {
    children: React.ReactNode
    to: string
    onClick?: () => void
    className?: string
  }) => (
    <a href={to} onClick={onClick} className={className}>
      {children}
    </a>
  ),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery: () => ({ data: { count: 2 } }),
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  }
})

vi.mock('@/lib/providers/auth', () => ({
  useAuth: () => ({ isAuthenticated: true }),
  useHasSession: () => true,
}))

vi.mock('@/lib/api/client', () => ({
  apiClient: { post: vi.fn() },
}))

vi.mock('@ui/molecules/toast', () => ({
  showToast: vi.fn(),
  showErrorToast: vi.fn(),
}))

vi.mock('@/features/notifications/hooks/use-notifications', () => ({
  useNotifications: () => ({
    allItems: sampleNotifications,
  }),
}))

vi.mock('@/features/notifications/hooks/use-mark-read', () => ({
  useMarkRead: () => ({
    mutate: mockMarkReadMutate,
  }),
}))

vi.mock('@/features/notifications/hooks/use-mark-all-read', () => ({
  useMarkAllRead: () => ({
    mutate: mockMarkAllReadMutate,
    isPending: false,
  }),
}))

describe('ActivityModuleNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders notifications with title and unread count', () => {
    render(<ActivityModuleNotifications onClose={vi.fn()} />)
    expect(screen.getByText('New follower')).toBeInTheDocument()
    expect(screen.getByText('System alert')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('clicking an unread notification with link marks it read, closes panel, and navigates', () => {
    const onClose = vi.fn()
    render(<ActivityModuleNotifications onClose={onClose} />)

    const followCard = screen.getByRole('button', { name: /new follower/i })
    fireEvent.click(followCard)

    expect(mockMarkReadMutate).toHaveBeenCalledWith('notif-1')
    expect(onClose).toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/u/john_doe' })
  })

  it('clicking an unread notification without link marks it read', () => {
    const onClose = vi.fn()
    render(<ActivityModuleNotifications onClose={onClose} />)

    const systemCard = screen.getByRole('button', { name: /system alert/i })
    fireEvent.click(systemCard)

    expect(mockMarkReadMutate).toHaveBeenCalledWith('notif-2')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('clicking unread dot marks read and does not navigate or close', () => {
    const onClose = vi.fn()
    render(<ActivityModuleNotifications onClose={onClose} />)

    const markReadButtons = screen.getAllByLabelText('Mark as read')
    fireEvent.click(markReadButtons[0])

    expect(mockMarkReadMutate).toHaveBeenCalledWith('notif-1')
    expect(onClose).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('clicking mark all read invokes markAllRead mutation', () => {
    render(<ActivityModuleNotifications onClose={vi.fn()} />)

    const markAllBtn = screen.getByText('Mark all read')
    fireEvent.click(markAllBtn)

    expect(mockMarkAllReadMutate).toHaveBeenCalled()
  })
})
