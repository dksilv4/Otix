// TODO: Review this file
import { useState, useMemo, useEffect } from "react"
import { Helmet } from "react-helmet-async"
import { useNavigate } from "@tanstack/react-router"
import { ChevronDown, ArrowRight, Search, Star, List, Trophy, Link, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Logo } from "@/features/dk-ui/atoms/logo"
import { MEDIA_TYPES as MEDIA_TYPE_KEYS, MEDIA_TYPE_ICON, MEDIA_TYPE_COLOR_TINTED } from "@/constants/media"
import "./about-page.scss"

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
      <mark className="dk-about-highlight">
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
    <div className="dk-about-faq__item">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="dk-about-faq__button"
      >
        <span className="dk-about-faq__question">{highlight(q, query)}</span>
        <ChevronDown
          className={cn(
            "dk-about-faq__chevron",
            open && "dk-about-faq__chevron--open",
          )}
        />
      </button>
      {open && (
        <div className="dk-about-faq__answer">
          <p className="dk-about-faq__answer-text">{highlight(a, query)}</p>
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
    <div className="dk-about-page">
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
      <section className="dk-about-hero">
        <div>
          <Logo className="dk-about-hero__logo" />

          <h1 className="dk-about-hero__heading">About Otix</h1>
          <p className="dk-about-hero__desc">
            Your personal media command center. Track, rate, review, and discover across movies,
            shows, games, and music — all in one place, for free.
          </p>

          {/* Stats */}
          <div className="dk-about-hero__stats">
            <Stat value="4" label="MEDIA TYPES" />
            <Stat value="∞" label="100% FREE" />
            <Stat value="100+" label="ACHIEVEMENTS" />
          </div>
        </div>
      </section>

      {/* ── Slim Search ── */}
      <div className="dk-about-search">
        <div className="dk-about-search__bar">
          <div className="dk-about-search__input-wrap">
            <Search className="dk-about-search__icon" />
            <input
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search about content..."
              className="dk-about-search__input"
            />
          </div>
          {searchValue ? (
            <button
              onClick={handleClear}
              className={cn("dk-about-search__btn", "dk-about-search__btn--clear")}
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <button
              disabled
              className={cn("dk-about-search__btn", "dk-about-search__btn--disabled")}
              aria-label="Search"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Results count ── */}
      {query && !hasResults && (
        <p className="dk-about-no-results">
          No results found for &ldquo;{query}&rdquo;. Try a different term.
        </p>
      )}

      {/* ── What is Otix? ── */}
      <section className={cn("dk-about-section", !hasResults && "dk-about-section--hidden")}>
        <h2 className="dk-about-section__title">
          What is Otix?
        </h2>

        {/* Media type pills */}
        <div className="dk-about-media-pills">
          {MEDIA_TYPE_PILLS.filter((m) => matchesQuery(m.label, query)).map((m) => {
            const Icon = m.icon
            return (
              <span
                key={m.label}
                className={cn("dk-about-media-pill", m.color)}
              >
                <Icon className="h-3.5 w-3.5" />
                {m.label}
              </span>
            )
          })}
        </div>

        <p className="dk-about-text">
          Otix is a media tracking and discovery platform.{" "}
          <span className="dk-about-text--highlight">
            Track movies, shows, games, and music
          </span>{" "}
          in one place — rate what you've experienced, write reviews, build curated lists, and earn
          XP as you go.
        </p>
        <p className="dk-about-text">
          Connect your accounts from{" "}
          <span className="dk-about-text--highlight">
            Steam, Plex, Spotify, YouTube, TMDb, and Google
          </span>{" "}
          to import your libraries, sync your history, and share what you're playing or listening to.
        </p>

        {/* Feature grid */}
        <div className="dk-about-features">
          {FEATURES.filter((f) => matchesQuery(`${f.title} ${f.desc}`, query)).map((f) => {
            const Icon = f.icon
            return (
              <div
                key={f.title}
                className="dk-about-feature"
              >
                <div
                  className={cn(
                    "dk-about-feature__icon",
                    f.iconBg,
                    f.iconColor,
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="dk-about-feature__content">
                  <p className="dk-about-feature__title">{highlight(f.title, query)}</p>
                  <p className="dk-about-feature__desc">{highlight(f.desc, query)}</p>
                </div>
              </div>
            )
          })}
        </div>

        <p className="dk-about-text">
          Otix is built for people who take their media seriously —{" "}
          <span className="dk-about-text--highlight">
            not just what you watch, but what you think about it
          </span>
          . Discover new favorites through the community, follow people with similar taste, and find
          the next thing worth your time.
        </p>
      </section>

      {/* ── Quick Answers ── */}
      <section className={cn("dk-about-section", !hasResults && "dk-about-section--hidden")}>
        <h2 className="dk-about-section__title">
          Quick Answers
        </h2>
        <div className="dk-about-faq">
          {FAQS.map((faq) => (
            <FaqItem key={faq.q} q={faq.q} a={faq.a} query={query} />
          ))}
        </div>
      </section>

      {/* ── Explore more ── */}
      <section className={cn("dk-about-explore", !hasResults && "dk-about-section--hidden")}>
        {ABOUT_SUBPAGES.filter((p) => matchesQuery(`${p.title} ${p.desc}`, query)).map((p) => (
          <div key={p.to} className="dk-about-explore__card">
            <p className="dk-about-explore__card-title">{p.title}</p>
            <p className="dk-about-explore__card-desc">{p.desc}</p>
            <button
              onClick={() => navigate({ to: p.to })}
              className="dk-about-explore__card-link"
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
    <div className="dk-about-stat">
      <p className="dk-about-stat__value" style={{ color: "#e94560" }}>
        {value}
      </p>
      <p className="dk-about-stat__label">
        {label}
      </p>
    </div>
  )
}
