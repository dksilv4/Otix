import { useState, useMemo, useEffect } from "react"
import { Helmet } from "react-helmet-async"
import { useNavigate } from "@tanstack/react-router"
import { ChevronDown, ArrowRight, Search, Star, List, Trophy, Link, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Logo } from "@/features/dk-ui/atoms/logo"
import { MEDIA_TYPES as MEDIA_TYPE_KEYS, MEDIA_TYPE_ICON, MEDIA_TYPE_COLOR_TINTED } from "@/constants/media"

// ── Data ──

const MEDIA_TYPE_PILLS: { label: string; icon: typeof MEDIA_TYPE_ICON[keyof typeof MEDIA_TYPE_ICON]; color: string }[] = MEDIA_TYPE_KEYS.map((t) => ({
  label: t === "movie" ? "Movies" : t === "show" ? "Shows" : t === "game" ? "Games" : "Music",
  icon: MEDIA_TYPE_ICON[t],
  color: MEDIA_TYPE_COLOR_TINTED[t].replace(/ ring-\S+/g, ""),
}))

const FEATURES = [
  {
    icon: Star,
    iconColor: "text-amber-400",
    iconBg: "bg-amber-400/10",
    title: "Rate & Review",
    desc: "Score every title and write thoughtful reviews",
  },
  {
    icon: List,
    iconColor: "text-sky-400",
    iconBg: "bg-sky-400/10",
    title: "Curated Lists",
    desc: "Build public or private collections around any theme",
  },
  {
    icon: Trophy,
    iconColor: "text-yellow-400",
    iconBg: "bg-yellow-400/10",
    title: "Earn XP & Badges",
    desc: "Level up and unlock achievements as you engage",
  },
  {
    icon: Link,
    iconColor: "text-indigo-400",
    iconBg: "bg-indigo-400/10",
    title: "Connected Accounts",
    desc: "Sync from Steam, Plex, Spotify, YouTube, TMDb",
  },
] as const

interface FaqDef {
  q: string
  a: string
}

const FAQS: FaqDef[] = [
  {
    q: "What media types are supported?",
    a: "Movies, TV shows, games, and music. Search, rate, review, and organize all four into lists and collections.",
  },
  {
    q: "Is Otix free?",
    a: "Yes, completely free. No paid tiers, no premium features, no hidden costs.",
  },
  {
    q: "How do I earn XP?",
    a: "Every action earns XP — writing reviews (150 XP), rating media (50 XP), marking as watched (30 XP), creating lists, completing workouts, maintaining streaks, and gaining followers.",
  },
  {
    q: "How do I connect external accounts?",
    a: "Head to Settings → Integrations to connect Steam, Plex, Spotify, YouTube, TMDb, or Google.",
  },
  {
    q: "How do I report a bug?",
    a: "Submit feedback through the admin proposals page if you have access, or reach out directly to the Otix team.",
  },
]

const ABOUT_SUBPAGES = [
  { title: "Profile Scores", desc: "How XP, levels, aura, and user ratings work.", to: "/about/profile" },
  { title: "Achievements", desc: "Every badge and milestone you can earn.", to: "/about/achievements" },
  { title: "FAQ", desc: "Frequently asked questions about Otix.", to: "/about/faq" },
] as const

// ── Helpers ──

function matchesQuery(text: string, query: string): boolean {
  if (!query) return true
  return text.toLowerCase().includes(query.toLowerCase())
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  const idx = lower.indexOf(q)
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-primary/20 text-foreground rounded-sm px-0.5">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  )
}

// ── Sub-components ──

function FaqItem({ q, a, query }: FaqDef & { query: string }) {
  const [open, setOpen] = useState(false)
  const isVisible = matchesQuery(q, query) || matchesQuery(a, query)

  // auto-open when search matches
  const shouldAutoOpen = query.length > 0 && isVisible
  useEffect(() => {
    if (shouldAutoOpen) setOpen(true)
  }, [shouldAutoOpen])

  if (!isVisible) return null

  return (
    <div className="rounded-2xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-xs)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left"
      >
        <span className="text-sm font-medium pr-4">{highlight(q, query)}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="px-5 pb-4 pt-0">
          <p className="text-sm text-muted-foreground leading-relaxed">{highlight(a, query)}</p>
        </div>
      )}
    </div>
  )
}

// ── Main component ──

export function AboutPage() {
  const navigate = useNavigate()
  const [searchValue, setSearchValue] = useState("")
  const query = searchValue.trim()

  const hasResults = useMemo(() => {
    if (!query) return true

    const allText = [
      ...FEATURES.map((f) => `${f.title} ${f.desc}`),
      ...FAQS.map((f) => `${f.q} ${f.a}`),
      ...MEDIA_TYPE_PILLS.map((m) => m.label),
      "What is Otix?",
      "track movies shows games music rate review XP lists",
      "Steam Plex Spotify YouTube TMDb Google",
      "community profile scores XP levels aura badges achievements",
    ]
    return allText.some((t) => t.toLowerCase().includes(query.toLowerCase()))
  }, [query])

  const handleClear = () => setSearchValue("")

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") handleClear()
  }

  return (
    <div className="mx-auto max-w-2xl pb-16">
      <Helmet>
        <title>About - Otix</title>
        <meta
          name="description"
          content="Otix is your personal media command center — discover movies, shows, games, and music, track your fitness, and curate your collection."
        />
        <meta property="og:title" content="About - Otix" />
        <meta
          property="og:description"
          content="Learn more about Otix — your personal media command center."
        />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
      </Helmet>

      {/* ── Hero ── */}
      <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[var(--dk-surface-glass)] to-[var(--dk-surface-glass-hover)] shadow-[var(--dk-shadow-glass)] ring-1 ring-white/[0.04] px-10 py-20 text-center sm:px-14 sm:py-24">
        <div>
          <Logo className="h-9 mx-auto mb-6" />

          <h1 className="text-3xl font-bold tracking-[-0.02em] sm:text-4xl">About Otix</h1>
          <p className="mt-3 text-sm sm:text-base text-muted-foreground leading-relaxed max-w-[540px] mx-auto">
            Your personal media command center. Track, rate, review, and discover across movies,
            shows, games, and music — all in one place, for free.
          </p>

          {/* Stats */}
          <div className="mt-8 flex items-center justify-center gap-4 sm:gap-6">
            <Stat value="4" label="MEDIA TYPES" />
            <Stat value="∞" label="100% FREE" />
            <Stat value="100+" label="ACHIEVEMENTS" />
          </div>
        </div>
      </section>

      {/* ── Slim Search ── */}
      <div className="relative z-20 -mt-6 mx-auto max-w-[480px]">
        <div
          className={cn(
            "flex items-center gap-2 rounded-full p-1.5",
            "bg-[var(--dk-surface-overlay)]",
            "shadow-[var(--dk-shadow-glass)]",
            "ring-1 ring-white/[0.06]",
            "transition-all duration-300",
            "focus-within:ring-primary/20 focus-within:scale-[1.005]",
          )}
        >
          <div className="flex items-center gap-2 pl-2 flex-1 min-w-0">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground/50" />
            <input
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search about content..."
              className={cn(
                "flex-1 min-w-0 h-9",
                "bg-transparent border-0 outline-none shadow-none ring-0 focus:ring-0 focus:ring-offset-0",
                "text-sm placeholder:text-muted-foreground/40 text-foreground",
              )}
            />
          </div>
          {searchValue ? (
            <button
              onClick={handleClear}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground/50 hover:text-foreground hover:bg-white/[0.06] transition-all"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <button
              disabled
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground/20"
              aria-label="Search"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Results count ── */}
      {query && !hasResults && (
        <p className="mt-8 text-sm text-muted-foreground text-center">
          No results found for &ldquo;{query}&rdquo;. Try a different term.
        </p>
      )}

      {/* ── What is Otix? ── */}
      <section className={cn("mt-12", !hasResults && "hidden")}>
        <h2
          className="text-xl font-bold tracking-[-0.02em]"
          style={{
            background: "linear-gradient(135deg, #e94560, #ff6b6b)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          What is Otix?
        </h2>

        {/* Media type pills */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {MEDIA_TYPE_PILLS.filter((m) => matchesQuery(m.label, query)).map((m) => {
            const Icon = m.icon
            return (
              <span
                key={m.label}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
                  m.color,
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {m.label}
              </span>
            )
          })}
        </div>

        <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
          Otix is a media tracking and discovery platform.{" "}
          <span className="font-medium text-foreground/70">
            Track movies, shows, games, and music
          </span>{" "}
          in one place — rate what you've experienced, write reviews, build curated lists, and earn
          XP as you go.
        </p>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          Connect your accounts from{" "}
          <span className="font-medium text-foreground/70">
            Steam, Plex, Spotify, YouTube, TMDb, and Google
          </span>{" "}
          to import your libraries, sync your history, and share what you're playing or listening to.
        </p>

        {/* Feature grid */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {FEATURES.filter((f) => matchesQuery(`${f.title} ${f.desc}`, query)).map((f) => {
            const Icon = f.icon
            return (
              <div
                key={f.title}
                className="flex items-start gap-3 rounded-xl bg-[var(--dk-surface-glass)] px-4 py-3.5"
              >
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    f.iconBg,
                    f.iconColor,
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{highlight(f.title, query)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{highlight(f.desc, query)}</p>
                </div>
              </div>
            )
          })}
        </div>

        <p className="mt-5 text-sm text-muted-foreground leading-relaxed">
          Otix is built for people who take their media seriously —{" "}
          <span className="font-medium text-foreground/70">
            not just what you watch, but what you think about it
          </span>
          . Discover new favorites through the community, follow people with similar taste, and find
          the next thing worth your time.
        </p>
      </section>

      {/* ── Quick Answers ── */}
      <section className={cn("mt-12", !hasResults && "hidden")}>
        <h2
          className="text-xl font-bold tracking-[-0.02em]"
          style={{
            background: "linear-gradient(135deg, #e94560, #ff6b6b)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          Quick Answers
        </h2>
        <div className="mt-4 space-y-2">
          {FAQS.map((faq) => (
            <FaqItem key={faq.q} q={faq.q} a={faq.a} query={query} />
          ))}
        </div>
      </section>

      {/* ── Explore more ── */}
      <section className={cn("mt-10 grid grid-cols-1 sm:grid-cols-2 gap-3", !hasResults && "hidden")}>
        {ABOUT_SUBPAGES.filter((p) => matchesQuery(`${p.title} ${p.desc}`, query)).map((p) => (
          <div key={p.to} className="rounded-2xl bg-[var(--dk-surface-base)] p-5">
            <p className="text-sm font-semibold mb-1">{p.title}</p>
            <p className="text-xs text-muted-foreground mb-3">{p.desc}</p>
            <button
              onClick={() => navigate({ to: p.to })}
              className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              View details →
            </button>
          </div>
        ))}
      </section>
    </div>
  )
}

// ── Stat helper ──

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl bg-[var(--dk-surface-glass)] px-7 py-5 text-center min-w-[120px]">
      <p className="text-3xl font-extrabold sm:text-4xl" style={{ color: "#e94560" }}>
        {value}
      </p>
      <p className="text-xs font-medium text-muted-foreground/60 tracking-[0.05em] mt-1">
        {label}
      </p>
    </div>
  )
}
