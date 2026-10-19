import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { DkAvatar } from '@ui/atoms/avatar'
import { userQueries, type SocialListKind } from '../../user-queries'

interface UserSocialListModalProps {
  username: string
  kind: SocialListKind
  onClose: () => void
  isExiting?: boolean
}

const TITLES: Record<SocialListKind, string> = {
  friends: 'Friends',
  followers: 'Followers',
  following: 'Following',
}

const EMPTY: Record<SocialListKind, string> = {
  friends: 'No friends yet.',
  followers: 'No followers yet.',
  following: 'Not following anyone yet.',
}

const EASE = [0.16, 1, 0.3, 1] as const
const NAV_DELAY_MS = 240

export const UserSocialListModal = ({
  username,
  kind,
  onClose,
  isExiting = false,
}: UserSocialListModalProps) => {
  const navigate = useNavigate()
  const visible = !isExiting
  const listQuery = useQuery(userQueries.socialList(username, kind))
  const users = listQuery.data ?? []

  useEffect(() => {
    if (!visible) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKey)
    }
  }, [visible, onClose])

  const openProfile = (targetUsername: string) => {
    onClose()
    window.setTimeout(() => {
      void navigate({ to: '/u/$username', params: { username: targetUsername } })
    }, NAV_DELAY_MS)
  }

  return (
    <div className="fixed inset-0 z-[var(--dk-z-modal)] flex items-center justify-center p-4 pointer-events-none">
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: visible ? 1 : 0 }}
        transition={{ duration: 0.22, ease: EASE }}
        className="absolute inset-0 bg-black/75 backdrop-blur-md pointer-events-auto"
        onClick={onClose}
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={TITLES[kind]}
        initial={{ opacity: 0, scale: 0.96, y: 18 }}
        animate={{
          opacity: visible ? 1 : 0,
          scale: visible ? 1 : 0.97,
          y: visible ? 0 : 12,
        }}
        transition={{ duration: 0.28, ease: EASE }}
        className="relative z-10 flex w-full max-w-md max-h-[min(80vh,520px)] flex-col overflow-hidden rounded-3xl p-6 sm:p-7 text-foreground border border-[var(--dk-separator)] pointer-events-auto"
        style={{
          backgroundColor: 'var(--dk-surface-overlay)',
          boxShadow: 'var(--dk-shadow-dialog)',
        }}
      >
        <div className="relative z-10 mb-4 flex shrink-0 items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-bold tracking-tight text-foreground">{TITLES[kind]}</h2>
            <p className="text-xs leading-relaxed text-muted-foreground">@{username}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 cursor-pointer rounded-xl p-2 text-muted-foreground transition-all hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative z-10 -mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          <AnimatePresence mode="wait" initial={false}>
            {listQuery.isLoading && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="space-y-2 py-1"
              >
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl px-2 py-2">
                    <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-[var(--dk-surface-ghost)]" />
                    <div className="h-3 w-28 animate-pulse rounded bg-[var(--dk-surface-ghost)]" />
                  </div>
                ))}
              </motion.div>
            )}

            {listQuery.isError && (
              <motion.p
                key="error"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="py-8 text-center text-sm text-muted-foreground"
              >
                Could not load this list.
              </motion.p>
            )}

            {!listQuery.isLoading && !listQuery.isError && users.length === 0 && (
              <motion.p
                key="empty"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="py-8 text-center text-sm text-muted-foreground"
              >
                {EMPTY[kind]}
              </motion.p>
            )}

            {!listQuery.isLoading && users.length > 0 && (
              <motion.ul
                key="list"
                initial="hidden"
                animate="show"
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                variants={{
                  hidden: {},
                  show: {
                    transition: { staggerChildren: 0.03, delayChildren: 0.05 },
                  },
                }}
                className="flex flex-col gap-0.5 py-1"
              >
                {users.map((user) => (
                  <motion.li
                    key={user.id}
                    variants={{
                      hidden: { opacity: 0, y: 8 },
                      show: {
                        opacity: 1,
                        y: 0,
                        transition: { duration: 0.24, ease: EASE },
                      },
                    }}
                  >
                    <button
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-[var(--dk-surface-ghost-hover)] active:scale-[0.99]"
                      onClick={() => openProfile(user.username)}
                    >
                      <DkAvatar src={user.avatarUrl} name={user.username} size="sm" />
                      <span className="truncate text-sm font-medium text-foreground">
                        {user.username}
                      </span>
                    </button>
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
};
