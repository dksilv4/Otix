import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FriendCard } from '../components/molecules/friend-card'
import type { Friend, ActiveFriend } from '../types'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    className,
  }: {
    children: React.ReactNode
    to: string
    params?: Record<string, unknown>
    className?: string
  }) => (
    <a href={to} data-params={JSON.stringify(params)} className={className}>
      {children}
    </a>
  ),
}))

describe('FriendCard', () => {
  const friend: Friend = {
    id: 10,
    username: 'legolas',
    avatarUrl: 'https://example.com/avatar.jpg',
    friendsSince: '2024-05-10T10:00:00Z',
    bio: 'Elven archer from Mirkwood',
  }

  it('renders friend details and bio', () => {
    const handleManage = vi.fn()
    render(<FriendCard friend={friend} onManage={handleManage} />)

    expect(screen.getByText('legolas')).toBeInTheDocument()
    expect(screen.getByText('Elven archer from Mirkwood')).toBeInTheDocument()
    expect(screen.getByText('Friends since May 2024')).toBeInTheDocument()
  })

  it('calls onManage when manage button clicked', () => {
    const handleManage = vi.fn()
    render(<FriendCard friend={friend} onManage={handleManage} />)

    const manageBtn = screen.getByRole('button', { name: /manage friendship with legolas/i })
    fireEvent.click(manageBtn)
    expect(handleManage).toHaveBeenCalledWith(friend)
  })

  it('displays active state label when activeInfo provided', () => {
    const activeInfo: ActiveFriend = {
      friend,
      state: 'active_now',
      stateLabel: 'Playing Elden Ring',
    }

    render(
      <FriendCard
        friend={friend}
        activeInfo={activeInfo}
        onManage={vi.fn()}
      />,
    )

    expect(screen.getByText('Playing Elden Ring')).toBeInTheDocument()
  })
})
