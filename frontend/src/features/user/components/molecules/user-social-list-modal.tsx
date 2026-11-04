import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { DkAvatar } from '@ui/atoms/avatar'
import { DkDialog } from '@ui/molecules/dialog'
import { userQueries, type SocialListKind } from '../../user-queries'

export interface UserSocialListModalProps {
  username: string
  kind: SocialListKind
  open?: boolean
  isOpen?: boolean
  onClose?: () => void
  onOpenChange?: (open: boolean) => void
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
  open,
  isOpen,
  onClose,
  onOpenChange,
  isExiting = false,
}: UserSocialListModalProps) => {
  const navigate = useNavigate()
  const isModalOpen = (open ?? isOpen ?? true) && !isExiting
  const listQuery = useQuery(userQueries.socialList(username, kind))
  const users = listQuery.data ?? []

  const handleClose = () => {
    onClose?.()
    onOpenChange?.(false)
  }

  const openProfile = (targetUsername: string) => {
    handleClose()
    window.setTimeout(() => {
      void navigate({ to: '/u/$username', params: { username: targetUsername } })
    }, NAV_DELAY_MS)
  }

  return (
    <DkDialog
      open={isModalOpen}
      onOpenChange={(next) => {
        if (!next) handleClose()
      }}
      title={TITLES[kind]}
      description={`@${username}`}
      className="max-w-md max-h-[min(80vh,520px)] flex flex-col"
    >
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
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
    </DkDialog>
  )
};
