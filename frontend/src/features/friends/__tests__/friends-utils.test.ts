import { describe, it, expect } from 'vitest'
import {
  formatRelativeTime,
  formatFriendsSince,
  computeActiveFriends,
  filterFriends,
  filterFriendActivity,
} from '../utils'
import type { Friend, FriendActivityEvent } from '../types'

describe('friends utils', () => {
  describe('formatRelativeTime', () => {
    it('returns empty string for null or invalid date', () => {
      expect(formatRelativeTime(null)).toBe('')
      expect(formatRelativeTime(undefined)).toBe('')
      expect(formatRelativeTime('invalid-date')).toBe('')
    })

    it('formats recent timestamps', () => {
      const now = Date.now()
      expect(formatRelativeTime(new Date(now - 10000).toISOString())).toBe('Just now')
      expect(formatRelativeTime(new Date(now - 5 * 60 * 1000).toISOString())).toBe('5m ago')
      expect(formatRelativeTime(new Date(now - 2 * 60 * 60 * 1000).toISOString())).toBe('2h ago')
    })
  })

  describe('formatFriendsSince', () => {
    it('handles null date', () => {
      expect(formatFriendsSince(null)).toBe('Friends')
    })

    it('formats valid ISO date', () => {
      expect(formatFriendsSince('2024-03-15T12:00:00Z')).toBe('Friends since Mar 2024')
    })
  })

  describe('computeActiveFriends', () => {
    it('computes active states correctly', () => {
      const friends: Friend[] = [
        {
          id: 1,
          username: 'alice',
          avatarUrl: null,
          friendsSince: '2024-01-01T00:00:00Z',
          lastLogin: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5m ago
        },
        {
          id: 2,
          username: 'bob',
          avatarUrl: null,
          friendsSince: '2024-01-01T00:00:00Z',
          lastLogin: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3h ago
        },
        {
          id: 3,
          username: 'charlie',
          avatarUrl: null,
          friendsSince: '2024-01-01T00:00:00Z',
          lastLogin: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), // 2 days ago
        },
      ]

      const activities: FriendActivityEvent[] = [
        {
          type: 'episode_watched',
          timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2m ago
          summary: 'Watched S1E1 of Severance',
          user: { id: 1, username: 'alice', avatarUrl: null },
        },
      ]

      const result = computeActiveFriends(friends, activities)
      expect(result).toHaveLength(3)

      // Alice should be active_now with latest activity summary
      expect(result[0].friend.username).toBe('alice')
      expect(result[0].state).toBe('active_now')
      expect(result[0].stateLabel).toBe('Watched S1E1 of Severance')

      // Bob should be active_today
      expect(result[1].friend.username).toBe('bob')
      expect(result[1].state).toBe('active_today')
      expect(result[1].stateLabel).toBe('Active 3h ago')

      // Charlie should be offline
      expect(result[2].friend.username).toBe('charlie')
      expect(result[2].state).toBe('offline')
      expect(result[2].stateLabel).toBe('Offline')
    })
  })

  describe('filterFriends', () => {
    const friends: Friend[] = [
      { id: 1, username: 'Gandalf', avatarUrl: null, friendsSince: null },
      { id: 2, username: 'Frodo', avatarUrl: null, friendsSince: null },
      { id: 3, username: 'Samwise', avatarUrl: null, friendsSince: null },
    ]

    it('returns all when query is empty', () => {
      expect(filterFriends(friends, '')).toEqual(friends)
      expect(filterFriends(friends, '   ')).toEqual(friends)
    })

    it('filters case-insensitively', () => {
      expect(filterFriends(friends, 'gan')).toEqual([friends[0]])
      expect(filterFriends(friends, 'RO')).toEqual([friends[1]])
    })
  })

  describe('filterFriendActivity', () => {
    const activities: FriendActivityEvent[] = [
      {
        type: 'review',
        timestamp: '2024-01-01T00:00:00Z',
        summary: 'Reviewed Dune',
        user: { id: 1, username: 'alice', avatarUrl: null },
      },
      {
        type: 'episode_watched',
        timestamp: '2024-01-01T00:00:00Z',
        summary: 'Watched Fallout',
        user: { id: 2, username: 'bob', avatarUrl: null },
      },
      {
        type: 'interaction',
        timestamp: '2024-01-01T00:00:00Z',
        summary: 'Bookmarked Interstellar',
        user: { id: 1, username: 'alice', avatarUrl: null },
      },
    ]

    it('filters by category', () => {
      expect(filterFriendActivity(activities, 'all')).toHaveLength(3)
      expect(filterFriendActivity(activities, 'reviews')).toHaveLength(1)
      expect(filterFriendActivity(activities, 'watched')).toHaveLength(1)
      expect(filterFriendActivity(activities, 'interactions')).toHaveLength(1)
    })
  })
})
