import { useMemo } from "react"
import { Helmet } from "react-helmet-async"
import { useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, MessageSquare, MousePointer, List, Dumbbell, Zap, Sparkles, Star, Users, Flame, ThumbsUp, Compass, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { userQueries, type AchievementDef } from "@/features/user/user-queries"

// ── Tier colors ──

const TIER_COLORS: Record<string, string> = {
  bronze: "#cd7f32",
  silver: "#a8b2c1",
  gold: "#f0b90b",
  platinum: "#55c0e0",
  special: "#e8326e",
}

// ── Group configuration ──

interface GroupConfig {
  label: string
  section?: string
  icon: LucideIcon
  iconColor: string
  iconBg: string
  match: (key: string) => boolean
}

const GROUP_CONFIGS: GroupConfig[] = [
  { label: "Review Milestones", icon: MessageSquare, iconColor: "text-rose-400", iconBg: "bg-rose-400/10", match: (k) => k.startsWith("reviews_") || k === "first_review" },
  { label: "Interaction Milestones", icon: MousePointer, iconColor: "text-sky-400", iconBg: "bg-sky-400/10", match: (k) => k.startsWith("interactions_") },
  { label: "List Milestones", icon: List, iconColor: "text-indigo-400", iconBg: "bg-indigo-400/10", match: (k) => k.startsWith("lists_") },
  { label: "Workout Logs", icon: Dumbbell, iconColor: "text-emerald-400", iconBg: "bg-emerald-400/10", section: "Workout", match: (k) => k.startsWith("workouts_") },
  { label: "Workout Streaks", icon: Flame, iconColor: "text-orange-400", iconBg: "bg-orange-400/10", section: "Workout", match: (k) => k.startsWith("workout_streak_") },
  { label: "Level Milestones", icon: Zap, iconColor: "text-amber-400", iconBg: "bg-amber-400/10", match: (k) => k.startsWith("level_") },
  { label: "Login Streaks", icon: Flame, iconColor: "text-red-400", iconBg: "bg-red-400/10", match: (k) => k.startsWith("streak_") },
  { label: "Review Streaks", icon: Flame, iconColor: "text-pink-400", iconBg: "bg-pink-400/10", match: (k) => k.startsWith("review_streak_") },
  { label: "Social", icon: Users, iconColor: "text-teal-400", iconBg: "bg-teal-400/10", match: (k) => k.startsWith("friends_") || k === "first_friend" },
  { label: "Review Quality", icon: ThumbsUp, iconColor: "text-violet-400", iconBg: "bg-violet-400/10", match: (k) => k.startsWith("upvotes_") },
  { label: "Media Diversity", icon: Compass, iconColor: "text-blue-400", iconBg: "bg-blue-400/10", match: (k) => k.startsWith("media_") },
  { label: "Special", icon: Sparkles, iconColor: "text-pink-400", iconBg: "bg-pink-400/10", match: (k) => k === "perfect_10" },
]

// ── Helpers ──

function formatXp(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + "K"
  return String(n)
}

function renderBadgeRow(badges: AchievementDef[]) {
  const romanNumerals = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"]
  return (
    <div className="flex gap-3 overflow-x-auto">
      {badges.map((b, bi) => {
        const tierColor = TIER_COLORS[b.tier] ?? "#666"
        return (
          <div key={b.badgeKey}
            className={cn("flex items-center gap-3 rounded-xl px-4 py-3", "bg-[var(--dk-surface-raised)]", "border-l-2 transition-colors hover:bg-white/[0.04]", "w-[280px] shrink-0")}
            style={{ borderLeftColor: tierColor }}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold" style={{ backgroundColor: tierColor + "18", color: tierColor }}>
              {b.tier === "special" ? <Star className="h-3.5 w-3.5" /> : romanNumerals[bi] ?? "?"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{b.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{b.description}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs font-semibold" style={{ color: tierColor }}>+{formatXp(b.xpReward)} XP</p>
              <span className="inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider mt-0.5" style={{ backgroundColor: tierColor + "14", color: tierColor }}>{b.tier}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Component ──

export function AboutAchievementsPage() {
  const navigate = useNavigate()
  const { data: allBadges, isLoading, isError } = useQuery(userQueries.achievementDefs())

  // Build grouped sections
  const sections = useMemo(() => {
    if (!allBadges) return []

    const groupedByConfig: { config: GroupConfig; badges: AchievementDef[] }[] = GROUP_CONFIGS
      .map((cfg) => ({ config: cfg, badges: allBadges.filter((b) => cfg.match(b.badgeKey)).sort((a, b) => a.target - b.target) }))
      .filter((g) => g.badges.length > 0)

    // Group into sections (same section title = parent wrapper)
    const result: { title?: string; groups: typeof groupedByConfig }[] = []
    for (const g of groupedByConfig) {
      if (g.config.section) {
        const last = result[result.length - 1]
        if (last?.title === g.config.section) {
          last.groups.push(g)
        } else {
          result.push({ title: g.config.section, groups: [g] })
        }
      } else {
        result.push({ groups: [g] })
      }
    }
    return result
  }, [allBadges])

  return (
    <div className="mx-auto max-w-2xl pb-16">
      <Helmet>
        <title>Achievements - About - Otix</title>
        <meta name="description" content="All achievements and badges available on Otix." />
      </Helmet>

      <button onClick={() => navigate({ to: "/about" })}
        className="group mb-6 mt-2 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        Back to About
      </button>

      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-[-0.02em]">Achievements</h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          {allBadges?.length
            ? `${allBadges.length} achievements across 12 categories. Each grants a one-time XP bonus.`
            : "Badges are earned by hitting milestones across different activities. Each grants a one-time XP bonus."}
        </p>
      </div>

      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl bg-[var(--dk-surface-base)] p-5 sm:p-6 animate-pulse">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-9 w-9 rounded-xl bg-white/[0.06]" />
                <div className="h-4 w-32 rounded bg-white/[0.06]" />
              </div>
              <div className="flex gap-3">
                {[1, 2, 3].map((j) => (
                  <div key={j} className="w-[280px] h-20 rounded-xl bg-white/[0.04]" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && isError && (
        <p className="text-sm text-muted-foreground text-center mt-8">
          Could not load achievements. Make sure the backend is running.
        </p>
      )}

      {!isLoading && !isError && allBadges && allBadges.length === 0 && (
        <p className="text-sm text-muted-foreground text-center mt-8">No achievements found.</p>
      )}

      {sections.length > 0 && (
        <div className="space-y-6">
          {sections.map((sec, si) => {
            if (sec.title) {
              return (
                <div key={sec.title} className="rounded-2xl bg-[var(--dk-surface-base)] p-5 sm:p-6">
                  <p className="text-xs font-semibold tracking-[0.08em] uppercase text-muted-foreground/40 mb-4">{sec.title}</p>
                  <div className="space-y-4">
                    {sec.groups.map((g) => {
                      const Icon = g.config.icon
                      return (
                        <div key={g.config.label}>
                          <div className="flex items-center gap-3 mb-4">
                            <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", g.config.iconBg, g.config.iconColor)}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <h2 className="text-base font-semibold">{g.config.label}</h2>
                          </div>
                          {renderBadgeRow(g.badges)}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            }
            return (
              <div key={si} className="rounded-2xl bg-[var(--dk-surface-base)] p-5 sm:p-6 space-y-4">
                {sec.groups.map((g) => {
                  const Icon = g.config.icon
                  return (
                    <div key={g.config.label}>
                      <div className="flex items-center gap-3 mb-4">
                        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", g.config.iconBg, g.config.iconColor)}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <h2 className="text-base font-semibold">{g.config.label}</h2>
                      </div>
                      {renderBadgeRow(g.badges)}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
