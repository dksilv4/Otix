// TODO: Review this file
import { useState, useRef, useEffect, useCallback } from 'react'
import { Link } from '@tanstack/react-router'
import { LogOut, User, Shield } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../auth-provider'
import { DkAvatar } from '@/features/dk-ui/atoms/avatar'
import { cn } from '@/lib/utils'
import './user-menu.scss'

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

  // Show placeholder while loading so layout never jumps
  if (isLoading) {
    return (
      <div className={cn(!bare && 'dk-auth-user-menu__pill dk-auth-user-menu__pill--padded')}>
        <DkAvatar icon={<User className="h-4 w-4" />} name="" size="sm" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className={cn('dk-auth-user-menu', bare && 'dk-auth-user-menu--bare')}>
        <Link
          to="/auth/login"
          className={cn(
            !bare && 'dk-auth-user-menu__pill dk-auth-user-menu__pill--padded',
            'dk-auth-user-menu__unauth-link',
            bare && 'dk-auth-user-menu__unauth-link--bare',
          )}
        >
          <DkAvatar icon={<User className="h-4 w-4" />} name="" size="sm" />
        </Link>
      </div>
    )
  }

  const avatarUrl = user?.avatarUrl

  return (
    <div className={cn('dk-auth-user-menu', bare && 'dk-auth-user-menu--bare')}>
      <button
        type="button"
        data-user-menu-trigger
        onClick={() => setOpen(!open)}
        className={cn(
          !bare && 'dk-auth-user-menu__pill dk-auth-user-menu__pill--padded',
          'dk-auth-user-menu__trigger',
          bare && 'dk-auth-user-menu__trigger--bare',
        )}
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
            className="dk-auth-user-menu__dropdown"
          >
            {/* User info */}
            <Link
              to="/u/$username"
              params={{ username: user?.username || '' }}
              onClick={() => setOpen(false)}
              className="dk-auth-user-menu__user-link"
            >
              <DkAvatar src={avatarUrl} name={user?.username || ''} size="md" />
              <div className="min-w-0">
                <p className="dk-auth-user-menu__username">
                  {user?.username}
                  {user?.isAdmin && (
                    <Shield className="h-3.5 w-3.5 inline-block ml-1 text-amber-400/80" />
                  )}
                </p>
                <p className="dk-auth-user-menu__email">{user?.email}</p>
              </div>
            </Link>

            <div className="dk-auth-user-menu__divider" />

            {/* Sign out */}
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                logout()
              }}
              className="dk-auth-user-menu__action"
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
