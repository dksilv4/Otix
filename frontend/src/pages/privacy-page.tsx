import { Helmet } from 'react-helmet-async'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ShieldCheck,
  Server,
  Lock,
  EyeOff,
  Cookie,
  UserCheck,
  Trash2,
  Mail,
  ArrowLeft,
  FileText,
  DollarSign,
  Layers,
} from 'lucide-react'
import { Logo } from '@ui/atoms/logo'

export function PrivacyPage() {
  const navigate = useNavigate()

  return (
    <div id="privacy-page" className="min-h-screen bg-background text-foreground py-12 px-4 sm:px-6 lg:px-8">
      <Helmet>
        <title>Privacy Policy &amp; Data Rights - Otix</title>
        <meta
          name="description"
          content="Privacy Policy, Cookie Policy, Data Minimization, and User Rights (GDPR/CCPA) for Otix."
        />
      </Helmet>

      <div className="mx-auto max-w-4xl space-y-10">
        {/* Header & Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
          <button
            type="button"
            onClick={() => {
              if (window.history.length > 1) {
                window.history.back()
              } else {
                navigate({ to: '/' })
              }
            }}
            className="inline-flex items-center gap-2 text-xs font-semibold text-white/60 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </button>

          <Link to="/" className="inline-flex items-center gap-2">
            <Logo className="h-8" />
            <span className="font-bold tracking-tight text-white text-base">Otix</span>
          </Link>
        </div>

        {/* Title block */}
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold border border-emerald-500/20">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>GDPR, CCPA &amp; Privacy Standards</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Privacy &amp; Cookie Policy
          </h1>
          <p className="text-sm text-white/50">
            Last Updated: October 2026 · Effective Immediately
          </p>
        </div>

        {/* Data Minimization Pledge */}
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 sm:p-6 backdrop-blur-xl space-y-2">
          <div className="flex items-center gap-2.5 text-emerald-300 font-semibold text-sm">
            <EyeOff className="h-4 w-4 shrink-0" />
            <span>Zero Unnecessary Data Collection Pledge</span>
          </div>
          <p className="text-xs sm:text-sm text-white/80 leading-relaxed">
            Otix is built on the principle of <strong>strict data minimization</strong>. We only collect the minimal information necessary to deliver account authentication, synchronize your personal library preferences, and establish direct playback sessions. <strong>We do not sell personal data, maintain tracking pixels, or use third-party behavioral advertising brokers.</strong>
          </p>
        </div>

        {/* Policy Sections */}
        <div className="space-y-8 text-sm leading-relaxed text-white/75">
          {/* Section 1: Business Details & Contact */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-3">
            <div className="flex items-center gap-2 text-white font-bold text-base">
              <FileText className="h-4 w-4 text-primary" />
              <h2>1. Entity Details &amp; Data Controller</h2>
            </div>
            <p>
              Otix (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) operates as the data controller for personal account credentials and application settings. For any privacy inquiries, data deletion requests, or questions regarding this policy, contact our dedicated privacy desk:
            </p>
            <div className="rounded-xl bg-white/[0.03] p-3 text-xs text-white/80 space-y-1 font-mono">
              <p>Email: privacy@otix.app / legal@otix.app</p>
              <p>Website: https://otix.app</p>
              <p>Subject: Privacy &amp; Data Rights Request</p>
              <p>Response SLA: Within 30 calendar days</p>
            </div>
          </section>

          {/* Section 2: Data We Collect vs Data We Do Not Collect */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-4">
            <div className="flex items-center gap-2 text-white font-bold text-base">
              <Lock className="h-4 w-4 text-emerald-400" />
              <h2>2. Information We Collect and Purpose</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-2">
                <h3 className="font-semibold text-white text-xs uppercase tracking-wider text-emerald-400">
                  Data We Collect
                </h3>
                <ul className="list-disc pl-4 space-y-1 text-xs text-white/70">
                  <li><strong>Account Credentials:</strong> Username, email address, password hash (via bcrypt/argon2), and date of birth (for age verification).</li>
                  <li><strong>User Preferences:</strong> Theme settings, custom lists, ratings, reviews, and watch history bookmarks.</li>
                  <li><strong>Integration Tokens:</strong> Scoped OAuth tokens (Plex, Steam, Epic) stored encrypted at rest to query your servers on your behalf.</li>
                </ul>
              </div>

              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-2">
                <h3 className="font-semibold text-white text-xs uppercase tracking-wider text-rose-400">
                  Data We Never Collect
                </h3>
                <ul className="list-disc pl-4 space-y-1 text-xs text-white/70">
                  <li><strong>No Media Content:</strong> We never log, store, or receive your personal movie, video, or music files.</li>
                  <li><strong>No Cross-Site Tracking:</strong> No tracking pixels (Facebook, TikTok, advertising brokers).</li>
                  <li><strong>No Sensitive Identifiers:</strong> No geolocation / GPS feeds, biometric data, or microphone/camera access.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 3: Direct Streaming Privacy (BYOS) */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-3">
            <div className="flex items-center gap-2 text-white font-bold text-base">
              <Server className="h-4 w-4 text-amber-400" />
              <h2>3. Bring Your Own Server (BYOS) Streaming Privacy</h2>
            </div>
            <p>
              When streaming media from your linked Plex or Jellyfin servers:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-white/70">
              <li>Playback connections travel directly from your browser client to your private server endpoint.</li>
              <li>Otix central servers do not act as an intermediary, proxy, or relay for video/audio streams.</li>
              <li>Your media file directory paths and filenames remain strictly within your private account and are never published to public search engines.</li>
            </ul>
          </section>

          {/* Section 4: Third-Party SDKs & APIs Audit */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-3">
            <div className="flex items-center gap-2 text-white font-bold text-base">
              <Layers className="h-4 w-4 text-sky-400" />
              <h2>4. Third-Party SDKs and Services Audit</h2>
            </div>
            <p>
              Otix communicates with the following external APIs strictly to retrieve public media metadata:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-white/70 border border-white/10 rounded-xl overflow-hidden">
                <thead className="bg-white/5 text-white/90 font-semibold uppercase">
                  <tr>
                    <th className="p-2.5">Service</th>
                    <th className="p-2.5">Purpose</th>
                    <th className="p-2.5">Data Shared</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  <tr>
                    <td className="p-2.5 font-medium text-white">The Movie Database (TMDB)</td>
                    <td className="p-2.5">Movie and TV show metadata, posters, cast lists</td>
                    <td className="p-2.5">Search query terms / TMDB IDs (No user identity)</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-medium text-white">SteamGridDB / IGDB</td>
                    <td className="p-2.5">Game cover art, heroes, logos</td>
                    <td className="p-2.5">Game titles / App IDs</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-medium text-white">YouTube (Google)</td>
                    <td className="p-2.5">Promotional trailer embeds (optional)</td>
                    <td className="p-2.5">Standard YouTube player client headers</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-medium text-white">Plex.tv OAuth</td>
                    <td className="p-2.5">PIN authentication for personal media servers</td>
                    <td className="p-2.5">Client PIN verification only</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 5: Cookie & Local Storage Policy */}
          <section id="cookies" className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-3">
            <div className="flex items-center gap-2 text-white font-bold text-base">
              <Cookie className="h-4 w-4 text-amber-400" />
              <h2>5. Cookie &amp; Storage Policy</h2>
            </div>
            <p>
              Otix uses local storage keys and session cookies strictly necessary to provide service functionality:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-white/70">
              <li><strong>Session Authentication (Strictly Necessary):</strong> JWT tokens stored to authenticate API requests to your Otix backend.</li>
              <li><strong>Cookie Consent (Strictly Necessary):</strong> <code>otix_cookie_consent</code> records your choice to accept or decline optional cookies.</li>
              <li><strong>Player &amp; UI Preferences (Functional):</strong> Audio volume levels, theme selections, and theater mode states stored locally on your device.</li>
            </ul>
            <p className="text-xs text-white/50">
              You can clear your local storage and cookies at any time via your browser settings.
            </p>
          </section>

          {/* Section 6: Children's Privacy (COPPA & GDPR-K) */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-3">
            <div className="flex items-center gap-2 text-white font-bold text-base">
              <UserCheck className="h-4 w-4 text-emerald-400" />
              <h2>6. Age Consent &amp; Children&apos;s Privacy (COPPA / GDPR-K)</h2>
            </div>
            <p>
              Otix is not directed toward children under the age of 13 (or under 16 within the European Economic Area). We do not knowingly collect or solicit personal information from children without verified parental consent.
            </p>
            <p>
              During account registration, users are required to confirm their age. If we learn that personal information has been collected from a child under the statutory age without verifiable parental consent, we will promptly delete that account and all associated records. Parents or guardians may contact <code>privacy@otix.app</code> to report any minor account.
            </p>
          </section>

          {/* Section 7: Data Deletion & Right to Erasure */}
          <section id="data-deletion" className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-3">
            <div className="flex items-center gap-2 text-white font-bold text-base">
              <Trash2 className="h-4 w-4 text-rose-400" />
              <h2>7. Data Deletion &amp; Right to Erasure (GDPR Art. 17 / CCPA)</h2>
            </div>
            <p>
              You maintain full ownership of your personal data and possess the right to request its complete erasure:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-white/70">
              <li>
                <strong>Self-Service Erasure:</strong> Navigate to <strong>Settings &rarr; Account</strong> to unlink integrations, revoke active sessions, and request account deletion.
              </li>
              <li>
                <strong>Direct Written Request:</strong> Send an email to <code>privacy@otix.app</code> with the subject <em>&ldquo;Account &amp; Data Deletion Request&rdquo;</em> from your registered email address. We will permanently purge your user profile, credentials, and library metadata within 30 days.
              </li>
            </ul>
          </section>

          {/* Section 8: Refund & Cancellation Policy */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-3">
            <div className="flex items-center gap-2 text-white font-bold text-base">
              <DollarSign className="h-4 w-4 text-emerald-400" />
              <h2>8. Refund &amp; Subscription Cancellation Policy</h2>
            </div>
            <p>
              Otix believes in transparent, consumer-friendly policies with no dark patterns:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-white/70">
              <li><strong>Self-Service Cancellation:</strong> If any paid tier or subscription is enabled, cancellation can be performed with one click from account settings without retention surveys or artificial barriers.</li>
              <li><strong>14-Day Statutory Refund Window:</strong> Users residing in the EU, UK, and other qualifying jurisdictions are entitled to a full refund within 14 days of initial purchase.</li>
              <li><strong>Fair Usage:</strong> To request a refund, contact <code>support@otix.app</code> with your invoice ID.</li>
            </ul>
          </section>

          {/* Section 9: Communications & Unsubscribe */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-3">
            <div className="flex items-center gap-2 text-white font-bold text-base">
              <Mail className="h-4 w-4 text-sky-400" />
              <h2>9. Email Communications &amp; Unsubscribe Rights</h2>
            </div>
            <p>
              We only send essential transactional emails (e.g. password resets, security notifications, 2FA confirmations). We do not send unsolicited marketing blasts. Any optional notification emails provide a one-click unsubscribe mechanism, and notifications can be toggled off at any time in <strong>Settings &rarr; Notifications</strong>.
            </p>
          </section>

          {/* Section 10: Font & Asset Licensing */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-3">
            <div className="flex items-center gap-2 text-white font-bold text-base">
              <Layers className="h-4 w-4 text-white/70" />
              <h2>10. Font, Asset &amp; Intellectual Property Licenses</h2>
            </div>
            <p>
              All software fonts (including Inter and system typography) are utilized under permissive open-source licenses (SIL Open Font License). Movie, TV, and gaming artwork is utilized under promotional fair use and community API attribution agreements.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/40">
          <p>© {new Date().getFullYear()} Otix. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link to="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
            <Link to="/settings" className="hover:text-white transition-colors">Settings</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
