import { useState, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from '@tanstack/react-router'
import {
  ShieldCheck,
  Server,
  Lock,
  EyeOff,
  Cookie,
  UserCheck,
  Trash2,
  Mail,
  FileText,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  Laptop,
  Radio,
  ArrowUpRight,
  ShieldOff,
  Layers,
} from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { DkBadge } from '@ui/atoms/badge'
import { useToast } from '@ui/molecules/toast'
import { LegalNav } from '@/components/legal-nav'
import { PRIVACY_SECTIONS, scrollToLegalSection } from '@/lib/utils/legal'
import { COOKIE_CONSENT_KEY, getCookieConsent } from '@/lib/utils/cookies'

export const PrivacyPage = () => {
  const { toast } = useToast()
  const [copiedEmail, setCopiedEmail] = useState(false)
  const [cookieConsent, setCookieConsent] = useState<string | null>(null)

  useEffect(() => {
    setCookieConsent(getCookieConsent())
  }, [])

  const handleCopyEmail = (email: string) => {
    navigator.clipboard.writeText(email).then(() => {
      setCopiedEmail(true)
      toast({
        title: 'Email Copied',
        description: `${email} copied to clipboard.`,
        variant: 'success',
      })
      setTimeout(() => setCopiedEmail(false), 2500)
    })
  }

  const handleResetCookieChoice = () => {
    try {
      localStorage.removeItem(COOKIE_CONSENT_KEY)
      setCookieConsent(null)
      toast({
        title: 'Cookie Preferences Reset',
        description: 'Your stored cookie choices have been cleared. The notice banner will appear on your next visit.',
        variant: 'success',
      })
    } catch {
      toast({
        title: 'Action Failed',
        description: 'Unable to clear cookie choices from local storage.',
        variant: 'error',
      })
    }
  }

  return (
    <div id="privacy-page" className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-10">
      <Helmet>
        <title>Privacy Policy &amp; Data Rights — Otix</title>
        <meta
          name="description"
          content="Privacy Policy, Cookie Policy, Data Minimization, and User Rights (GDPR/CCPA) for Otix."
        />
      </Helmet>

      {/* Shared Legal Navigation Tabs */}
      <LegalNav activeTab="privacy" />

      {/* Hero Header */}
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <DkBadge variant="default" size="sm" className="gap-1.5 px-3 py-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>GDPR, CCPA &amp; Privacy Standards</span>
          </DkBadge>
          <DkBadge variant="secondary" size="sm" className="gap-1.5 px-3 py-1">
            <Radio className="h-3.5 w-3.5" />
            <span>Direct BYOS Streaming</span>
          </DkBadge>
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground">
            Privacy &amp; Cookie Policy
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-3xl leading-relaxed">
            Otix is engineered from the ground up on <strong>strict data minimization</strong> and a Bring-Your-Own-Server (BYOS) architecture. Your personal media files and playback streams stay between your client and your private servers—they never touch our servers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-muted-foreground">
          <span>Last Updated: <strong>October 2026</strong></span>
          <span className="opacity-40">·</span>
          <span>Effective Immediately</span>
          <span className="opacity-40">·</span>
          <span className="text-primary font-medium flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> Zero Data Selling Guarantee
          </span>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <DkButton
            variant="secondary"
            size="sm"
            onClick={() => scrollToLegalSection('cookies')}
            leftIcon={Cookie}
          >
            Manage Cookies
          </DkButton>

          <DkButton
            asChild
            variant="ghost"
            size="sm"
            className="text-foreground/80 hover:text-foreground"
          >
            <Link to="/settings/account">
              <UserCheck className="h-3.5 w-3.5 mr-1.5" />
              Account &amp; Erasure
            </Link>
          </DkButton>

          <DkButton
            variant="ghost"
            size="sm"
            onClick={() => handleCopyEmail('privacy@otix.app')}
            className="text-foreground/80 hover:text-foreground"
          >
            {copiedEmail ? (
              <Check className="h-3.5 w-3.5 mr-1.5 text-primary" />
            ) : (
              <Copy className="h-3.5 w-3.5 mr-1.5" />
            )}
            <span>Copy Privacy Desk Email</span>
          </DkButton>
        </div>
      </header>

      {/* Data Minimization Pledge Highlight Card */}
      <div className="rounded-2xl sm:rounded-3xl p-6 sm:p-7 backdrop-blur-xl bg-primary/[0.04] dark:bg-primary/[0.08] border border-primary/20 shadow-[var(--dk-shadow-sm)] space-y-3">
        <div className="flex items-center gap-2.5 text-primary font-bold text-sm sm:text-base">
          <EyeOff className="h-5 w-5 shrink-0" />
          <span>Zero Unnecessary Data Collection Pledge</span>
        </div>
        <p className="text-xs sm:text-sm text-foreground/80 leading-relaxed">
          Otix is built on the core principle of <strong>strict data minimization</strong>. We only collect the minimal information necessary to deliver account authentication, synchronize your personal library preferences, and establish direct playback sessions. <strong>We do not sell personal data, maintain tracking pixels, or use third-party behavioral advertising brokers.</strong>
        </p>
      </div>

      {/* Key Takeaways At A Glance */}
      <section className="space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Core Privacy Commitments At A Glance
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl p-5 bg-[var(--dk-surface-base)] backdrop-blur-xl border border-[var(--dk-separator)] shadow-[var(--dk-shadow-xs)] hover:shadow-[var(--dk-shadow-sm)] transition-all space-y-2.5">
            <div className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <ShieldOff className="h-4 w-4" />
            </div>
            <h3 className="font-bold text-sm text-foreground">Zero Tracking Pixels</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              No cross-site tracking, advertising pixels (Meta, TikTok), or behavioral advertising brokers.
            </p>
          </div>

          <div className="rounded-2xl p-5 bg-[var(--dk-surface-base)] backdrop-blur-xl border border-[var(--dk-separator)] shadow-[var(--dk-shadow-xs)] hover:shadow-[var(--dk-shadow-sm)] transition-all space-y-2.5">
            <div className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Server className="h-4 w-4" />
            </div>
            <h3 className="font-bold text-sm text-foreground">Direct BYOS Playback</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Streams flow peer-to-peer from your private media servers (Plex, Jellyfin) to your browser.
            </p>
          </div>

          <div className="rounded-2xl p-5 bg-[var(--dk-surface-base)] backdrop-blur-xl border border-[var(--dk-separator)] shadow-[var(--dk-shadow-xs)] hover:shadow-[var(--dk-shadow-sm)] transition-all space-y-2.5">
            <div className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Lock className="h-4 w-4" />
            </div>
            <h3 className="font-bold text-sm text-foreground">Encrypted Storage</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Integration tokens encrypted at rest; passwords hashed with argon2/bcrypt. Media files never uploaded.
            </p>
          </div>

          <div className="rounded-2xl p-5 bg-[var(--dk-surface-base)] backdrop-blur-xl border border-[var(--dk-separator)] shadow-[var(--dk-shadow-xs)] hover:shadow-[var(--dk-shadow-sm)] transition-all space-y-2.5">
            <div className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Trash2 className="h-4 w-4" />
            </div>
            <h3 className="font-bold text-sm text-foreground">Complete Erasure</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Full GDPR Art. 17 &amp; CCPA compliance. Self-service deletion from settings or email SLA within 30 days.
            </p>
          </div>
        </div>
      </section>

      {/* Quick Navigation Scroll Chips */}
      <nav aria-label="Policy sections" className="sticky top-16 z-20 -mx-4 px-4 sm:mx-0 sm:px-0 py-2.5 bg-background/80 backdrop-blur-md border-y border-[var(--dk-separator)]">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
          <span className="text-xs font-semibold text-muted-foreground shrink-0 flex items-center gap-1 pl-1 pr-2">
            <Sparkles className="h-3 w-3 text-primary" /> Jump to:
          </span>
          {PRIVACY_SECTIONS.map((sec) => (
            <button
              key={sec.id}
              type="button"
              onClick={() => scrollToLegalSection(sec.id)}
              className="shrink-0 text-xs px-2.5 py-1 rounded-lg bg-[var(--dk-surface-base)] text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-raised)] transition-all cursor-pointer font-medium"
            >
              {sec.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Policy Detailed Sections */}
      <div className="space-y-8 text-sm leading-relaxed text-foreground/80">
        {/* Section 1: Entity Details & Contact */}
        <section id="controller" className="rounded-2xl sm:rounded-3xl p-6 sm:p-8 bg-[var(--dk-surface-base)] backdrop-blur-xl border border-[var(--dk-separator)] shadow-[var(--dk-shadow-sm)] space-y-4 scroll-mt-28">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <FileText className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                1. Entity Details &amp; Data Controller
              </h2>
              <p className="text-xs text-muted-foreground">
                Identifies who is responsible for managing and safeguarding your personal account data.
              </p>
            </div>
          </div>

          <p>
            Otix (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) operates as the data controller for personal account credentials and application settings. For any privacy inquiries, data deletion requests, or questions regarding this policy, contact our dedicated privacy desk:
          </p>

          <div className="rounded-xl bg-[var(--dk-surface-raised)] p-4 sm:p-5 text-xs text-foreground/90 space-y-2 border border-[var(--dk-separator)]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="font-mono text-muted-foreground">Official Privacy Desk:</span>
              <div className="flex items-center gap-2">
                <a
                  href="mailto:privacy@otix.app"
                  className="font-mono font-medium text-primary hover:underline"
                >
                  privacy@otix.app
                </a>
                <span className="text-muted-foreground">/</span>
                <a
                  href="mailto:legal@otix.app"
                  className="font-mono font-medium text-primary hover:underline"
                >
                  legal@otix.app
                </a>
                <button
                  type="button"
                  onClick={() => handleCopyEmail('privacy@otix.app')}
                  className="p-1 rounded hover:bg-[var(--dk-surface-overlay)] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title="Copy email address"
                  aria-label="Copy privacy email"
                >
                  {copiedEmail ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-[var(--dk-separator)]">
              <span className="font-mono text-muted-foreground">Service Portal:</span>
              <a
                href="https://otix.app"
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
              >
                https://otix.app <ArrowUpRight className="h-3 w-3 opacity-60" />
              </a>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-[var(--dk-separator)]">
              <span className="font-mono text-muted-foreground">Statutory Response SLA:</span>
              <span className="font-mono text-primary font-semibold">Within 30 calendar days (GDPR Art. 12)</span>
            </div>
          </div>
        </section>

        {/* Section 2: Data We Collect vs Data We Do Not Collect */}
        <section id="data-collected" className="rounded-2xl sm:rounded-3xl p-6 sm:p-8 bg-[var(--dk-surface-base)] backdrop-blur-xl border border-[var(--dk-separator)] shadow-[var(--dk-shadow-sm)] space-y-5 scroll-mt-28">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Lock className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                2. Information We Collect and Purpose
              </h2>
              <p className="text-xs text-muted-foreground">
                Explicit breakdown of what we process to deliver the service versus what we never touch.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Collect */}
            <div className="rounded-2xl bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)] p-5 sm:p-6 space-y-3.5">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-xs uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" /> Data We Collect
                </h3>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  Minimal Scope
                </span>
              </div>
              <ul className="space-y-3 text-xs leading-relaxed text-foreground/80 list-disc pl-4">
                <li>
                  <strong className="text-foreground">Account Credentials:</strong> Username, email address, password hash (hashed via argon2 or bcrypt), and date of birth for age verification.
                </li>
                <li>
                  <strong className="text-foreground">User Preferences:</strong> Theme settings, custom lists, ratings, reviews, and watch progress bookmarks.
                </li>
                <li>
                  <strong className="text-foreground">Profile Imagery &amp; Avatars (Optional):</strong> Avatar photos and profile background banners that you choose to upload to customize your account. Images are strictly validated (PNG, JPEG, WebP, GIF), size-capped, stored with randomized UUID filenames, and served exclusively to render your public/friends profile within Otix.
                </li>
                <li>
                  <strong className="text-foreground">Integration Tokens:</strong> Scoped OAuth tokens (Plex, Steam, Epic) stored encrypted at rest to query your servers on your behalf.
                </li>
              </ul>
            </div>

            {/* Never Collect */}
            <div className="rounded-2xl bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)] p-5 sm:p-6 space-y-3.5">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-xs uppercase tracking-wider text-destructive flex items-center gap-1.5">
                  <XCircle className="h-4 w-4" /> Data We Never Collect
                </h3>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
                  Strictly Excluded
                </span>
              </div>
              <ul className="space-y-3 text-xs leading-relaxed text-foreground/80 list-disc pl-4">
                <li>
                  <strong className="text-foreground">No Streaming Media Files:</strong> We never host, ingest, store, or receive your personal movie, video, or music library media files (these stay 100% on your private BYOS server).
                </li>
                <li>
                  <strong className="text-foreground">No Biometric or Facial Recognition:</strong> Profile images and avatars you upload are never scanned, analyzed, or processed for biometric identification, facial recognition, or machine learning model training.
                </li>
                <li>
                  <strong className="text-foreground">No Cross-Site Tracking:</strong> Zero tracking pixels (Meta Pixel, Google AdSense, TikTok) or behavioral advertising brokers.
                </li>
                <li>
                  <strong className="text-foreground">No Sensitive Identifiers:</strong> No GPS geolocation feeds, health records, or microphone/camera recording.
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Section 3: Direct Streaming Privacy (BYOS) */}
        <section id="byos-streaming" className="rounded-2xl sm:rounded-3xl p-6 sm:p-8 bg-[var(--dk-surface-base)] backdrop-blur-xl border border-[var(--dk-separator)] shadow-[var(--dk-shadow-sm)] space-y-5 scroll-mt-28">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Server className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                3. Bring Your Own Server (BYOS) Streaming Privacy
              </h2>
              <p className="text-xs text-muted-foreground">
                Direct client-to-server media transmission guarantees complete privacy for your home media.
              </p>
            </div>
          </div>

          <p>
            When streaming media from your linked Plex or Jellyfin servers through Otix:
          </p>

          {/* Visual Architecture Representation */}
          <div className="rounded-2xl bg-[var(--dk-surface-raised)] p-5 border border-[var(--dk-separator)] space-y-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Technical Architecture Flow
            </span>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-[var(--dk-surface-overlay)] p-3.5 space-y-1.5 border border-[var(--dk-separator)]">
                <Laptop className="h-5 w-5 mx-auto text-primary" />
                <div className="font-semibold text-xs text-foreground">Your Web Browser / App</div>
                <div className="text-[11px] text-muted-foreground">Direct video renderer &amp; HLS player</div>
              </div>

              <div className="flex flex-col items-center justify-center py-2 text-muted-foreground">
                <span className="text-xs font-semibold text-primary flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Direct Playback Stream
                </span>
                <span className="text-[10px] text-muted-foreground mt-0.5">Peer-to-peer / LAN or direct WAN</span>
                <div className="w-full h-0.5 bg-primary/30 my-2 hidden md:block" />
              </div>

              <div className="rounded-xl bg-[var(--dk-surface-overlay)] p-3.5 space-y-1.5 border border-[var(--dk-separator)]">
                <Server className="h-5 w-5 mx-auto text-primary" />
                <div className="font-semibold text-xs text-foreground">Your Private Server</div>
                <div className="text-[11px] text-muted-foreground">Plex / Jellyfin endpoint you own</div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-primary/10 text-primary text-xs flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span>
                <strong>Zero Intermediary:</strong> Otix central servers never proxy, record, or route your video or audio stream.
              </span>
            </div>
          </div>

          <ul className="list-disc pl-5 space-y-2 text-xs sm:text-sm text-foreground/80">
            <li>Playback connections travel directly from your browser client to your private server endpoint.</li>
            <li>Otix central servers do not act as an intermediary, proxy, or relay for video/audio streams.</li>
            <li>Your media file directory paths and filenames remain strictly within your private account and are never published to public search engines or external parties.</li>
          </ul>
        </section>

        {/* Section 4: Third-Party SDKs & APIs Audit */}
        <section id="third-party-apis" className="rounded-2xl sm:rounded-3xl p-6 sm:p-8 bg-[var(--dk-surface-base)] backdrop-blur-xl border border-[var(--dk-separator)] shadow-[var(--dk-shadow-sm)] space-y-4 scroll-mt-28">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Layers className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                4. Third-Party SDKs and Services Audit
              </h2>
              <p className="text-xs text-muted-foreground">
                Exhaustive list of all external APIs contacted for public metadata enrichment.
              </p>
            </div>
          </div>

          <p>
            Otix communicates with the following external services strictly to retrieve public media metadata, artwork, and authentication verification:
          </p>

          <div className="overflow-x-auto rounded-xl border border-[var(--dk-separator)] bg-[var(--dk-surface-raised)]">
            <table className="w-full text-xs text-left text-foreground/80">
              <thead className="bg-[var(--dk-surface-overlay)] text-foreground font-semibold uppercase text-[11px] tracking-wider border-b border-[var(--dk-separator)]">
                <tr>
                  <th className="p-3 sm:p-3.5">Service</th>
                  <th className="p-3 sm:p-3.5">Purpose</th>
                  <th className="p-3 sm:p-3.5">Data Shared</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--dk-separator)]">
                <tr className="hover:bg-[var(--dk-surface-glass)] transition-colors">
                  <td className="p-3 sm:p-3.5 font-semibold text-foreground">The Movie Database (TMDB)</td>
                  <td className="p-3 sm:p-3.5">Movie and TV show metadata, posters, cast lists</td>
                  <td className="p-3 sm:p-3.5">
                    <span className="font-mono text-[11px] text-muted-foreground">Search query terms / TMDB IDs (No user identity)</span>
                  </td>
                </tr>
                <tr className="hover:bg-[var(--dk-surface-glass)] transition-colors">
                  <td className="p-3 sm:p-3.5 font-semibold text-foreground">SteamGridDB / IGDB</td>
                  <td className="p-3 sm:p-3.5">Game cover art, heroes, logos, release dates</td>
                  <td className="p-3 sm:p-3.5">
                    <span className="font-mono text-[11px] text-muted-foreground">Game titles / App IDs</span>
                  </td>
                </tr>
                <tr className="hover:bg-[var(--dk-surface-glass)] transition-colors">
                  <td className="p-3 sm:p-3.5 font-semibold text-foreground">YouTube (Google)</td>
                  <td className="p-3 sm:p-3.5">Promotional trailer embeds (optional user interaction)</td>
                  <td className="p-3 sm:p-3.5">
                    <span className="font-mono text-[11px] text-muted-foreground">Standard YouTube iframe embed headers</span>
                  </td>
                </tr>
                <tr className="hover:bg-[var(--dk-surface-glass)] transition-colors">
                  <td className="p-3 sm:p-3.5 font-semibold text-foreground">Plex.tv OAuth</td>
                  <td className="p-3 sm:p-3.5">PIN authentication for personal media servers</td>
                  <td className="p-3 sm:p-3.5">
                    <span className="font-mono text-[11px] text-muted-foreground">Client PIN verification only</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 5: Cookie & Local Storage Policy */}
        <section id="cookies" className="rounded-2xl sm:rounded-3xl p-6 sm:p-8 bg-[var(--dk-surface-base)] backdrop-blur-xl border border-[var(--dk-separator)] shadow-[var(--dk-shadow-sm)] space-y-4 scroll-mt-28">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Cookie className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                5. Cookie &amp; Storage Policy
              </h2>
              <p className="text-xs text-muted-foreground">
                Local storage items and session cookies used strictly to power core app features.
              </p>
            </div>
          </div>

          <p>
            Otix uses browser local storage keys and session cookies strictly necessary to provide service functionality:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-[var(--dk-surface-raised)] border border-[var(--dk-separator)] space-y-2">
              <div className="font-bold text-foreground flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                <span>Strictly Necessary (Required)</span>
              </div>
              <ul className="space-y-1.5 text-muted-foreground leading-relaxed">
                <li><strong className="text-foreground">Session Authentication:</strong> JWT token stored to authenticate API requests to your Otix backend.</li>
                <li><strong className="text-foreground">Cookie Consent:</strong> <code className="text-primary font-mono">{COOKIE_CONSENT_KEY}</code> records your choice to accept or decline optional cookies.</li>
              </ul>
            </div>

            <div className="p-4 rounded-xl bg-[var(--dk-surface-raised)] border border-[var(--dk-separator)] space-y-2">
              <div className="font-bold text-foreground flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span>Functional &amp; UI Preferences</span>
              </div>
              <ul className="space-y-1.5 text-muted-foreground leading-relaxed">
                <li><strong className="text-foreground">Audio &amp; Volume:</strong> Remembers your preferred playback volume and mute states.</li>
                <li><strong className="text-foreground">Theme &amp; Layout:</strong> Stores dark/light mode preference and theater mode settings locally on your device.</li>
              </ul>
            </div>
          </div>

          {/* Interactive Cookie Preference Box */}
          <div className="rounded-xl p-4 bg-[var(--dk-surface-raised)] border border-[var(--dk-separator)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-foreground flex items-center gap-2">
                <span>Current Consent Status:</span>
                <span className="font-mono text-primary font-bold">
                  {cookieConsent === 'all'
                    ? 'All Cookies Accepted'
                    : cookieConsent === 'necessary'
                    ? 'Essential Cookies Only'
                    : 'Not Yet Configured'}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                You can change or reset your preference at any time.
              </p>
            </div>
            <DkButton
              variant="outline"
              size="xs"
              onClick={handleResetCookieChoice}
              leftIcon={RotateCcw}
              className="shrink-0"
            >
              Reset Cookie Preference
            </DkButton>
          </div>
        </section>

        {/* Section 6: Children's Privacy (COPPA & GDPR-K) */}
        <section id="children" className="rounded-2xl sm:rounded-3xl p-6 sm:p-8 bg-[var(--dk-surface-base)] backdrop-blur-xl border border-[var(--dk-separator)] shadow-[var(--dk-shadow-sm)] space-y-4 scroll-mt-28">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <UserCheck className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                6. Age Consent &amp; Children’s Privacy (COPPA / GDPR-K)
              </h2>
              <p className="text-xs text-muted-foreground">
                Protecting young audiences and ensuring strict compliance with international minors protection laws.
              </p>
            </div>
          </div>

          <p>
            Otix is not directed toward children under the age of 13 (or under 16 within the European Economic Area). We do not knowingly collect or solicit personal information from children without verified parental consent.
          </p>
          <p>
            During account registration, users are required to confirm their age. If we learn that personal information has been collected from a child under the statutory age without verifiable parental consent, we will promptly delete that account and all associated records. Parents or guardians may contact <code className="text-primary font-mono">privacy@otix.app</code> to report any minor account.
          </p>
        </section>

        {/* Section 7: Data Deletion & Right to Erasure */}
        <section id="data-deletion" className="rounded-2xl sm:rounded-3xl p-6 sm:p-8 bg-[var(--dk-surface-base)] backdrop-blur-xl border border-[var(--dk-separator)] shadow-[var(--dk-shadow-sm)] space-y-4 scroll-mt-28">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Trash2 className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                7. Data Deletion &amp; Right to Erasure (GDPR Art. 17 / CCPA)
              </h2>
              <p className="text-xs text-muted-foreground">
                You maintain complete ownership of your personal data and can trigger permanent deletion anytime.
              </p>
            </div>
          </div>

          <p>
            You possess the fundamental right to request the permanent erasure of your account, watch histories, reviews, and integration tokens:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-[var(--dk-surface-raised)] border border-[var(--dk-separator)] space-y-3">
              <div className="font-bold text-xs uppercase tracking-wider text-foreground">
                Option A: Self-Service Erasure
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Navigate directly to your account settings to unlink servers, revoke active sessions, and delete your account with immediate effect.
              </p>
              <DkButton asChild variant="secondary" size="xs">
                <Link to="/settings/account">
                  <span>Open Account Settings</span>
                  <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Link>
              </DkButton>
            </div>

            <div className="p-4 rounded-xl bg-[var(--dk-surface-raised)] border border-[var(--dk-separator)] space-y-3">
              <div className="font-bold text-xs uppercase tracking-wider text-foreground">
                Option B: Written Request
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Email <code className="text-primary font-mono">privacy@otix.app</code> with the subject <em>&ldquo;Account &amp; Data Deletion Request&rdquo;</em> from your registered email address. We will permanently purge all records within 30 calendar days.
              </p>
              <DkButton
                variant="outline"
                size="xs"
                onClick={() => handleCopyEmail('privacy@otix.app')}
                leftIcon={copiedEmail ? Check : Copy}
              >
                {copiedEmail ? 'Email Copied' : 'Copy Email'}
              </DkButton>
            </div>
          </div>
        </section>

        {/* Section 8: Communications & Unsubscribe */}
        <section id="communications" className="rounded-2xl sm:rounded-3xl p-6 sm:p-8 bg-[var(--dk-surface-base)] backdrop-blur-xl border border-[var(--dk-separator)] shadow-[var(--dk-shadow-sm)] space-y-4 scroll-mt-28">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Mail className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                8. Email Communications &amp; Unsubscribe Rights
              </h2>
              <p className="text-xs text-muted-foreground">
                Anti-spam guarantees and straightforward communication controls.
              </p>
            </div>
          </div>

          <p>
            We only send essential transactional emails (e.g. password resets, security notifications, 2FA confirmations). We do not send unsolicited marketing blasts. Any optional notification emails provide a one-click unsubscribe mechanism, and notifications can be toggled off at any time in{' '}
            <Link to="/settings/notifications" className="text-primary font-medium hover:underline">
              Settings &rarr; Notifications
            </Link>.
          </p>
        </section>
      </div>
    </div>
  )
};
