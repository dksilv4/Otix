import { useState, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { Cookie, X } from 'lucide-react'

const COOKIE_CONSENT_KEY = 'otix_cookie_consent'

export type CookieConsentState = 'all' | 'necessary' | null

function getCookieConsent(): CookieConsentState {
  if (typeof window === 'undefined') return null
  try {
    return (localStorage.getItem(COOKIE_CONSENT_KEY) as CookieConsentState) || null
  } catch {
    return null
  }
}

export function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Only show if the user hasn't made a choice yet
    const stored = getCookieConsent()
    if (!stored) {
      // Small delay for non-jarring appearance
      const timer = setTimeout(() => setVisible(true), 800)
      return () => clearTimeout(timer)
    }
  }, [])

  const handleChoice = (choice: 'all' | 'necessary') => {
    try {
      localStorage.setItem(COOKIE_CONSENT_KEY, choice)
    } catch {
      // Ignore local storage error
    }
    setVisible(false)
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="cookie-banner"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-[9999] rounded-2xl bg-background/90 backdrop-blur-[24px] p-4 sm:p-5 shadow-[var(--dk-shadow-glass)]"
          role="region"
          aria-label="Cookie preferences"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 text-white font-semibold text-sm">
              <Cookie className="h-4 w-4 text-amber-400 shrink-0" />
              <span>Cookie &amp; Privacy Notice</span>
            </div>
            <button
              type="button"
              onClick={() => handleChoice('necessary')}
              className="text-white/40 hover:text-white transition-colors p-1 -mr-1 -mt-1 rounded-lg"
              aria-label="Dismiss cookie notice"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="mt-2 text-xs text-white/70 leading-relaxed">
            We use strictly necessary cookies to keep you signed in and remember your media preferences. We do not use third-party advertising or cross-site tracking cookies.{' '}
            <Link
              to="/privacy"
              className="text-white hover:text-white/80 underline underline-offset-2 font-medium"
            >
              Read our Privacy &amp; Cookie Policy
            </Link>
            .
          </p>

          <div className="mt-4 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => handleChoice('necessary')}
              className="rounded-xl px-3.5 py-1.5 text-xs font-semibold text-white/80 hover:text-white bg-white/[0.08] hover:bg-white/[0.14] transition-all active:scale-95"
            >
              Necessary Only
            </button>
            <button
              type="button"
              onClick={() => handleChoice('all')}
              className="rounded-xl px-3.5 py-1.5 text-xs font-semibold text-zinc-950 bg-white hover:bg-white/90 shadow-sm transition-all active:scale-95"
            >
              Accept All
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
