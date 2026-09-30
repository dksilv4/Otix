import { useState, useRef, useEffect, useCallback } from 'react'
import { Link } from '@tanstack/react-router'
import { LogOut, User, Shield, Gamepad2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@auth/hooks/use-auth'
import { DkAvatar } from '@ui/atoms/avatar'
import { usePanelContext } from '@activity/providers/panel-context'
import { useRunningGame } from '@/features/launcher'
import { formatDuration } from '@/lib/utils'

/** User avatar trigger with dropdown containing profile link and sign out. */
export const UserMenu = ({ bare }: { bare?: boolean }) => {
  const { user, isAuthenticated, isLoading, logout } = useAuth()
  const { runningGame, elapsedMs } = useRunningGame()
  const { setUserMenuOpen } = usePanelContext()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const toggle = useCallback(() => {
    setOpen(prev => !prev)
  }, [])

  useEffect(() => {
    setUserMenuOpen(open)
  }, [open, setUserMenuOpen])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false) }
  }, [])

  const handleClickOutside = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('[data-user-menu-trigger]')) return
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
        <div className={bare ? 'flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06]' : ''}>
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
          className="flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-semibold text-white/90 bg-white/10 hover:bg-white/20 hover:text-white transition-all border border-white/10 shadow-sm"
        >
          Sign In
        </Link>
      </div>
    )
  }

  const avatarUrl = user?.avatarUrl

  return (
    <div className={bare ? 'flex h-8 w-8 items-center justify-center' : ''}>
      <button
        type="button"
        data-user-menu-trigger
        onClick={() => toggle()}
        className={
          bare
            ? 'cursor-pointer rounded-full transition-all hover:bg-[var(--dk-surface-ghost-hover)] active:bg-[var(--dk-surface-ghost-active)] flex h-8 w-8 items-center justify-center'
            : pillClasses +
              ' cursor-pointer rounded-full transition-all hover:bg-[var(--dk-surface-ghost-hover)] active:bg-[var(--dk-surface-ghost-active)]'
        }
        style={pillStyle}
        title={runningGame ? `Playing ${runningGame.game.title}` : undefined}
      >
        <div className="relative flex items-center justify-center">
          <DkAvatar src={avatarUrl} name={user?.username || ''} size="sm" />
          {runningGame && (
            <span
              className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-black"
              title={`Playing ${runningGame.game.title}`}
            >
              <Gamepad2 className="h-2 w-2 text-black" />
            </span>
          )}
        </div>
      </button>

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
            <Link
              to="/u/$username"
              params={{ username: user?.username || '' }}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-[var(--dk-surface-ghost-hover)]"
            >
              <div className="relative flex items-center justify-center">
                <DkAvatar src={avatarUrl} name={user?.username || ''} size="md" />
                {runningGame && (
                  <span
                    className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-black"
                    title={`Playing ${runningGame.game.title}`}
                  >
                    <Gamepad2 className="h-2.5 w-2.5 text-black" />
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {user?.username}
                  {user?.isAdmin && (
                    <Shield className="ml-1 inline-block h-3.5 w-3.5 text-amber-400/80" />
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </Link>

            {runningGame && (
              <div className="mx-1 my-1.5 flex items-center gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs">
                <div className="relative flex h-2.5 w-2.5 items-center justify-center shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </div>
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
                  <p className="truncate font-semibold text-white/95">{runningGame.game.title}</p>
                </div>
              </div>
            )}

            <div className="my-1 border-t" style={{ borderColor: 'var(--dk-separator)' }} />

            <button
              type="button"
              onClick={() => {
                setOpen(false)
                logout()
              }}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
