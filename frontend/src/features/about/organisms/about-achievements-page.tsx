// TODO: Review this file
import { useMemo } from "react"
import { Helmet } from "react-helmet-async"
import { useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, MessageSquare, MousePointer, List, Dumbbell, Zap, Sparkles, Star, Users, Flame, ThumbsUp, Compass, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { userQueries, type AchievementDef } from "@/features/user/user-queries"
import "./about-achievements-page.scss"

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
  iconModifier: string
  match: (key: string) => boolean
}

const GROUP_CONFIGS: GroupConfig[] = [
  { label: "Review Milestones", icon: MessageSquare, iconModifier: "rose", match: (k) => k.startsWith("reviews_") || k === "first_review" },
  { label: "Interaction Milestones", icon: MousePointer, iconModifier: "sky", match: (k) => k.startsWith("interactions_") },
  { label: "List Milestones", icon: List, iconModifier: "indigo", match: (k) => k.startsWith("lists_") },
  { label: "Workout Logs", icon: Dumbbell, iconModifier: "emerald", section: "Workout", match: (k) => k.startsWith("workouts_") },
  { label: "Workout Streaks", icon: Flame, iconModifier: "orange", section: "Workout", match: (k) => k.startsWith("workout_streak_") },
  { label: "Level Milestones", icon: Zap, iconModifier: "amber", match: (k) => k.startsWith("level_") },
  { label: "Login Streaks", icon: Flame, iconModifier: "red", match: (k) => k.startsWith("streak_") },
  { label: "Review Streaks", icon: Flame, iconModifier: "pink", match: (k) => k.startsWith("review_streak_") },
  { label: "Social", icon: Users, iconModifier: "teal", match: (k) => k.startsWith("friends_") || k === "first_friend" },
  { label: "Review Quality", icon: ThumbsUp, iconModifier: "violet", match: (k) => k.startsWith("upvotes_") },
  { label: "Media Diversity", icon: Compass, iconModifier: "blue", match: (k) => k.startsWith("media_") },
  { label: "Special", icon: Sparkles, iconModifier: "pink", match: (k) => k === "perfect_10" },
]

// ── Helpers ──

function formatXp(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + "K"
  return String(n)
}

function renderBadgeRow(badges: AchievementDef[]) {
  const romanNumerals = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"]
  return (
    <div className="dk-about-achievements__badge-row">
      {badges.map((b, bi) => {
        const tierColor = TIER_COLORS[b.tier] ?? "#666"
        return (
          <div key={b.badgeKey}
            className="dk-about-achievements__badge"
            style={{ borderLeftColor: tierColor }}
          >
            <span className="dk-about-achievements__badge-tier" style={{ backgroundColor: tierColor + "18", color: tierColor }}>
              {b.tier === "special" ? <Star className="h-3.5 w-3.5" /> : romanNumerals[bi] ?? "?"}
            </span>
            <div className="dk-about-achievements__badge-content">
              <p className="dk-about-achievements__badge-label">{b.label}</p>
              <p className="dk-about-achievements__badge-desc">{b.description}</p>
            </div>
            <div className="dk-about-achievements__badge-xp">
              <p className="dk-about-achievements__badge-xp-value" style={{ color: tierColor }}>+{formatXp(b.xpReward)} XP</p>
              <span className="dk-about-achievements__badge-tier-tag" style={{ backgroundColor: tierColor + "14", color: tierColor }}>{b.tier}</span>
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
    <div className="dk-about-achievements">
      <Helmet>
        <title>Achievements - About - Otix</title>
        <meta name="description" content="All achievements and badges available on Otix." />
      </Helmet>

      <button onClick={() => navigate({ to: "/about" })}
        className="dk-about-achievements__back"
      >
        <ArrowLeft className="dk-about-achievements__back-icon" />
        Back to About
      </button>

      <div className="dk-about-achievements__header">
        <h1 className="dk-about-achievements__header-title">Achievements</h1>
        <p className="dk-about-achievements__header-desc">
          {allBadges?.length
            ? `${allBadges.length} achievements across 12 categories. Each grants a one-time XP bonus.`
            : "Badges are earned by hitting milestones across different activities. Each grants a one-time XP bonus."}
        </p>
      </div>

      {isLoading && (
        <div className="dk-about-achievements__skeleton-list">
          {[1, 2, 3].map((i) => (
            <div key={i} className="dk-about-achievements__skeleton">
              <div className="dk-about-achievements__skeleton-header">
                <div className="dk-about-achievements__skeleton-icon" />
                <div className="dk-about-achievements__skeleton-text" />
              </div>
              <div className="dk-about-achievements__skeleton-cards">
                {[1, 2, 3].map((j) => (
                  <div key={j} className="dk-about-achievements__skeleton-card" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && isError && (
        <p className="dk-about-achievements__error">
          Could not load achievements. Make sure the backend is running.
        </p>
      )}

      {!isLoading && !isError && allBadges && allBadges.length === 0 && (
        <p className="dk-about-achievements__empty">No achievements found.</p>
      )}

      {sections.length > 0 && (
        <div className="dk-about-achievements__sections">
          {sections.map((sec, si) => {
            if (sec.title) {
              return (
                <div key={sec.title} className="dk-about-achievements__section-group">
                  <p className="dk-about-achievements__section-title">{sec.title}</p>
                  <div className="dk-about-achievements__section-inner">
                    {sec.groups.map((g) => {
                      const Icon = g.config.icon
                      return (
                        <div key={g.config.label}>
                          <div className="dk-about-achievements__group-header">
                            <div className={cn("dk-about-achievements__group-icon", `dk-about-achievements__group-icon--${g.config.iconModifier}`)}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <h2 className="dk-about-achievements__group-label">{g.config.label}</h2>
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
              <div key={si} className="dk-about-achievements__section-group">
                <div className="dk-about-achievements__section-group-inner">
                  {sec.groups.map((g) => {
                    const Icon = g.config.icon
                    return (
                      <div key={g.config.label}>
                        <div className="dk-about-achievements__group-header">
                          <div className={cn("dk-about-achievements__group-icon", `dk-about-achievements__group-icon--${g.config.iconModifier}`)}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <h2 className="dk-about-achievements__group-label">{g.config.label}</h2>
                        </div>
                        {renderBadgeRow(g.badges)}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
