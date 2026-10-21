import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import {
  LogOut,
  User,
  Shield,
  Gamepad2,
  Sparkles,
  Users,
  UserPlus,
  Check,
  X,
  ArrowRight,
  Film,
  Search,
  Lightbulb,
  Settings,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@auth/hooks/use-auth'
import { DkAvatar } from '@ui/atoms/avatar'
import { usePanelContext } from '@activity/providers/panel-context'
import { useRunningGame } from '@/features/launcher'
import { formatDuration } from '@/lib/utils'
import { computeGamification, getLevelTier } from '@user/utils'
import { XPProgressRing } from '@user/components/atoms/user-xp-progress-ring'
import {
  useFriends,
  useFriendRequests,
  FriendAvatar,
  AddFriendModal,
  filterFriends,
} from '@/features/friends'
import { openFeatureSpotlight } from '@/features/spotlight'

export interface UserMenuContentProps {
  onClose?: () => void
}

/**
 * Dropdown body containing user profile summary, icon-based navigation bar,
 * active game status, and the interactive friends hub.
 */
export const UserMenuContent = ({ onClose }: UserMenuContentProps) => {
  const { user, logout } = useAuth()
  const { runningGame, elapsedMs } = useRunningGame()
  const [isAddFriendOpen, setIsAddFriendOpen] = useState(false)
  const [friendsTab, setFriendsTab] = useState<'active' | 'all' | 'requests'>('active')
  const [friendSearchQuery, setFriendSearchQuery] = useState('')

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

  const totalXp = user?.totalXp ?? 0
  const gamification = useMemo(() => computeGamification(totalXp), [totalXp])
  const tier = useMemo(() => getLevelTier(gamification.level), [gamification.level])

  const displayedFriends = useMemo(
    () => filterFriends(friends, friendSearchQuery),
    [friends, friendSearchQuery],
  )

  const avatarUrl = user?.avatarUrl

  return (
    <div className="w-full flex flex-col space-y-2">
      {/* User Profile Summary Card */}
      <div className="rounded-2xl bg-[var(--dk-surface-raised)]/80 backdrop-blur-md p-3 border border-[var(--dk-separator)] shadow-xs">
        <Link
          to="/u/$username"
          params={{ username: user?.username || '' }}
          onClick={onClose}
          className="group flex items-center gap-3 transition-colors"
        >
          {/* Avatar with shared element transition */}
          <motion.div
            layoutId="nav-profile-avatar"
            transition={{ duration: 0.22, ease: "linear" }}
            className="relative flex items-center justify-center shrink-0"
          >
            <XPProgressRing
              progress={gamification.xpProgress}
              size={44}
              strokeWidth={2.5}
              strokeColor={tier.color}
            >
              <DkAvatar src={avatarUrl} name={user?.username || ''} size="md" className="!h-8 !w-8" />
            </XPProgressRing>
            {runningGame && (
              <span
                className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-background"
                title={`Playing ${runningGame.game.title}`}
              >
                <Gamepad2 className="h-2.5 w-2.5 text-primary-foreground" />
              </span>
            )}
          </motion.div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <p className="truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                {user?.username}
                {user?.isAdmin && (
                  <Shield className="ml-1 inline-block h-3.5 w-3.5 text-amber-400/80" />
                )}
              </p>
              <span style={{ color: tier.color }} className="text-[11px] font-bold">
                Lv. {gamification.level}
              </span>
            </div>

            <div className="mt-1 flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-[var(--dk-surface-ghost)] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.round(gamification.xpProgress * 100)}%`,
                    backgroundColor: tier.color,
                  }}
                />
              </div>
              <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                {Math.round(gamification.xpProgress * 100)}%
              </span>
            </div>

            <div className="mt-0.5 flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="truncate">{gamification.levelTitle}</span>
              <span>{totalCount} {totalCount === 1 ? 'friend' : 'friends'}</span>
            </div>
          </div>
        </Link>

        {/* Icon-based Navigation Links under User Section */}
        <div className="grid grid-cols-5 gap-1.5 pt-2.5 mt-2.5 border-t border-[var(--dk-separator)]">
          <Link
            to="/u/$username"
            params={{ username: user?.username || '' }}
            onClick={onClose}
            className="flex h-8 items-center justify-center rounded-xl bg-[var(--dk-surface-overlay)]/70 text-muted-foreground transition-all hover:bg-[var(--dk-surface-overlay)] hover:text-foreground active:scale-95 border border-[var(--dk-separator)]"
            title="Profile"
            aria-label="View Profile"
          >
            <User className="h-4 w-4" />
          </Link>

          <Link
            to="/settings/profile"
            onClick={onClose}
            className="flex h-8 items-center justify-center rounded-xl bg-[var(--dk-surface-overlay)]/70 text-muted-foreground transition-all hover:bg-[var(--dk-surface-overlay)] hover:text-foreground active:scale-95 border border-[var(--dk-separator)]"
            title="Settings"
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
          </Link>

          <Link
            to="/welcome"
            onClick={onClose}
            className="flex h-8 items-center justify-center rounded-xl bg-[var(--dk-surface-overlay)]/70 text-muted-foreground transition-all hover:bg-[var(--dk-surface-overlay)] hover:text-foreground active:scale-95 border border-[var(--dk-separator)]"
            title="Welcome & Guide"
            aria-label="Welcome & Guide"
          >
            <Sparkles className="h-4 w-4" />
          </Link>

          <button
            type="button"
            onClick={() => {
              onClose?.()
              openFeatureSpotlight()
            }}
            className="flex h-8 items-center justify-center rounded-xl bg-[var(--dk-surface-overlay)]/70 text-muted-foreground transition-all hover:bg-[var(--dk-surface-overlay)] hover:text-foreground active:scale-95 cursor-pointer border border-[var(--dk-separator)]"
            title="Feature Tips & Tricks"
            aria-label="Feature Tips & Tricks"
          >
            <Lightbulb className="h-4 w-4" />
          </button>


          <button
            type="button"
            onClick={() => {
              onClose?.()
              logout()
            }}
            className="flex h-8 items-center justify-center rounded-xl bg-[var(--dk-surface-overlay)]/70 text-muted-foreground transition-all hover:bg-[var(--dk-surface-overlay)] hover:text-foreground active:scale-95 cursor-pointer border border-[var(--dk-separator)]"
            title="Sign Out"
            aria-label="Sign Out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Running Game Pod */}
      {runningGame && (
        <div className="flex items-center gap-2.5 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs">
          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <span className="font-extrabold uppercase tracking-wider text-[10px] text-emerald-400">
                Playing
              </span>
              <div className="flex items-center gap-1.5 text-[10px] font-mono">
                {runningGame.fpsSnapshot && runningGame.fpsSnapshot.currentFps > 0 && (
                  <span className="font-bold text-emerald-400">
                    {Math.round(runningGame.fpsSnapshot.currentFps)} FPS
                  </span>
                )}
                <span className="text-emerald-300/80">
                  {formatDuration(elapsedMs)}
                </span>
              </div>
            </div>
            <p className="truncate font-semibold text-foreground">{runningGame.game.title}</p>
          </div>
        </div>
      )}

      <div className="border-t border-[var(--dk-separator)] my-1" />

      {/* Friends Section Sub-header & Navigation Tabs */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1 rounded-xl bg-[var(--dk-surface-raised)]/80 p-1 border border-[var(--dk-separator)]">
            <button
              type="button"
              onClick={() => setFriendsTab('active')}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
                friendsTab === 'active'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Active {activeCount > 0 ? `(${activeCount})` : ''}
            </button>
            <button
              type="button"
              onClick={() => setFriendsTab('all')}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
                friendsTab === 'all'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All ({totalCount})
            </button>
            {incomingCount > 0 && (
              <button
                type="button"
                onClick={() => setFriendsTab('requests')}
                className={`relative rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
                  friendsTab === 'requests'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-primary font-bold hover:text-primary'
                }`}
              >
                Requests ({incomingCount})
              </button>
            )}
          </div>

          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setIsAddFriendOpen(true)
              }}
              className="flex h-7 w-7 items-center justify-center rounded-xl text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground transition-colors cursor-pointer"
              title="Add Friend"
              aria-label="Add Friend"
            >
              <UserPlus className="h-3.5 w-3.5" />
            </button>
            <Link
              to="/friends"
              onClick={onClose}
              className="flex items-center gap-1 rounded-xl px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground transition-colors"
              title="Open Friends Hub"
              aria-label="Open Friends Hub"
            >
              <span>Friends Hub</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* Pending Friend Request Banner when not in requests tab */}
        {incomingCount > 0 && friendsTab !== 'requests' && (
          <div className="flex items-center justify-between gap-2 rounded-xl bg-primary/15 border border-primary/20 px-2.5 py-1.5 text-xs text-primary">
            <span className="font-semibold text-[11px]">
              {incomingCount} pending request{incomingCount > 1 ? 's' : ''}
            </span>
            <button
              type="button"
              onClick={() => setFriendsTab('requests')}
              className="text-[11px] font-bold underline hover:opacity-80 cursor-pointer"
            >
              View
            </button>
          </div>
        )}

        {/* Tab 1: Active Friends View */}
        {friendsTab === 'active' && (
          <div className="space-y-1">
            {activeNowFriends.length > 0 ? (
              <div className="space-y-1 max-h-[190px] overflow-y-auto scrollbar-none pr-0.5">
                {activeNowFriends.slice(0, 4).map(({ friend, state, stateLabel, latestActivity }) => (
                  <Link
                    key={friend.id}
                    to="/u/$username"
                    params={{ username: friend.username }}
                    onClick={onClose}
                    className="group flex items-center justify-between gap-3 rounded-xl bg-[var(--dk-surface-raised)]/70 p-2.5 border border-[var(--dk-separator)] transition-all hover:bg-[var(--dk-surface-raised)]"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <FriendAvatar
                        src={friend.avatarUrl}
                        username={friend.username}
                        size="sm"
                        state={state}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                          {friend.username}
                        </p>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          {latestActivity?.mediaItem ? (
                            <>
                              {latestActivity.mediaItem.mediaType === 'game' ? (
                                <Gamepad2 className="h-3 w-3 text-primary shrink-0" />
                              ) : (
                                <Film className="h-3 w-3 text-primary shrink-0" />
                              )}
                              <span className="truncate">{stateLabel}</span>
                            </>
                          ) : (
                            <span className="truncate">{stateLabel}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </Link>
                ))}
              </div>
            ) : friends.length > 0 ? (
              <div className="space-y-2 py-1">
                <p className="text-center text-xs text-muted-foreground">
                  No friends active right now
                </p>
                <div className="flex items-center justify-center -space-x-2 overflow-hidden py-1">
                  {friends.slice(0, 6).map((f) => (
                    <Link
                      key={f.id}
                      to="/u/$username"
                      params={{ username: f.username }}
                      onClick={onClose}
                      title={f.username}
                      className="transition-transform hover:scale-110 hover:z-10"
                    >
                      <FriendAvatar
                        src={f.avatarUrl}
                        username={f.username}
                        size="sm"
                        className="ring-2 ring-[var(--dk-surface-base)]"
                      />
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-4 text-center px-4 rounded-xl bg-[var(--dk-surface-raised)]/60 border border-[var(--dk-separator)]">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary mb-1.5">
                  <Users className="h-4.5 w-4.5" />
                </div>
                <p className="text-xs font-semibold text-foreground">Connect with Friends</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 mb-2.5">
                  See when friends are online, playing games, or watching media.
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsAddFriendOpen(true)
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  <span>Add Friends</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: All Friends View */}
        {friendsTab === 'all' && (
          <div className="space-y-1.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={friendSearchQuery}
                onChange={(e) => setFriendSearchQuery(e.target.value)}
                placeholder="Search friends..."
                className="w-full rounded-xl bg-[var(--dk-surface-raised)]/90 py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground outline-none transition-all focus:ring-1 focus:ring-primary border border-[var(--dk-separator)]"
              />
            </div>

            {displayedFriends.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                {friendSearchQuery.trim()
                  ? `No friends match "${friendSearchQuery}"`
                  : 'No friends yet'}
              </div>
            ) : (
              <div className="max-h-[180px] overflow-y-auto space-y-1 pr-0.5 scrollbar-none">
                {displayedFriends.map((friend) => (
                  <Link
                    key={friend.id}
                    to="/u/$username"
                    params={{ username: friend.username }}
                    onClick={onClose}
                    className="group flex items-center justify-between gap-2.5 rounded-xl bg-[var(--dk-surface-raised)]/50 px-2.5 py-2 border border-[var(--dk-separator)] transition-colors hover:bg-[var(--dk-surface-raised)]/90"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <FriendAvatar
                        src={friend.avatarUrl}
                        username={friend.username}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <span className="truncate text-xs font-medium text-foreground group-hover:text-primary transition-colors">
                          {friend.username}
                        </span>
                      </div>
                    </div>
                    <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Requests View */}
        {friendsTab === 'requests' && (
          <div className="space-y-1.5 max-h-[190px] overflow-y-auto scrollbar-none pr-0.5">
            {incoming.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                No pending friend requests
              </div>
            ) : (
              incoming.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between gap-2 rounded-xl bg-[var(--dk-surface-raised)]/70 border border-[var(--dk-separator)] p-2.5"
                >
                  <Link
                    to="/u/$username"
                    params={{ username: req.sender.username }}
                    onClick={onClose}
                    className="flex items-center gap-2.5 min-w-0 flex-1 hover:opacity-80 transition-opacity"
                  >
                    <FriendAvatar
                      src={req.sender.avatarUrl}
                      username={req.sender.username}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-foreground">
                        {req.sender.username}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Friend request
                      </p>
                    </div>
                  </Link>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={isAccepting}
                      onClick={(e) => {
                        e.stopPropagation()
                        acceptRequest(req.id)
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 cursor-pointer shadow-sm transition-transform active:scale-95"
                      title="Accept"
                      aria-label={`Accept friend request from ${req.sender.username}`}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={isRejecting}
                      onClick={(e) => {
                        e.stopPropagation()
                        rejectRequest(req.id)
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--dk-surface-field)] text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground disabled:opacity-50 cursor-pointer transition-transform active:scale-95"
                      title="Decline"
                      aria-label={`Decline friend request from ${req.sender.username}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Add Friend Dialog */}
      <AddFriendModal
        open={isAddFriendOpen}
        onOpenChange={setIsAddFriendOpen}
      />
    </div>
  )
}

interface UserMenuProps {
  bare?: boolean
  triggerOnly?: boolean
  onToggle?: (nextOpen: boolean) => void
}

/**
 * User avatar trigger and optional standalone dropdown container.
 */
export const UserMenu = ({ bare, triggerOnly, onToggle }: UserMenuProps) => {
  const { user, isAuthenticated, isLoading } = useAuth()
  const { runningGame } = useRunningGame()
  const { isUserMenuOpen, setUserMenuOpen } = usePanelContext()
  const [internalOpen, setInternalOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const { incomingCount } = useFriendRequests({ enabled: isAuthenticated })
  const totalXp = user?.totalXp ?? 0
  const gamification = useMemo(() => computeGamification(totalXp), [totalXp])
  const tier = useMemo(() => getLevelTier(gamification.level), [gamification.level])

  // Sync open state with panel context
  const isOpen = triggerOnly ? isUserMenuOpen : (isUserMenuOpen || internalOpen)

  const toggle = useCallback(() => {
    const next = !isOpen
    setInternalOpen(next)
    setUserMenuOpen(next)
    onToggle?.(next)
  }, [isOpen, setUserMenuOpen, onToggle])

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (triggerOnly) return
      const target = e.target as HTMLElement
      if (target.closest('[data-user-menu-trigger]')) return
      if (containerRef.current && !containerRef.current.contains(target)) {
        setInternalOpen(false)
        setUserMenuOpen(false)
      }
    },
    [triggerOnly, setUserMenuOpen],
  )

  useEffect(() => {
    if (!isOpen || triggerOnly) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setInternalOpen(false)
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, triggerOnly, handleClickOutside, setUserMenuOpen])

  const pillClasses = bare
    ? undefined
    : 'flex items-center rounded-[2rem] backdrop-blur-lg p-1.5'
  const pillStyle = bare
    ? undefined
    : {
        background:
          'linear-gradient(to bottom right, var(--dk-surface-glass), var(--dk-surface-glass-hover))',
        boxShadow: 'var(--dk-shadow-glass)' as string,
      }

  if (isLoading) {
    return (
      <div className={pillClasses} style={pillStyle}>
        <div className={bare ? 'flex h-8 w-8 items-center justify-center rounded-full bg-[var(--dk-surface-ghost)]' : ''}>
          <DkAvatar icon={<User className="h-4 w-4" />} name="" size="sm" />
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center">
        <Link
          to="/auth/login"
          className="flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-semibold text-foreground bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-glass-hover)] transition-all border border-[var(--dk-separator)] shadow-xs"
        >
          Sign In
        </Link>
      </div>
    )
  }

  const avatarUrl = user?.avatarUrl

  const triggerNode = (
    <motion.button
      layoutId="nav-profile-avatar"
      transition={{ duration: 0.22, ease: "linear" }}
      type="button"
      data-user-menu-trigger
      onClick={toggle}
      className={
        bare
          ? 'cursor-pointer rounded-full transition-colors hover:bg-[var(--dk-surface-ghost-hover)] active:bg-[var(--dk-surface-ghost-active)] flex h-8 w-8 items-center justify-center relative shrink-0'
          : pillClasses +
            ' cursor-pointer rounded-full transition-colors hover:bg-[var(--dk-surface-ghost-hover)] active:bg-[var(--dk-surface-ghost-active)] relative shrink-0'
      }
      style={pillStyle}
      title={
        runningGame
          ? `Playing ${runningGame.game.title} • Level ${gamification.level} (${Math.round(gamification.xpProgress * 100)}%)`
          : `Level ${gamification.level} • ${gamification.levelTitle} (${Math.round(gamification.xpProgress * 100)}%)`
      }
      aria-label={`User menu, Level ${gamification.level}`}
    >
      <div className="relative flex items-center justify-center">
        <XPProgressRing
          progress={gamification.xpProgress}
          size={32}
          strokeWidth={2}
          strokeColor={tier.color}
        >
          <DkAvatar
            src={avatarUrl}
            name={user?.username || ''}
            size="sm"
            className="!h-6 !w-6 text-[10px]"
          />
        </XPProgressRing>
        {runningGame ? (
          <span
            className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-background"
            title={`Playing ${runningGame.game.title}`}
          >
            <Gamepad2 className="h-2 w-2 text-primary-foreground" />
          </span>
        ) : incomingCount > 0 ? (
          <span
            className="absolute -top-1 -right-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-bold text-primary-foreground shadow-sm"
            title={`${incomingCount} pending friend request${incomingCount > 1 ? 's' : ''}`}
          >
            {incomingCount}
          </span>
        ) : null}
      </div>
    </motion.button>
  )

  if (triggerOnly) {
    return triggerNode
  }

  return (
    <div className={bare ? 'flex h-8 w-8 items-center justify-center relative' : 'relative'}>
      {triggerNode}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={containerRef}
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-full z-[9999] mt-2 w-[360px] flex-col rounded-3xl p-3 dk-surface backdrop-blur-2xl shadow-2xl border border-[var(--dk-separator)] space-y-2 max-h-[calc(100vh-100px)] overflow-y-auto scrollbar-none"
          >
            <UserMenuContent
              onClose={() => {
                setInternalOpen(false)
                setUserMenuOpen(false)
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
