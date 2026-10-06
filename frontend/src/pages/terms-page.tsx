import { Helmet } from 'react-helmet-async'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ShieldCheck,
  Server,
  Film,
  FileText,
  AlertTriangle,
  ArrowLeft,
  Lock,
  Globe,
  Radio,
} from 'lucide-react'
import { Logo } from '@ui/atoms/logo'

export const TermsPage = () => {
  const navigate = useNavigate()

  return (
    <div id="terms-page" className="min-h-screen bg-background text-foreground py-12 px-4 sm:px-6 lg:px-8">
      <Helmet>
        <title>Terms of Service - Otix</title>
        <meta
          name="description"
          content="Terms of Service, Bring-Your-Own-Server (BYOS) streaming policy, and legal disclaimers for Otix."
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
            <span>Legal Disclaimers &amp; Terms</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Terms of Service
          </h1>
          <p className="text-sm text-white/50">
            Last Updated: October 2026 · Effective Immediately
          </p>
        </div>

        {/* Highlight Banner: BYOS Nature */}
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 sm:p-6 backdrop-blur-xl space-y-2">
          <div className="flex items-center gap-2.5 text-emerald-300 font-semibold text-sm">
            <Server className="h-4 w-4 shrink-0" />
            <span>Bring Your Own Server (BYOS) Client Notice</span>
          </div>
          <p className="text-xs sm:text-sm text-white/80 leading-relaxed">
            Otix is a personal media management client and indexing dashboard. <strong>Otix does not host, store, cache, proxy, or distribute any copyrighted video, audio, or game files.</strong> All streaming connections are established directly peer-to-peer between your web browser and your independently hosted personal servers (e.g. Plex, Jellyfin) for private domestic viewing.
          </p>
        </div>

        {/* Main Content Sections */}
        <div className="space-y-8 text-sm leading-relaxed text-white/75">
          {/* Section 1 */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-3">
            <div className="flex items-center gap-2 text-white font-bold text-base">
              <FileText className="h-4 w-4 text-primary" />
              <h2>1. Nature of the Service &amp; Acceptance of Terms</h2>
            </div>
            <p>
              By accessing, browsing, or using Otix (&ldquo;the Service&rdquo;), you agree to be bound by these Terms of Service (&ldquo;Terms&rdquo;). Otix provides personal media tracking, library organization, discoverability tools, launcher integrations, and unified interface software. If you do not agree to these Terms, you may not use the Service.
            </p>
          </section>

          {/* Section 2 */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-3">
            <div className="flex items-center gap-2 text-white font-bold text-base">
              <Radio className="h-4 w-4 text-emerald-400" />
              <h2>2. Zero Media Relay Policy &amp; Direct Playback Architecture</h2>
            </div>
            <p>
              Otix functions as a user interface client. The technical infrastructure of Otix operates strictly under a zero-media-relay architecture:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-white/70">
              <li>
                <strong>No Central Media Storage:</strong> Otix central servers and databases store only account credentials, user preferences, and metadata identifiers.
              </li>
              <li>
                <strong>Direct Client-to-Host Streaming:</strong> Video and audio playback bitstreams (such as HLS fragments and MP4 containers) travel directly between your client device and your connected media server. Otix servers never receive, touch, transcode, or proxy your media data.
              </li>
              <li>
                <strong>Strict Tenant Isolation:</strong> Server connections, authentication tokens, and playback streams are private and isolated to the authenticated user. Otix does not allow cross-account streaming or access to another user&apos;s private media hardware.
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-3">
            <div className="flex items-center gap-2 text-white font-bold text-base">
              <Lock className="h-4 w-4 text-amber-400" />
              <h2>3. User Responsibility &amp; Private Domestic Use</h2>
            </div>
            <p>
              You acknowledge and agree that:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-white/70">
              <li>
                You are solely responsible for all content stored on, linked from, or streamed through your connected personal media servers.
              </li>
              <li>
                You affirm that you possess the lawful right, license, or personal fair-use exemption to access, store, and stream the media files hosted on your hardware.
              </li>
              <li>
                Media streaming via Otix is intended exclusively for your personal, private, and non-commercial domestic viewing.
              </li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-3">
            <div className="flex items-center gap-2 text-white font-bold text-base">
              <Globe className="h-4 w-4 text-sky-400" />
              <h2>4. Public Lists, Collections &amp; Bibliographic Metadata</h2>
            </div>
            <p>
              Otix enables users to curate lists, organize watchlists, write reviews, and mark titles as &ldquo;owned&rdquo; or &ldquo;in library&rdquo;:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-white/70">
              <li>
                <strong>Bibliographic Metadata Only:</strong> Public lists and collection showcases consist purely of text titles, release years, community ratings, and public promotional artwork.
              </li>
              <li>
                <strong>No File Sharing or Redistribution:</strong> Sharing a list or displaying an &ldquo;in library&rdquo; status does not grant third parties access or rights to stream, download, or copy files from your personal servers. Otix never serves media files to third-party visitors viewing your lists.
              </li>
              <li>
                <strong>Third-Party Metadata Sources:</strong> Media metadata, synopses, and imagery are retrieved from community public APIs (including TMDB, TheTVDB, IGDB, MusicBrainz, and SteamGridDB) and remain the property of their respective contributors.
              </li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-3">
            <div className="flex items-center gap-2 text-white font-bold text-base">
              <Film className="h-4 w-4 text-rose-400" />
              <h2>5. Third-Party Integrations &amp; Trademarks</h2>
            </div>
            <p>
              Otix provides optional client-side connections to third-party services, including Plex, Jellyfin, Steam, Epic Games, and Google.
            </p>
            <p>
              Your use of any integrated third-party service is governed by that service&apos;s respective Terms of Service and Privacy Policy. Otix is an independent software application and is not affiliated with, endorsed by, or sponsored by Plex Inc., Valve Corporation, Epic Games, Google LLC, or any studio or publisher. All product names, logos, and brands are property of their respective owners.
            </p>
          </section>

          {/* Section 6 */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-3">
            <div className="flex items-center gap-2 text-white font-bold text-base">
              <AlertTriangle className="h-4 w-4 text-rose-500" />
              <h2>6. Prohibited Activities</h2>
            </div>
            <p>You agree not to use Otix to:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-white/70">
              <li>Operate an unauthorized commercial streaming, rebroadcasting, or distribution service.</li>
              <li>Charge third parties subscription or viewing fees to access media streams from personal servers.</li>
              <li>Circumvent technological measures, encryption, or access controls implemented by Otix or third-party providers.</li>
              <li>Engage in any activity that infringes upon the intellectual property, copyright, or privacy rights of any party.</li>
            </ul>
          </section>

          {/* Section 7 */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-3">
            <div className="flex items-center gap-2 text-white font-bold text-base">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <h2>7. DMCA &amp; Copyright Safe Harbor Notice</h2>
            </div>
            <p>
              Otix complies with the Digital Millennium Copyright Act (17 U.S.C. § 512) and applicable international copyright conventions. Because Otix does not host, store, or transmit audio or video content, notifications regarding content hosted on independent personal servers should be directed to the relevant hosting provider or server administrator.
            </p>
            <p>
              For inquiries regarding metadata, terms, or software components operated directly by Otix, reach our designated legal team at <code>legal@otix.app</code> (Website: <a href="https://otix.app" className="text-white underline underline-offset-2">https://otix.app</a>).
            </p>
          </section>

          {/* Section 8 */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 space-y-3">
            <div className="flex items-center gap-2 text-white font-bold text-base">
              <FileText className="h-4 w-4 text-white/60" />
              <h2>8. Disclaimer of Warranties &amp; Limitation of Liability</h2>
            </div>
            <p className="uppercase text-xs tracking-wider text-white/50">
              THE SERVICE IS PROVIDED ON AN &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; BASIS WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED.
            </p>
            <p>
              To the fullest extent permitted by applicable law, Otix and its developers disclaim all liability for any indirect, incidental, punitive, or consequential damages resulting from your use of the software, including media server downtime, network interruptions, or changes to third-party APIs.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/40">
          <p>© {new Date().getFullYear()} Otix. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link to="/" className="hover:text-white transition-colors">Home</Link>
            <Link to="/settings" className="hover:text-white transition-colors">Settings</Link>
          </div>
        </div>
      </div>
    </div>
  )
};
