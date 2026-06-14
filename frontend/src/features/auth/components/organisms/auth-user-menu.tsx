import { useState, useRef, useEffect, useCallback } from 'react'
import { Link } from '@tanstack/react-router'
import { LogOut, User, Shield } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@auth'
import { DkAvatar } from '@/old-features/dk-ui/atoms/avatar'

export const UserMenu = ({ bare }: { bare?: boolean }) => {
  const { user, isAuthenticated, isLoading, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false)
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
      <div className={bare ? 'flex h-8 w-8 items-center justify-center' : ''}>
        <Link
          to="/auth/login"
          className={
            bare
              ? 'flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] transition-all hover:bg-white/[0.1]'
              : pillClasses
          }
          style={pillStyle}
        >
          <DkAvatar icon={<User className="h-4 w-4" />} name="" size="sm" />
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
        onClick={() => setOpen(!open)}
        className={
          bare
            ? 'cursor-pointer rounded-full transition-all hover:bg-[var(--dk-surface-ghost-hover)] active:bg-[var(--dk-surface-ghost-active)] flex h-8 w-8 items-center justify-center'
            : pillClasses +
              ' cursor-pointer rounded-full transition-all hover:bg-[var(--dk-surface-ghost-hover)] active:bg-[var(--dk-surface-ghost-active)]'
        }
        style={pillStyle}
      >
        <DkAvatar src={avatarUrl} name={user?.username || ''} size="sm" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={containerRef}
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-full z-[9999] mt-2 w-56 flex-col gap-0.5 rounded-[1.5rem] p-3 backdrop-blur-xl"
            style={{
              backgroundColor: 'var(--dk-surface-overlay)',
              boxShadow: 'var(--dk-shadow-glass)',
            }}
          >
            <Link
              to="/u/$username"
              params={{ username: user?.username || '' }}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-[var(--dk-surface-ghost-hover)]"
            >
              <DkAvatar src={avatarUrl} name={user?.username || ''} size="md" />
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
