import { useState, useRef, useEffect, useCallback } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Users, UserPlus, ArrowRight, Check, X, Film, Gamepad2, Sparkles, Inbox } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/lib/providers/auth'
import { useFriends } from '../../hooks/use-friends'
import { useFriendRequests } from '../../hooks/use-friend-requests'
import { FriendAvatar } from '../atoms/friend-avatar'
import { AddFriendModal } from '../modals/add-friend-modal'

interface FriendsNavDropdownProps {
  bare?: boolean
}

export const FriendsNavDropdown = ({ bare }: FriendsNavDropdownProps) => {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [isAddFriendOpen, setIsAddFriendOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const {
    friends,
    activeNowFriends,
    totalCount,
    activeCount,
  } = useFriends()

  const {
    incoming,
    incomingCount,
    acceptRequest,
    rejectRequest,
    isAccepting,
    isRejecting,
  } = useFriendRequests()

  const toggle = useCallback(() => {
    setOpen((prev) => !prev)
  }, [])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false)
  }, [])

  const handleClickOutside = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('[data-friends-dropdown-trigger]')) return
    if (containerRef.current && !containerRef.current.contains(target)) {
      setOpen(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open, handleKeyDown, handleClickOutside])

  if (!isAuthenticated) return null

  const triggerClasses = bare
    ? 'relative flex h-8 w-8 items-center justify-center rounded-full transition-all hover:bg-[var(--dk-surface-ghost-hover)] active:bg-[var(--dk-surface-ghost-active)] cursor-pointer text-muted-foreground hover:text-foreground'
    : 'relative flex items-center rounded-full p-2 text-muted-foreground hover:text-foreground cursor-pointer'

  return (
    <div className={bare ? 'flex h-8 w-8 items-center justify-center' : ''}>
      {/* Dropdown Trigger matching UserMenu pill */}
      <button
        type="button"
        data-friends-dropdown-trigger
        onClick={toggle}
        className={triggerClasses}
        aria-label="Friends menu"
        title="Friends"
      >
        <Users className="h-4 w-4" />

        {/* Incoming requests notification badge */}
        {incomingCount > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground shadow-sm">
            {incomingCount}
          </span>
        ) : activeCount > 0 ? (
          <span
            className="absolute bottom-1 right-1 h-2 w-2 rounded-full bg-primary ring-2 ring-[var(--dk-surface-base)]"
            title={`${activeCount} active friends`}
          />
        ) : null}
      </button>

      {/* Dropdown Menu re-using exact UserMenu layout & .dk-surface tokens */}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={containerRef}
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-full z-[9999] mt-2 w-[300px] flex-col gap-0.5 p-3 dk-surface"
          >
            {/* Header Hero matching UserMenu profile header */}
            <Link
              to="/friends"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-[var(--dk-surface-ghost-hover)]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Users className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  Friends
                </p>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {totalCount} {totalCount === 1 ? 'friend' : 'friends'}
                  </span>
                  {activeCount > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-primary font-medium">
                        {activeCount} online
                      </span>
                    </>
                  )}
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </Link>

            {/* Incoming Requests Banner (if any) */}
            {incomingCount > 0 && (
              <>
                <div className="my-1 border-t" style={{ borderColor: 'var(--dk-separator)' }} />
                <div className="mx-1 my-1 flex flex-col gap-1.5 rounded-xl bg-primary/10 px-2.5 py-2 text-xs">
                  <div className="flex items-center justify-between text-primary font-semibold">
                    <div className="flex items-center gap-1.5">
                      <Inbox className="h-3.5 w-3.5" />
                      <span>Requests</span>
                    </div>
                    <span className="rounded-full bg-primary/20 px-1.5 py-0.2 text-[10px] font-bold">
                      {incomingCount}
                    </span>
                  </div>

                  <div className="space-y-1">
                    {incoming.map((req) => (
                      <div
                        key={req.id}
                        className="flex items-center justify-between gap-2 rounded-lg bg-[var(--dk-surface-base)]/80 p-1.5"
                      >
                        <Link
                          to="/u/$username"
                          params={{ username: req.sender.username }}
                          onClick={() => setOpen(false)}
                          className="flex items-center gap-2 min-w-0 flex-1"
                        >
                          <FriendAvatar
                            src={req.sender.avatarUrl}
                            username={req.sender.username}
                            size="sm"
                          />
                          <span className="truncate text-xs font-medium text-foreground">
                            {req.sender.username}
                          </span>
                        </Link>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={isAccepting}
                            onClick={() => acceptRequest(req.id)}
                            className="rounded-md bg-primary p-1 text-primary-foreground hover:opacity-90 disabled:opacity-50 cursor-pointer"
                            title="Accept"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            disabled={isRejecting}
                            onClick={() => rejectRequest(req.id)}
                            className="rounded-md bg-[var(--dk-surface-ghost)] p-1 text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground disabled:opacity-50 cursor-pointer"
                            title="Decline"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Active Now Section */}
            {activeNowFriends.length > 0 && (
              <>
                <div className="my-1 border-t" style={{ borderColor: 'var(--dk-separator)' }} />
                <div className="px-2 pt-1 pb-0.5 text-[11px] font-semibold text-primary flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  <span>Active Now ({activeNowFriends.length})</span>
                </div>

                <div className="space-y-0.5">
                  {activeNowFriends.slice(0, 4).map(({ friend, state, stateLabel, latestActivity }) => (
                    <Link
                      key={friend.id}
                      to="/u/$username"
                      params={{ username: friend.username }}
                      onClick={() => setOpen(false)}
                      className="flex items-center justify-between gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-[var(--dk-surface-ghost-hover)]"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <FriendAvatar
                          src={friend.avatarUrl}
                          username={friend.username}
                          size="sm"
                          state={state}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-foreground">
                            {friend.username}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {stateLabel}
                          </p>
                        </div>
                      </div>

                      {latestActivity?.mediaItem && (
                        <div className="shrink-0 text-muted-foreground">
                          {latestActivity.mediaItem.mediaType === 'game' ? (
                            <Gamepad2 className="h-3.5 w-3.5" />
                          ) : (
                            <Film className="h-3.5 w-3.5" />
                          )}
                        </div>
                      )}
                    </Link>
                  ))}
                </div>
              </>
            )}

            {/* All Friends List */}
            <div className="my-1 border-t" style={{ borderColor: 'var(--dk-separator)' }} />
            <div className="px-2 pt-1 pb-0.5 text-[11px] font-semibold text-muted-foreground">
              Friends List
            </div>

            {friends.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">No friends yet</p>
            ) : (
              <div className="max-h-[160px] overflow-y-auto space-y-0.5 scrollbar-none pr-0.5">
                {friends.slice(0, 6).map((friend) => (
                  <Link
                    key={friend.id}
                    to="/u/$username"
                    params={{ username: friend.username }}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground"
                  >
                    <FriendAvatar
                      src={friend.avatarUrl}
                      username={friend.username}
                      size="sm"
                    />
                    <span className="truncate text-xs font-medium text-foreground">
                      {friend.username}
                    </span>
                  </Link>
                ))}
              </div>
            )}

            {/* Bottom Actions matching UserMenu bottom links */}
            <div className="my-1 border-t" style={{ borderColor: 'var(--dk-separator)' }} />

            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setIsAddFriendOpen(true)
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground cursor-pointer"
            >
              <UserPlus className="h-4 w-4" />
              <span>Add Friend</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setOpen(false)
                void navigate({ to: '/friends' })
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground cursor-pointer"
            >
              <Users className="h-4 w-4" />
              <span>View All Friends</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Friend Modal */}
      <AddFriendModal
        open={isAddFriendOpen}
        onOpenChange={setIsAddFriendOpen}
      />
    </div>
  )
};
