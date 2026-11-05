import { useState, useRef } from 'react'
import { Bookmark, Play, Heart, ArrowDown, Download } from 'lucide-react'
import { useNavCenter } from '@/features/navigation'
import type { PillPreset, TriggerMode } from './types'

/**
 * Dev-only sandbox to experiment with the new Nav Center Pill API:
 * 1. How the pill looks (visual variants, Otix glassmorphism, actions, thumbnails).
 * 2. When it should be shown (sentinel element, scroll threshold, scroll-up reveal).
 */
export const NavDockPrototypePage = () => {
  const heroCardRef = useRef<HTMLDivElement>(null)

  const [preset, setPreset] = useState<PillPreset>('media')
  const [triggerMode, setTriggerMode] = useState<TriggerMode>('sentinel')
  const [thresholdPx] = useState(250)
  const [fallbackMode, setFallbackMode] = useState<'sub-tier' | 'hidden'>('sub-tier')
  const [isBookmarked, setIsBookmarked] = useState(false)
  const [isLiked, setIsLiked] = useState(false)

  // Configure the center pill using the new native useNavCenter hook
  useNavCenter(
    preset === 'media'
      ? {
          id: 'prototype-media-pill',
          title: 'Cyberpunk 2077',
          subtitle: '2020',
          thumbnailPlaceholder: 'CP',
          badge: (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/15 text-primary text-[11px] font-bold shrink-0">
              <span>★ 91%</span>
            </div>
          ),
          actions: (
            <>
              <button
                type="button"
                onClick={() => alert('Starting Cyberpunk 2077...')}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shadow-sm transition-transform active:scale-95"
              >
                <Play className="h-3 w-3 fill-current" />
                <span>Play</span>
              </button>
              <button
                type="button"
                onClick={() => setIsBookmarked((v) => !v)}
                className={`inline-flex items-center justify-center h-7 w-7 rounded-full transition-all active:scale-95 ${
                  isBookmarked
                    ? 'bg-primary/20 text-primary'
                    : 'bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-glass-hover)] text-muted-foreground hover:text-foreground'
                }`}
                title="Wishlist"
              >
                <Bookmark className={`h-3.5 w-3.5 ${isBookmarked ? 'fill-current' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => setIsLiked((v) => !v)}
                className={`inline-flex items-center justify-center h-7 w-7 rounded-full transition-all active:scale-95 ${
                  isLiked
                    ? 'bg-rose-500/20 text-rose-500'
                    : 'bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-glass-hover)] text-muted-foreground hover:text-foreground'
                }`}
                title="Like"
              >
                <Heart className={`h-3.5 w-3.5 ${isLiked ? 'fill-current' : ''}`} />
              </button>
            </>
          ),
          // Trigger configurations
          sentinelRef: triggerMode === 'sentinel' ? heroCardRef : undefined,
          scrollThreshold: triggerMode === 'threshold' ? thresholdPx : undefined,
          showOnScrollUpOnly: triggerMode === 'scrollUpOnly',
          fallbackPlacement: fallbackMode,
        }
      : preset === 'compact'
        ? {
            id: 'prototype-compact-pill',
            title: 'Cyberpunk 2077',
            subtitle: 'Overview',
            actions: (
              <button
                type="button"
                onClick={() => {
                  document.getElementById('content-details')?.scrollIntoView({ behavior: 'smooth' })
                }}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-glass-hover)] text-muted-foreground hover:text-foreground text-xs font-medium transition-all"
              >
                <span>Jump to Specs</span>
                <ArrowDown className="h-3 w-3 text-primary" />
              </button>
            ),
            sentinelRef: triggerMode === 'sentinel' ? heroCardRef : undefined,
            scrollThreshold: triggerMode === 'threshold' ? thresholdPx : undefined,
            showOnScrollUpOnly: triggerMode === 'scrollUpOnly',
            fallbackPlacement: fallbackMode,
          }
        : {
            id: 'prototype-download-pill',
            title: 'Cyberpunk 2077',
            thumbnailPlaceholder: 'DL',
            badge: (
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-400 text-[11px] font-semibold">
                <Download className="h-3 w-3 animate-bounce" />
                <span>Downloading (74%) · Worker Node 1</span>
              </div>
            ),
            actions: (
              <div className="h-6 px-2.5 rounded-full bg-[var(--dk-surface-glass)] text-xs text-muted-foreground flex items-center">
                42 MB/s
              </div>
            ),
            sentinelRef: triggerMode === 'sentinel' ? heroCardRef : undefined,
            scrollThreshold: triggerMode === 'threshold' ? thresholdPx : undefined,
            showOnScrollUpOnly: triggerMode === 'scrollUpOnly',
            fallbackPlacement: fallbackMode,
          },
  )

  return (
    <div className="min-h-[220vh] w-full px-4 sm:px-6 py-6 space-y-6">

      {/* ── INTERACTIVE DESIGN CONTROLS TOOLBAR ── */}
      <div className="rounded-2xl bg-[var(--dk-surface-glass)] p-5 border border-white/[0.04] space-y-4 shadow-[var(--dk-shadow-glass)]">
        <div>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/20 text-primary font-semibold">
            Nav Center Pill API Sandbox
          </span>
          <h1 className="text-base font-bold text-foreground mt-1">
            Configure Visual Appearance & Trigger Conditions
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Test how the center pill looks in different modes, and configure exactly when it appears as you scroll.
          </p>
        </div>

        {/* Option 1: How the Pill Looks */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-foreground">1. Pill Appearance Preset:</label>
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              onClick={() => setPreset('media')}
              className={`px-3 py-1.5 rounded-xl font-medium transition-all ${
                preset === 'media'
                  ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                  : 'bg-[var(--dk-surface-base)] text-muted-foreground hover:text-foreground'
              }`}
            >
              Rich Media (Thumbnail + Score + Actions)
            </button>
            <button
              type="button"
              onClick={() => setPreset('compact')}
              className={`px-3 py-1.5 rounded-xl font-medium transition-all ${
                preset === 'compact'
                  ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                  : 'bg-[var(--dk-surface-base)] text-muted-foreground hover:text-foreground'
              }`}
            >
              Compact Jump Pill (Title + Quick Jump)
            </button>
            <button
              type="button"
              onClick={() => setPreset('download')}
              className={`px-3 py-1.5 rounded-xl font-medium transition-all ${
                preset === 'download'
                  ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                  : 'bg-[var(--dk-surface-base)] text-muted-foreground hover:text-foreground'
              }`}
            >
              Live Activity / Download Status
            </button>
          </div>
        </div>

        {/* Option 2: When It Should Be Shown */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">2. When Should It Show?</label>
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                onClick={() => setTriggerMode('sentinel')}
                className={`px-3 py-1.5 rounded-xl font-medium transition-all ${
                  triggerMode === 'sentinel'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                    : 'bg-[var(--dk-surface-base)] text-muted-foreground hover:text-foreground'
                }`}
              >
                Hero Exits View (Sentinel)
              </button>
              <button
                type="button"
                onClick={() => setTriggerMode('threshold')}
                className={`px-3 py-1.5 rounded-xl font-medium transition-all ${
                  triggerMode === 'threshold'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                    : 'bg-[var(--dk-surface-base)] text-muted-foreground hover:text-foreground'
                }`}
              >
                Fixed Scroll Threshold (250px)
              </button>
              <button
                type="button"
                onClick={() => setTriggerMode('scrollUpOnly')}
                className={`px-3 py-1.5 rounded-xl font-medium transition-all ${
                  triggerMode === 'scrollUpOnly'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                    : 'bg-[var(--dk-surface-base)] text-muted-foreground hover:text-foreground'
                }`}
              >
                Scroll-Up Only Reveal
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">3. Small Screen Mode:</label>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={() => setFallbackMode('sub-tier')}
                className={`px-3 py-1.5 rounded-xl font-medium transition-all ${
                  fallbackMode === 'sub-tier'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                    : 'bg-[var(--dk-surface-base)] text-muted-foreground hover:text-foreground'
                }`}
              >
                Sub-Tier Floating (Below Nav)
              </button>
              <button
                type="button"
                onClick={() => setFallbackMode('hidden')}
                className={`px-3 py-1.5 rounded-xl font-medium transition-all ${
                  fallbackMode === 'hidden'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                    : 'bg-[var(--dk-surface-base)] text-muted-foreground hover:text-foreground'
                }`}
              >
                Hide on Small Screens
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── HERO BANNER (Acts as the Sentinel Element) ── */}
      <section
        ref={heroCardRef}
        className="rounded-3xl bg-[var(--dk-surface-glass)] p-6 sm:p-8 border border-white/[0.04] space-y-6 shadow-[var(--dk-shadow-glass)]"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <div className="h-36 w-24 rounded-2xl bg-[var(--dk-surface-raised)] border border-white/[0.06] flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0 shadow-md">
            POSTER
          </div>
          <div className="space-y-3 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/15 text-primary font-semibold">
                HERO SENTINEL
              </span>
              <span className="text-xs text-muted-foreground">2020 · CD PROJEKT RED</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
              Cyberpunk 2077 Night City
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-xl">
              When this hero card scrolls out of view at the top, the center nav pill smoothly animates into
              the space between the twin floating nav bars.
            </p>
          </div>
        </div>

        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => {
              window.scrollBy({ top: 400, behavior: 'smooth' })
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--dk-surface-base)] hover:bg-[var(--dk-surface-raised)] text-xs font-medium text-foreground transition-all shadow-sm cursor-pointer"
          >
            <span>Scroll Past Hero to Trigger Nav Pill</span>
            <ArrowDown className="h-3.5 w-3.5 text-primary" />
          </button>
        </div>
      </section>

      {/* ── CONTENT SECTIONS ── */}
      <div id="content-details" className="space-y-6 pt-4">
        <div className="rounded-2xl bg-[var(--dk-surface-glass)] p-6 border border-white/[0.04] space-y-4 shadow-[var(--dk-shadow-glass)]">
          <div className="h-5 w-44 rounded bg-[var(--dk-surface-raised)]" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="h-28 rounded-xl bg-[var(--dk-surface-base)] p-4 space-y-2">
              <div className="h-4 w-20 rounded bg-primary/20" />
              <div className="h-6 w-28 rounded bg-[var(--dk-surface-raised)]" />
            </div>
            <div className="h-28 rounded-xl bg-[var(--dk-surface-base)] p-4 space-y-2">
              <div className="h-4 w-20 rounded bg-primary/20" />
              <div className="h-6 w-28 rounded bg-[var(--dk-surface-raised)]" />
            </div>
            <div className="h-28 rounded-xl bg-[var(--dk-surface-base)] p-4 space-y-2">
              <div className="h-4 w-20 rounded bg-primary/20" />
              <div className="h-6 w-28 rounded bg-[var(--dk-surface-raised)]" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-[var(--dk-surface-glass)] p-6 border border-white/[0.04] space-y-4 shadow-[var(--dk-shadow-glass)]">
          <div className="h-5 w-52 rounded bg-[var(--dk-surface-raised)]" />
          <div className="h-44 rounded-xl bg-[var(--dk-surface-base)] flex items-center justify-center text-xs text-muted-foreground">
            [Content Stream / Media Specs Section]
          </div>
        </div>

        <div className="rounded-2xl bg-[var(--dk-surface-glass)] p-6 border border-white/[0.04] space-y-4 shadow-[var(--dk-shadow-glass)]">
          <div className="h-5 w-60 rounded bg-[var(--dk-surface-raised)]" />
          <div className="space-y-3">
            <div className="h-12 rounded-xl bg-[var(--dk-surface-base)]" />
            <div className="h-12 rounded-xl bg-[var(--dk-surface-base)]" />
            <div className="h-12 rounded-xl bg-[var(--dk-surface-base)]" />
          </div>
        </div>
      </div>

    </div>
  )
}
