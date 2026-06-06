// TODO: Review this file
import { Helmet } from "react-helmet-async"
import { useNavigate } from "@tanstack/react-router"
import { ArrowLeft, Zap, Sparkles, Star, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import "./about-profile-page.scss"

// ── Data ──

const LEVEL_TITLES = [
  { range: "1–4", title: "Novice", color: "#d97706", stroke: 0 },
  { range: "5–9", title: "Apprentice", color: "#94a3b8", stroke: 30, dashed: true },
  { range: "10–19", title: "Adept", color: "#fbbf24", stroke: 35, dashed: true },
  { range: "20–34", title: "Expert", color: "#34d399", stroke: 50 },
  { range: "35–49", title: "Master", color: "#22d3ee", stroke: 80 },
  { range: "50–74", title: "Grandmaster", color: "#a78bfa", stroke: 40 },
  { range: "75–99", title: "Legend", color: "#f472b6", stroke: 55 },
  { range: "100+", title: "Transcendent", color: "#fb7185", stroke: 70 },
] as const

const REPUTATION_TIERS = [
  { range: "100–149", title: "Newcomer", color: "#94a3b8" },
  { range: "150–249", title: "Contributor", color: "#22d3ee" },
  { range: "250–399", title: "Trusted", color: "#34d399" },
  { range: "400–599", title: "Respected", color: "#fbbf24" },
  { range: "600–799", title: "Elite", color: "#a78bfa" },
  { range: "800–1000", title: "Pillar", color: "#e94560" },
] as const

// ── Sub-components ──

const INFINITY_PATH = "M445 1024 C445 700 805 745 1024 1024 C1243 1303 1603 1348 1603 1024 C1603 700 1243 745 1024 1024 C805 1303 445 1348 445 1024"

function LevelIcon({ level, color, index }: { level: (typeof LEVEL_TITLES)[number]; color: string; index: number }) {
  const cp = { cx:"1024", cy:"1024", r:"750", fill:"none", stroke:"rgba(255,255,255,0.08)", strokeWidth:"26" }
  const ip = { d:INFINITY_PATH, fill:"none", stroke:color, strokeLinecap:"round" as const, strokeLinejoin:"round" as const, ...(level.dashed ? { strokeDasharray:"8 20" as const } : {}) }

  if (index === 0) {
    return (
      <svg width="36" height="36" viewBox="0 0 2048 2048" className="dk-about-level-icon">
        <circle {...cp} />
      </svg>
    )
  }

  return (
    <svg width="36" height="36" viewBox="0 0 2048 2048" className="dk-about-level-icon">
      {/* Circle (not Grandmaster — rendered outside for layering) */}
      {index !== 5 && <circle {...cp} />}

      {/* 1. Apprentice — dotted */}
      {index === 1 && <path {...ip} strokeWidth={level.stroke} />}

      {/* 2. Adept — dotted */}
      {index === 2 && <path {...ip} strokeWidth={level.stroke} />}

      {/* 3. Expert — solid + 1 orbiting dot */}
      {index === 3 && (
        <>
          <path {...ip} strokeWidth={level.stroke} />
          <g style={{ transformOrigin:"1024px 1024px", animation:"dk-about-orb-d 12s linear infinite" }}><circle cx="1024" cy="274" r="28" fill={color} opacity=".85" style={{ animation:"dk-about-flare-1 3s ease-in-out 0s infinite" }} /></g>
        </>
      )}

      {/* 4. Master — glow + 2 orbiting dots */}
      {index === 4 && (
        <>
          <path {...ip} strokeWidth={level.stroke} style={{ filter:"drop-shadow(0 0 12px currentColor)" }} />
          <g style={{ transformOrigin:"1024px 1024px", animation:"dk-about-orb-d 12s linear infinite" }}>
            <circle cx="1024" cy="274" r="30" fill={color} opacity=".9" style={{ animation:"dk-about-flare-3 2.5s ease-in-out 0s infinite" }} />
            <circle cx="1024" cy="1774" r="22" fill={color} opacity=".65" style={{ animation:"dk-about-flare-1 3.5s ease-in-out 1.2s infinite" }} />
          </g>
        </>
      )}

      {/* 5. Grandmaster — dual ∞ + ring + 6 orbital dots */}
      {index === 5 && (
        <>
          <path {...ip} d="M345 1024 C345 600 805 645 1024 1024 C1243 1403 1703 1448 1703 1024 C1703 600 1243 645 1024 1024 C805 1403 345 1448 345 1024" strokeWidth={level.stroke} opacity=".35" />
          <path {...ip} d="M545 1024 C545 800 805 845 1024 1024 C1243 1203 1503 1248 1503 1024 C1503 800 1243 845 1024 1024 C805 1203 545 1248 545 1024" strokeWidth={level.stroke} />
          <circle cx="1024" cy="1024" r="600" fill="none" stroke={color} strokeWidth="12" opacity=".12" />
          <g style={{ transformOrigin:"1024px 1024px", animation:"dk-about-orb-d 12s linear infinite" }}>
            <circle cx="1024" cy="210" r="18" fill={color} opacity=".7" style={{ animation:"dk-about-flare-3 2s ease-in-out 0s infinite" }} />
            <circle cx="1024" cy="1838" r="18" fill={color} opacity=".7" style={{ animation:"dk-about-flare-1 2.8s ease-in-out 0.7s infinite" }} />
            <circle cx="210" cy="1024" r="18" fill={color} opacity=".7" style={{ animation:"dk-about-flare-5 3.2s ease-in-out 1.4s infinite" }} />
            <circle cx="1838" cy="1024" r="18" fill={color} opacity=".7" style={{ animation:"dk-about-flare-2 2.4s ease-in-out 2.1s infinite" }} />
            <circle cx="440" cy="440" r="14" fill={color} opacity=".5" style={{ animation:"dk-about-flare-4 3.6s ease-in-out 0.5s infinite" }} />
            <circle cx="1608" cy="1608" r="14" fill={color} opacity=".5" style={{ animation:"dk-about-flare-1 2.2s ease-in-out 1.8s infinite" }} />
          </g>
        </>
      )}

      {/* 6. Legend — angular + diamond + ring + 8 orbital dots */}
      {index === 6 && (
        <>
          <path {...ip} strokeLinecap="square" strokeWidth={level.stroke} />
          <path d="M700 1024 L1024 700 L1348 1024 L1024 1348Z" fill={color} fillOpacity="0.15" stroke={color} strokeWidth="20" strokeLinejoin="miter" />
          <circle cx="1024" cy="1024" r="620" fill="none" stroke={color} strokeWidth="8" opacity=".1" strokeDasharray="30 15" />
          <path d="M1024 80 L1024 170 M1024 1878 L1024 1968 M80 1024 L170 1024 M1878 1024 L1968 1024 M480 480 L545 545 M1503 1503 L1568 1568 M480 1568 L545 1503 M1503 545 L1568 480" stroke={color} strokeWidth="24" strokeLinecap="round" opacity=".4" />
          <g style={{ transformOrigin:"1024px 1024px", animation:"dk-about-orb-d 10s linear infinite" }}>
            <circle cx="1024" cy="210" r="16" fill={color} opacity=".65" style={{ animation:"dk-about-flare-5 1.8s ease-in-out 0s infinite" }} />
            <circle cx="1024" cy="1838" r="16" fill={color} opacity=".65" style={{ animation:"dk-about-flare-2 2.4s ease-in-out 0.5s infinite" }} />
            <circle cx="210" cy="1024" r="16" fill={color} opacity=".65" style={{ animation:"dk-about-flare-3 3s ease-in-out 1s infinite" }} />
            <circle cx="1838" cy="1024" r="16" fill={color} opacity=".65" style={{ animation:"dk-about-flare-1 2s ease-in-out 1.5s infinite" }} />
            <circle cx="440" cy="440" r="12" fill={color} opacity=".45" style={{ animation:"dk-about-flare-4 2.8s ease-in-out 0.3s infinite" }} />
            <circle cx="1608" cy="440" r="12" fill={color} opacity=".45" style={{ animation:"dk-about-flare-5 3.4s ease-in-out 1.2s infinite" }} />
            <circle cx="440" cy="1608" r="12" fill={color} opacity=".45" style={{ animation:"dk-about-flare-2 2.2s ease-in-out 2s infinite" }} />
            <circle cx="1608" cy="1608" r="12" fill={color} opacity=".45" style={{ animation:"dk-about-flare-3 3.8s ease-in-out 0.8s infinite" }} />
          </g>
        </>
      )}

      {/* 7. Transcendent — thick ∞ + diamond + dual ring + burst + 12 orbital dots */}
      {index === 7 && (
        <>
          <path {...ip} strokeWidth={level.stroke} style={{ filter:"drop-shadow(0 0 20px currentColor)" }} />
          <path d="M700 1024 L1024 700 L1348 1024 L1024 1348Z" fill={color} fillOpacity="0.1" stroke={color} strokeWidth="16" strokeLinejoin="miter" />
          <circle cx="1024" cy="1024" r="640" fill="none" stroke={color} strokeWidth="8" opacity=".1" />
          <circle cx="1024" cy="1024" r="520" fill="none" stroke={color} strokeWidth="5" opacity=".07" />
          <circle cx="200" cy="400" r="18" fill={color} opacity=".65" style={{ animation:"dk-about-flare-3 1.5s ease-in-out 0s infinite" }} />
          <circle cx="1848" cy="400" r="16" fill={color} opacity=".65" style={{ animation:"dk-about-flare-1 2s ease-in-out 0.4s infinite" }} />
          <circle cx="200" cy="1600" r="14" fill={color} opacity=".65" style={{ animation:"dk-about-flare-5 2.5s ease-in-out 0.8s infinite" }} />
          <circle cx="1848" cy="1600" r="20" fill={color} opacity=".65" style={{ animation:"dk-about-flare-2 1.8s ease-in-out 1.2s infinite" }} />
          <g style={{ transformOrigin:"1024px 1024px", animation:"dk-about-orb-d 8s linear infinite" }}>
            <circle cx="1024" cy="180" r="18" fill={color} opacity=".75" style={{ animation:"dk-about-flare-5 1.6s ease-in-out 0s infinite" }} />
            <circle cx="1024" cy="1868" r="18" fill={color} opacity=".75" style={{ animation:"dk-about-flare-2 2.2s ease-in-out 0.3s infinite" }} />
            <circle cx="180" cy="1024" r="18" fill={color} opacity=".75" style={{ animation:"dk-about-flare-4 2.8s ease-in-out 0.6s infinite" }} />
            <circle cx="1868" cy="1024" r="18" fill={color} opacity=".75" style={{ animation:"dk-about-flare-1 1.8s ease-in-out 0.9s infinite" }} />
            <circle cx="370" cy="370" r="13" fill={color} opacity=".55" style={{ animation:"dk-about-flare-3 2.4s ease-in-out 0.2s infinite" }} />
            <circle cx="1678" cy="370" r="13" fill={color} opacity=".55" style={{ animation:"dk-about-flare-5 3s ease-in-out 0.7s infinite" }} />
            <circle cx="370" cy="1678" r="13" fill={color} opacity=".55" style={{ animation:"dk-about-flare-2 2s ease-in-out 1.1s infinite" }} />
            <circle cx="1678" cy="1678" r="13" fill={color} opacity=".55" style={{ animation:"dk-about-flare-4 2.6s ease-in-out 0.5s infinite" }} />
            <circle cx="1024" cy="470" r="11" fill={color} opacity=".4" style={{ animation:"dk-about-flare-1 3.2s ease-in-out 0.4s infinite" }} />
            <circle cx="1024" cy="1578" r="11" fill={color} opacity=".4" style={{ animation:"dk-about-flare-3 2s ease-in-out 0.9s infinite" }} />
            <circle cx="470" cy="1024" r="11" fill={color} opacity=".4" style={{ animation:"dk-about-flare-5 2.6s ease-in-out 0.1s infinite" }} />
            <circle cx="1578" cy="1024" r="11" fill={color} opacity=".4" style={{ animation:"dk-about-flare-2 3.4s ease-in-out 0.6s infinite" }} />
          </g>
        </>
      )}

      {/* Grandmaster circle on top */}
      {index === 5 && <circle {...cp} />}

      {/* Transcendent dashed circle */}
      {index === 7 && (
        <circle cx="1024" cy="1024" r="770" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="22" strokeDasharray="100 20" />
      )}
    </svg>
  )
}

// ── Component ──

export function AboutProfilePage() {
  const navigate = useNavigate()

  return (
    <div className="dk-about-profile">
      <Helmet>
        <title>Profile Scores - About - Otix</title>
        <meta name="description" content="Learn how XP, levels, aura, and ratings work on Otix." />
      </Helmet>

      {/* Back link */}
      <button
        onClick={() => navigate({ to: "/about" })}
        className="dk-about-profile__back"
      >
        <ArrowLeft className="dk-about-profile__back-icon" />
        Back to About
      </button>

      {/* Heading */}
      <div className="dk-about-profile__header">
        <h1 className="dk-about-profile__header-title">Profile Scores</h1>
        <p className="dk-about-profile__header-desc">
          Your profile shows three scores that measure different things. Here's what each one means.
        </p>
      </div>

      {/* ── XP & Level ── */}
      <section className="dk-about-profile__section">
        <div>
          <div className="dk-about-profile__section-header">
            <div className={cn("dk-about-profile__section-icon", "dk-about-profile__section-icon--amber")}>
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h2 className="dk-about-profile__section-title">XP & Level</h2>
              <p className="dk-about-profile__section-subtitle">Your activity score</p>
            </div>
          </div>

          <p className="dk-about-profile__text">
            Every action on Otix earns XP — writing reviews, rating media, building lists,
            completing workouts, maintaining streaks, and more. Each level requires 300 XP.
            Your level title reflects your dedication to the platform.
          </p>

          {/* Level ladder */}
          <div className="dk-about-profile__ladder">
            {LEVEL_TITLES.map((t, i) => (
              <div
                key={t.title}
                className="dk-about-profile__ladder-item"
              >
                <span className="dk-about-profile__ladder-range">{t.range}</span>

                <LevelIcon level={t} color={t.color} index={i} />

                {/* Title */}
                <span className="dk-about-profile__ladder-title">{t.title}</span>

                {/* Chevron */}
                <ChevronRight className="dk-about-profile__ladder-chevron" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Aura ── */}
      <section className={cn("dk-about-profile__section", "dk-about-profile__section--mt")}>
        <div>
          <div className="dk-about-profile__section-header">
            <div className={cn("dk-about-profile__section-icon", "dk-about-profile__section-icon--violet")}>
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="dk-about-profile__section-title">Aura</h2>
              <p className="dk-about-profile__section-subtitle">0–1000 scale, starts at 100</p>
            </div>
          </div>

          <p className="dk-about-profile__text">
            Your aura is a composite score that represents your standing in the community.
            It's built from four pillars: contribution (reviews, lists, workouts), trust
            (boosted or reduced by your user rating), tenure (account age and streak
            consistency), and impact (community karma from upvotes on your reviews).
          </p>

          {/* Reputation ladder */}
          <div className="dk-about-profile__ladder">
            {REPUTATION_TIERS.map((t, i) => {
              const isLast = i === REPUTATION_TIERS.length - 1
              return (
                <div
                  key={t.title}
                  className="dk-about-profile__ladder-item"
                >
                  {/* Step indicator */}
                  <div className="dk-about-profile__step">
                    <span
                      className="dk-about-profile__step-badge"
                      style={{
                        backgroundColor: `${t.color}18`,
                        color: t.color,
                        boxShadow: isLast ? `0 0 12px ${t.color}40` : undefined,
                      }}
                    >
                      {i + 1}
                    </span>
                    {!isLast && (
                      <span className="dk-about-profile__step-line" />
                    )}
                  </div>

                  {/* Range */}
                  <span className="dk-about-profile__ladder-range dk-about-profile__ladder-range--wide">{t.range}</span>

                  {/* Title */}
                  <span className="dk-about-profile__ladder-title">{t.title}</span>

                  {/* Endgame badge for Pillar */}
                  {isLast && (
                    <span className="dk-about-profile__endgame">
                      Max
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── User Rating ── */}
      <section className={cn("dk-about-profile__section", "dk-about-profile__section--mt")}>
        <div>
          <div className="dk-about-profile__section-header">
            <div className={cn("dk-about-profile__section-icon", "dk-about-profile__section-icon--yellow")}>
              <Star className="h-5 w-5" />
            </div>
            <div>
              <h2 className="dk-about-profile__section-title">User Rating</h2>
              <p className="dk-about-profile__section-subtitle">1–10 scale from other users</p>
            </div>
          </div>

          {/* Star scale visual */}
          <div className="dk-about-profile__star-scale">
            {Array.from({ length: 10 }, (_, i) => (
              <div
                key={i}
                className="dk-about-profile__star-bar"
                style={{
                  background: `oklch(${0.3 + i * 0.04} ${0.01 + i * 0.017} ${75 - i * 0.5})`,
                  opacity: 0.5 + i * 0.05,
                }}
              />
            ))}
          </div>

          <div className="dk-about-profile__star-labels">
            <span>Poor</span>
            <span>Average</span>
            <span>Excellent</span>
          </div>

          <p className="dk-about-profile__text">
            Other users can rate your profile on a 1–10 scale. Your average rating is shown
            with stars on your profile, and it directly boosts or reduces your aura through
            the trust pillar — ratings above 5 increase it, ratings below 5 decrease it.
            The more ratings you receive, the more weight they carry.
          </p>
        </div>
      </section>
    </div>
  )
}
