import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react'
import { Helmet } from 'react-helmet-async'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { discoverQueries } from '@discover/discover-queries'
import { DiscoverHero } from '@/old-features/discover/organisms/discover-hero'
import { QueryErrorBoundary } from '@/components/query-error-boundary'
import { cn } from '@/lib/utils'
import { MediaSection } from '@/old-features/discover'
import { useAuth } from '@/lib/providers/auth'
import {
  User,
  ArrowRight,
  Film,
  Tv,
  Gamepad2,
  Music,
  TrendingUp,
} from 'lucide-react'

const AnimatedShaderBackground = lazy(() => import('@/components/animated-shader-background'))

const MEDIA_DOT_COLORS: Record<string, { active: string; inactive: string; text: string }> = {
  movie: {
    active: 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.6)]',
    inactive: 'bg-rose-500/30 hover:bg-rose-500/80',
    text: 'text-rose-400',
  },
  show: {
    active: 'bg-violet-500 shadow-[0_0_12px_rgba(139,92,246,0.6)]',
    inactive: 'bg-violet-500/30 hover:bg-violet-500/80',
    text: 'text-violet-400',
  },
  game: {
    active: 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.6)]',
    inactive: 'bg-emerald-500/30 hover:bg-emerald-500/80',
    text: 'text-emerald-400',
  },
  music: {
    active: 'bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.6)]',
    inactive: 'bg-amber-500/30 hover:bg-amber-500/80',
    text: 'text-amber-400',
  },
}

const MEDIA_TYPE_FILTERS = [
  { type: 'movie', icon: Film, label: 'Movies', color: 'text-rose-400', hover: 'hover:text-rose-300 hover:bg-rose-500/10', border: 'ring-rose-500/20' },
  { type: 'show', icon: Tv, label: 'Shows', color: 'text-violet-400', hover: 'hover:text-violet-300 hover:bg-violet-500/10', border: 'ring-violet-500/20' },
  { type: 'game', icon: Gamepad2, label: 'Games', color: 'text-emerald-400', hover: 'hover:text-emerald-300 hover:bg-emerald-500/10', border: 'ring-emerald-500/20' },
  { type: 'music', icon: Music, label: 'Music', color: 'text-amber-400', hover: 'hover:text-amber-300 hover:bg-amber-500/10', border: 'ring-amber-500/20' },
] as const

export function DiscoverPage() {
  return <HomeExperience />
}

function HomeExperience() {
  const { isAuthenticated } = useAuth()
  const [activeSectionIndex, setActiveSectionIndex] = useState(0)

  const scrollToSection = useCallback((id: string) => {
    const el = document.getElementById(`section-${id}`)
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 100
      window.scrollTo({ behavior: 'smooth', top })
    }
  }, [])

  const { data: sections = [] } = useQuery(discoverQueries.sections())

  const navSections = useMemo(() => {
    return [{ id: 'slides', title: 'Slides' } as const, ...sections]
  }, [sections])

  useEffect(() => {
    if (navSections.length === 0) return

    const observerOptions = {
      root: null,
      rootMargin: '-30% 0px -30% 0px',
      threshold: 0,
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.id.replace('section-', '')
          const idx = navSections.findIndex((s) => s.id === id)
          if (idx !== -1) {
            setActiveSectionIndex(idx)
          }
        }
      })
    }, observerOptions)

    navSections.forEach((section) => {
      const el = document.getElementById(`section-${section.id}`)
      if (el) observer.observe(el)
    })

    return () => {
      observer.disconnect()
    }
  }, [navSections])

  return (
    <div className="relative min-h-screen w-full">
      <Helmet>
        <title>Discover — Otix</title>
        <meta name="description" content="Discover movies, shows, games, and music. Track your workouts, build your library, and find your next obsession with Otix." />
        <meta property="og:title" content="Discover — Otix" />
        <meta property="og:description" content="Discover movies, shows, games, and music. Track your workouts, build your library, and find your next obsession with Otix." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={window.location.origin} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Discover — Otix" />
        <meta name="twitter:description" content="Discover movies, shows, games, and music. Track your workouts, build your library, and find your next obsession with Otix." />
      </Helmet>
      <Suspense fallback={null}>
        <AnimatedShaderBackground mode="idle" />
      </Suspense>

      <div className="relative z-10 flex flex-col items-center w-full">
        <div className="flex flex-col items-center w-full max-w-5xl mx-auto px-4 pb-24">

          <div className="w-full space-y-6 pt-24">

            {/* DiscoverHero carousel */}
            <motion.div
              id="section-slides"
              className="w-full"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.5 }}
            >
              <DiscoverHero />
            </motion.div>

            {/* Media Type Quick Jump */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="w-full"
            >
              <div className="flex items-center gap-1.5 px-1 py-2">
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Browse by category
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {MEDIA_TYPE_FILTERS.map(({ type, icon: Icon, label, color, hover }) => (
                  <Link
                    key={type}
                    to="/browse/$type"
                    params={{ type }}
                    className={cn(
                      'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium',
                      'bg-white/[0.03] ring-1 ring-white/[0.06] backdrop-blur-sm',
                      'transition-all duration-200 active:scale-[0.97]',
                      color,
                      hover,
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{label}</span>
                    <ArrowRight className="h-3 w-3 opacity-40 ml-0.5" />
                  </Link>
                ))}
              </div>
            </motion.div>

            {/* Divider */}
            <div className="w-full h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

            {/* Discover sections vertically stacked layout */}
            <div className="space-y-10">
              <QueryErrorBoundary>
                {sections.map((section, index) => (
                  <motion.div
                    key={section.id}
                    id={`section-${section.id}`}
                    className="w-full"
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-100px' }}
                    transition={{ duration: 0.5, delay: index * 0.05, ease: 'easeOut' }}
                  >
                    <MediaSection
                      title={section.title}
                      mediaType={(section.mediaType as 'movie' | 'show' | 'game' | 'music') || undefined}
                      listType={section.listType}
                      genre={section.genre}
                      language={section.language}
                      isAnime={section.isAnime}
                      reason={section.reason}
                    />
                  </motion.div>
                ))}
              </QueryErrorBoundary>
            </div>

            {/* Bottom CTA */}
            {!isAuthenticated && sections.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="w-full flex justify-center pt-4 pb-8"
              >
                <Link
                  to="/auth/login"
                  className="inline-flex items-center gap-2.5 px-6 py-3 rounded-2xl text-sm font-medium bg-primary/10 text-primary ring-1 ring-primary/20 backdrop-blur-md transition-all duration-200 hover:bg-primary/20 hover:scale-[1.03] active:scale-[0.97]"
                >
                  <User className="h-4 w-4" />
                  <span>Sign in to track your library & reviews</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Vertical Navigation Dots on the Side */}
      {navSections.length > 1 && (
        <div className="fixed right-4 md:right-6 top-1/2 -translate-y-1/2 z-50 flex flex-col items-center gap-3">
          {navSections.map((section, idx) => {
            const isActive = idx === activeSectionIndex
            const mType = 'mediaType' in section ? section.mediaType : null
            const colorConfig = mType ? MEDIA_DOT_COLORS[mType] : null

            return (
              <div key={section.id} className="relative flex items-center group">
                <span className={cn(
                  "absolute right-full mr-2 px-2 py-1 rounded-md text-[11px] font-medium whitespace-nowrap opacity-0 invisible transition-all duration-200 group-hover:opacity-100 group-hover:visible bg-white/[0.04] backdrop-blur-xl shadow-lg",
                  colorConfig?.text
                )}>
                  {section.title}
                </span>
                <button
                  onClick={() => scrollToSection(section.id)}
                  className={cn(
                    "w-2.5 h-2.5 rounded-full transition-all duration-200 cursor-pointer",
                    isActive
                      ? cn("scale-125", colorConfig?.active || "bg-primary shadow-[0_0_12px_rgba(var(--primary-rgb),0.5)]")
                      : cn("opacity-40 hover:opacity-70", colorConfig?.inactive || "bg-white/20 hover:bg-white/50")
                  )}
                  aria-label={`Scroll to ${section.title}`}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
