import type { MessageReaction } from '../types'

export const APPLE_TAPBACKS = ['❤️', '👍', '👎', '😂', '🔥', '‼️'] as const

export interface GroupedReaction {
  emoji: string
  count: number
  hasReacted: boolean
  userIds: number[]
}

export function groupReactions(
  reactions: MessageReaction[] | undefined,
  currentUserId: number,
): GroupedReaction[] {
  if (!reactions || reactions.length === 0) return []

  const map = new Map<string, { count: number; hasReacted: boolean; userIds: number[] }>()

  for (const r of reactions) {
    const existing = map.get(r.emoji)
    const isMe = r.userId === currentUserId
    if (existing) {
      existing.count += 1
      if (isMe) existing.hasReacted = true
      existing.userIds.push(r.userId)
    } else {
      map.set(r.emoji, {
        count: 1,
        hasReacted: isMe,
        userIds: [r.userId],
      })
    }
  }

  return Array.from(map.entries()).map(([emoji, data]) => ({
    emoji,
    count: data.count,
    hasReacted: data.hasReacted,
    userIds: data.userIds,
  }))
}
