import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Cookie, X } from 'lucide-react'

import {
  COOKIE_CONSENT_KEY,
  getCookieConsent,
} from '@/lib/utils/cookies'

export const CookieBanner = () => {
  const [visible, setVisible] = useState(() => {
    try {
      return !getCookieConsent()
    } catch {
      return false
    }
  })

  const handleChoice = (choice: 'all' | 'necessary') => {
    try {
      localStorage.setItem(COOKIE_CONSENT_KEY, choice)
    } catch {
      // Ignore local storage error
    }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-[9999] rounded-2xl backdrop-blur-md p-4 sm:p-5 shadow-[var(--dk-shadow-glass)] border border-white/[0.06]"
      style={{ backgroundColor: 'var(--dk-surface-overlay)' }}
      role="region"
      aria-label="Cookie preferences"
    >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 text-foreground font-semibold text-sm">
              <Cookie className="h-4 w-4 text-amber-500 shrink-0" />
              <span>Cookie &amp; Privacy Notice</span>
            </div>
            <button
              type="button"
              onClick={() => handleChoice('necessary')}
              className="text-muted-foreground hover:text-foreground transition-colors p-1 -mr-1 -mt-1 rounded-lg"
              aria-label="Dismiss cookie notice"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="mt-1.5 text-xs text-muted-foreground leading-normal">
            We use essential cookies to keep you signed in and remember preferences.{' '}
            <Link
              to="/privacy"
              className="text-foreground hover:text-primary underline underline-offset-2 font-medium"
            >
              Privacy Policy
            </Link>
            .
          </p>

          <div className="mt-4 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => handleChoice('necessary')}
              className="rounded-xl px-3.5 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] transition-colors active:scale-95"
            >
              Necessary Only
            </button>
            <button
              type="button"
              onClick={() => handleChoice('all')}
              className="rounded-xl px-3.5 py-1.5 text-xs font-semibold text-primary-foreground bg-primary hover:bg-primary/90 shadow-sm transition active:scale-95"
            >
              Accept All
            </button>
          </div>
        </div>
  )
};
