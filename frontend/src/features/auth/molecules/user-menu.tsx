import { useState, useRef, useEffect, useCallback } from 'react'
import { Link } from '@tanstack/react-router'
import { LogOut, User, Shield } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../auth-provider'
import { DkAvatar } from '@/features/dk-ui/atoms/avatar'
import { cn } from '@/lib/utils'

export function UserMenu({ bare }: { bare?: boolean }) {
  const { user, isAuthenticated, isLoading, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    },
    [],
  )

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('[data-user-menu-trigger]')) return
      if (containerRef.current && !containerRef.current.contains(target)) {
        setOpen(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open, handleKeyDown, handleClickOutside])

  if (isLoading) return null

  const pillBase = cn(
    'flex items-center rounded-[2rem]',
    'bg-gradient-to-br from-[var(--dk-surface-glass)] to-[var(--dk-surface-glass-hover)]',
    'backdrop-blur-lg',
    'shadow-[var(--dk-shadow-glass)]',
  )

  if (!isAuthenticated) {
    return (
      <Link
        to="/auth/login"
        className={cn(!bare && pillBase, !bare && 'p-1.5')}
      >
        <DkAvatar icon={<User className="h-4 w-4" />} name="" size="sm" />
      </Link>
    )
  }

  const avatarUrl = user?.avatarUrl

  return (
    <div className="relative">
      <button
        type="button"
        data-user-menu-trigger
        onClick={() => setOpen(!open)}
        className={cn(!bare && pillBase, !bare && 'p-1.5', 'cursor-pointer')}
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
            className={cn(
              'absolute right-0 top-full mt-2 z-[9999]',
              'w-56 p-3 rounded-[1.5rem]',
              'bg-[var(--dk-surface-overlay)]',
              'backdrop-blur-xl',
              'shadow-[var(--dk-shadow-glass)]',
              'flex flex-col gap-0.5',
            )}
          >
            {/* User info */}
            <Link
              to="/u/$username"
              params={{ username: user?.username || '' }}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-[var(--dk-surface-ghost-hover)] transition-colors duration-150"
            >
              <DkAvatar src={avatarUrl} name={user?.username || ''} size="md" />
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">
                  {user?.username}
                  {user?.isAdmin && (
                    <Shield className="h-3.5 w-3.5 inline-block ml-1 text-amber-400/80" />
                  )}
                </p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
            </Link>

            <div className="my-1 border-t border-white/[0.06]" />

            {/* Sign out */}
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                logout()
              }}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)] transition-colors duration-150"
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
