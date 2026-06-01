import { useState } from "react"
import { Helmet } from "react-helmet-async"
import { ChevronDown, Zap, Sparkles, Star } from "lucide-react"
import { cn } from "@/lib/utils"

// ── Profile scores data ──

const LEVEL_TITLES = [
  { range: "1–4", title: "Novice", color: "#d97706" },
  { range: "5–9", title: "Apprentice", color: "#94a3b8" },
  { range: "10–19", title: "Adept", color: "#fbbf24" },
  { range: "20–34", title: "Expert", color: "#34d399" },
  { range: "35–49", title: "Master", color: "#22d3ee" },
  { range: "50–74", title: "Grandmaster", color: "#a78bfa" },
  { range: "75–99", title: "Legend", color: "#a78bfa" },
  { range: "100+", title: "Transcendent", color: "#a78bfa" },
] as const

const REPUTATION_TIERS = [
  { range: "100–149", title: "Newcomer" },
  { range: "150–249", title: "Contributor" },
  { range: "250–399", title: "Trusted" },
  { range: "400–599", title: "Respected" },
  { range: "600–799", title: "Elite" },
  { range: "800–1000", title: "Pillar" },
] as const

const TIER_COLORS: Record<string, string> = {
  bronze: "#cd7f32",
  silver: "#a8b2c1",
  gold: "#f0b90b",
  platinum: "#55c0e0",
  special: "#e8326e",
}

interface BadgeInfo {
  label: string
  desc: string
  tier: string
}

const ACHIEVEMENT_GROUPS: { label: string; badges: BadgeInfo[] }[] = [
  {
    label: "Review Milestones",
    badges: [
      { label: "First Words", desc: "Write your first review", tier: "special" },
      { label: "Critic", desc: "Write 10 reviews", tier: "bronze" },
      { label: "Prolific Critic", desc: "Write 50 reviews", tier: "silver" },
      { label: "Review Machine", desc: "Write 100 reviews", tier: "gold" },
      { label: "Legendary Critic", desc: "Write 500 reviews", tier: "platinum" },
    ],
  },
  {
    label: "Interaction Milestones",
    badges: [
      { label: "Consumer", desc: "100 media interactions", tier: "bronze" },
      { label: "Power User", desc: "500 media interactions", tier: "silver" },
      { label: "Media Mogul", desc: "1,000 media interactions", tier: "gold" },
    ],
  },
  {
    label: "List Milestones",
    badges: [
      { label: "Curator", desc: "Create 10 lists", tier: "bronze" },
      { label: "Master Curator", desc: "Create 50 lists", tier: "silver" },
      { label: "Archivist", desc: "Create 100 lists", tier: "gold" },
    ],
  },
  {
    label: "Workout Milestones",
    badges: [
      { label: "Regular", desc: "Log 50 workouts", tier: "bronze" },
      { label: "Athlete", desc: "Log 200 workouts", tier: "silver" },
      { label: "Iron Will", desc: "Log 500 workouts", tier: "gold" },
    ],
  },
  {
    label: "Level Milestones",
    badges: [
      { label: "Rising Star", desc: "Reach level 5", tier: "bronze" },
      { label: "Established", desc: "Reach level 10", tier: "silver" },
      { label: "Veteran", desc: "Reach level 20", tier: "gold" },
      { label: "Elite", desc: "Reach level 50", tier: "platinum" },
      { label: "Transcendent", desc: "Reach level 100", tier: "platinum" },
    ],
  },
  {
    label: "Special",
    badges: [
      { label: "Social Butterfly", desc: "Make your first friend", tier: "special" },
      { label: "Week Warrior", desc: "7-day login streak", tier: "special" },
      { label: "Monthly Dedication", desc: "30-day login streak", tier: "silver" },
      { label: "Perfect 10", desc: "Rated 10/10 by 5+ users", tier: "gold" },
    ],
  },
]

const FAQS = [
  {
    q: "What media types does Otix support?",
    a: "Otix supports movies, TV shows, games, and music. You can search, rate, review, and organize all four types into lists and collections.",
  },
  {
    q: "How do I earn XP?",
    a: "You earn XP for almost everything you do on Otix. Writing a review with text gives 150 XP, a score-only review gives 50 XP, marking media as watched or played gives 30 XP, and interactions like likes or watchlist adds give 10 XP. Creating lists, completing workouts, maintaining streaks, and even gaining followers all earn XP. See the Profile Scores section above for how XP translates to levels.",
  },
  {
    q: "How do I connect external accounts?",
    a: "Visit Settings → Integrations to connect Steam, Plex, Spotify, YouTube, TMDb, or Google. Connecting accounts lets you import your library, sync watch history, and share what you're playing or listening to on your profile.",
  },
  {
    q: "Is Otix free?",
    a: "Yes, Otix is free to use. There are no paid tiers or premium features.",
  },
  {
    q: "How do reviews and ratings work?",
    a: "You can rate any media item and optionally write a full review. Ratings help personalize your recommendations, and reviews appear on your profile for others to discover. There is a short cooldown between reviews to encourage thoughtful writing.",
  },
  {
    q: "What are lists?",
    a: "Lists let you curate collections of media around any theme — favorites, watchlist, genre deep-dives, or anything else. Lists can be public or private and appear on your profile.",
  },
  {
    q: "How do I change my content preferences?",
    a: "Go to Settings → Preferences to set your preferred media types, favorite genres, and language preferences. These tailor your home page and search results.",
  },
  {
    q: "Can I hide my activity or profile sections?",
    a: "Yes. In Settings → Profile you can choose which sections appear on your public profile. Integration visibility (Steam, Plex, TMDb) can also be set individually to everyone, friends only, or hidden.",
  },
  {
    q: "How do I report a bug or suggest a feature?",
    a: "You can submit feedback through the admin proposals page if you have access, or reach out directly to the Otix team.",
  },
]

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-2xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-sm)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="text-sm font-medium pr-4">{q}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="px-5 pb-4 pt-0">
          <p className="text-sm text-muted-foreground leading-relaxed">{a}</p>
        </div>
      )}
    </div>
  )
}

export function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl pb-16">
      <Helmet>
        <title>About - Otix</title>
      </Helmet>

      {/* About */}
      <section className="mt-6">
        <h1 className="text-2xl font-bold tracking-[-0.02em]">About Otix</h1>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          Otix is a media tracking and discovery platform. Track movies, shows, games, and
          music in one place — rate what you've experienced, write reviews, build curated
          lists, and earn XP as you go.
        </p>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          Connect your accounts from Steam, Plex, Spotify, YouTube, TMDb, and Google to
          import your libraries, sync your history, and share what you're playing or
          listening to. Your profile becomes a living record of your taste across every
          medium.
        </p>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          Otix is built for people who take their media seriously — not just what you watch,
          but what you think about it. Discover new favorites through the community, follow
          people with similar taste, and find the next thing worth your time.
        </p>
      </section>

      {/* Profile Scores */}
      <section className="mt-12">
        <h2 className="text-xl font-bold tracking-[-0.02em]">Profile Scores</h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          Your profile shows three scores that measure different things.
          Here's what each one means.
        </p>

        <div className="mt-5 space-y-4">
          {/* XP & Level */}
          <div className="rounded-2xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-sm)] p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
                <Zap className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">XP & Level</h3>
                <p className="text-xs text-muted-foreground">Your activity score</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Every action on Otix earns XP — writing reviews, rating media, building lists,
              completing workouts, maintaining streaks, and more. Each level requires 300 XP.
              Your level title reflects your dedication to the platform.
            </p>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {LEVEL_TITLES.map((t) => (
                <div
                  key={t.title}
                  className="flex items-center gap-2 rounded-lg bg-[var(--dk-surface-raised)] px-3 py-2"
                >
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: t.color }}
                  />
                  <span className="text-xs text-muted-foreground">{t.range}</span>
                  <span className="text-xs font-medium ml-auto">{t.title}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Aura */}
          <div className="rounded-2xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-sm)] p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Aura</h3>
                <p className="text-xs text-muted-foreground">0–1000 scale, starts at 100</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your aura is a composite score that represents your standing in the community.
              It's built from four pillars: contribution (reviews, lists, workouts), trust
              (boosted or reduced by your user rating), tenure (account age and streak
              consistency), and impact (community karma from upvotes on your reviews).
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {REPUTATION_TIERS.map((t) => (
                <div
                  key={t.title}
                  className="flex items-center gap-1.5 rounded-lg bg-[var(--dk-surface-raised)] px-3 py-1.5"
                >
                  <span className="text-xs text-muted-foreground">{t.range}</span>
                  <span className="text-xs font-medium">{t.title}</span>
                </div>
              ))}
            </div>
          </div>

          {/* User Rating */}
          <div className="rounded-2xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-sm)] p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-yellow-500/10 text-yellow-500">
                <Star className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">User Rating</h3>
                <p className="text-xs text-muted-foreground">1–10 scale from other users</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Other users can rate your profile on a 1–10 scale. Your average rating is shown
              with stars on your profile, and it directly boosts or reduces your aura through
              the trust pillar — ratings above 5 increase it, ratings below 5 decrease it.
              The more ratings you receive, the more weight they carry.
            </p>
          </div>
        </div>
      </section>

      {/* Achievements */}
      <section className="mt-12">
        <h2 className="text-xl font-bold tracking-[-0.02em]">Achievements</h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          Badges are earned by hitting milestones across different activities.
          They appear on your profile to show off your progress.
        </p>

        <div className="mt-5 space-y-4">
          {ACHIEVEMENT_GROUPS.map((group) => (
            <div key={group.label} className="rounded-2xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-sm)] p-5">
              <h3 className="text-sm font-semibold mb-3">{group.label}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {group.badges.map((b) => (
                  <div
                    key={b.label}
                    className="flex items-center gap-3 rounded-xl bg-[var(--dk-surface-raised)] px-3 py-2.5"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: TIER_COLORS[b.tier] }}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{b.label}</p>
                      <p className="text-xs text-muted-foreground">{b.desc}</p>
                    </div>
                    <span
                      className="ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                      style={{
                        backgroundColor: TIER_COLORS[b.tier] + "18",
                        color: TIER_COLORS[b.tier],
                      }}
                    >
                      {b.tier}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="mt-12">
        <h2 className="text-xl font-bold tracking-[-0.02em]">FAQ</h2>
        <div className="mt-4 space-y-2">
          {FAQS.map((faq) => (
            <FaqItem key={faq.q} q={faq.q} a={faq.a} />
          ))}
        </div>
      </section>
    </div>
  )
}
