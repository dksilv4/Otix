import type {
  Friend,
  FriendActivityEvent,
  ActiveFriend,
  FriendOnlineState,
  ActivityFilterKey,
} from '../types'

/**
 * Format relative activity timestamps (e.g., 'Just now', '12m ago', '3h ago', 'Yesterday').
 */
export const formatRelativeTime = (isoString?: string | null): string => {
  if (!isoString) return ''
  const parsed = new Date(isoString).getTime()
  if (Number.isNaN(parsed)) return ''

  const diffMs = Date.now() - parsed
  if (diffMs < 0) return 'Just now'

  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return 'Just now'

  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`

  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`

  const diffWeeks = Math.floor(diffDays / 7)
  if (diffWeeks < 4) return `${diffWeeks}w ago`

  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) return `${diffMonths}mo ago`

  const diffYears = Math.floor(diffDays / 365)
  return `${diffYears}y ago`
}

/**
 * Format when two users became friends.
 */
export const formatFriendsSince = (isoString?: string | null): string => {
  if (!isoString) return 'Friends'
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return 'Friends'

  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ]
  const month = months[date.getMonth()]
  const year = date.getFullYear()
  return `Friends since ${month} ${year}`
}

const THIRTY_MINUTES_MS = 30 * 60 * 1000
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

/**
 * Compute active states and latest events for each friend.
 */
export const computeActiveFriends = (
  friends: Friend[],
  activities: FriendActivityEvent[] = [],
): ActiveFriend[] => {
  const latestByUserId = new Map<number, FriendActivityEvent>()

  // Map latest activity per friend
  for (const act of activities) {
    if (!act.user?.id) continue
    const current = latestByUserId.get(act.user.id)
    if (!current) {
      latestByUserId.set(act.user.id, act)
    } else {
      const curTime = new Date(current.timestamp).getTime()
      const newTime = new Date(act.timestamp).getTime()
      if (newTime > curTime) {
        latestByUserId.set(act.user.id, act)
      }
    }
  }

  const now = Date.now()

  return friends.map((friend) => {
    const latest = latestByUserId.get(friend.id)
    const actTime = latest ? new Date(latest.timestamp).getTime() : 0
    const loginTime = friend.lastLogin ? new Date(friend.lastLogin).getTime() : 0
    const mostRecentTime = Math.max(actTime, loginTime)

    let state: FriendOnlineState = 'offline'
    let stateLabel = 'Offline'

    if (mostRecentTime > 0) {
      const diff = now - mostRecentTime
      if (diff <= THIRTY_MINUTES_MS) {
        state = 'active_now'
        if (latest && actTime >= loginTime) {
          stateLabel = latest.summary
        } else {
          stateLabel = 'Active now'
        }
      } else if (diff <= TWENTY_FOUR_HOURS_MS) {
        state = 'active_today'
        const hoursAgo = Math.max(1, Math.floor(diff / (60 * 60 * 1000)))
        stateLabel = `Active ${hoursAgo}h ago`
      }
    }

    return {
      friend,
      state,
      stateLabel,
      latestActivity: latest ?? null,
    }
  }).sort((a, b) => {
    const score = (item: ActiveFriend) => {
      if (item.state === 'active_now') return 3
      if (item.state === 'active_today') return 2
      return 1
    }
    return score(b) - score(a)
  })
}

/**
 * Search/filter friends by username.
 */
export const filterFriends = (friends: Friend[], query: string): Friend[] => {
  const clean = query.trim().toLowerCase()
  if (!clean) return friends
  return friends.filter((f) => f.username.toLowerCase().includes(clean))
}

/**
 * Filter friend activities by type.
 */
export const filterFriendActivity = (
  activities: FriendActivityEvent[],
  filter: ActivityFilterKey,
): FriendActivityEvent[] => {
  if (filter === 'all') return activities
  if (filter === 'reviews') return activities.filter((a) => a.type === 'review')
  if (filter === 'watched') return activities.filter((a) => a.type === 'episode_watched')
  if (filter === 'interactions') return activities.filter((a) => a.type === 'interaction')
  return activities
}
