import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import {
  ShieldCheck,
  Server,
  Film,
  FileText,
  AlertTriangle,
  Lock,
  Globe,
  Radio,
  DollarSign,
  Layers,
  Copy,
  Check,
} from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { DkBadge } from '@ui/atoms/badge'
import { useToast } from '@ui/molecules/toast'
import { LegalNav } from '@/components/legal-nav'
import { TERMS_SECTIONS, scrollToLegalSection } from '@/lib/utils/legal'

export const TermsPage = () => {
  const { toast } = useToast()
  const [copiedEmail, setCopiedEmail] = useState(false)

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

  return (
    <div id="terms-page" className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-10">
      <Helmet>
        <title>Terms of Service — Otix</title>
        <meta
          name="description"
          content="Terms of Service, Bring-Your-Own-Server (BYOS) streaming policy, licensing, and legal disclaimers for Otix."
        />
      </Helmet>

      {/* Shared Legal Navigation Tabs */}
      <LegalNav activeTab="terms" />

      {/* Hero Header */}
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <DkBadge variant="default" size="sm" className="gap-1.5 px-3 py-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>User Agreement &amp; Disclaimers</span>
          </DkBadge>
          <DkBadge variant="secondary" size="sm" className="gap-1.5 px-3 py-1">
            <Radio className="h-3.5 w-3.5" />
            <span>Direct BYOS Streaming</span>
          </DkBadge>
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground">
            Terms of Service
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-3xl leading-relaxed">
            Otix is an independent media management client and indexing dashboard. <strong>Otix does not host, store, cache, proxy, or distribute any copyrighted video, audio, or game files.</strong> All streaming bitstreams flow peer-to-peer directly between your web browser and your independently hosted personal servers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-muted-foreground">
          <span>Last Updated: <strong>October 2026</strong></span>
          <span className="opacity-40">·</span>
          <span>Effective Immediately</span>
          <span className="opacity-40">·</span>
          <span className="text-primary font-medium flex items-center gap-1">
            <Server className="h-3.5 w-3.5" /> Zero Media Relay Architecture
          </span>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <DkButton
            variant="secondary"
            size="sm"
            onClick={() => scrollToLegalSection('refunds')}
            leftIcon={DollarSign}
          >
            Refund &amp; Cancellation Policy
          </DkButton>

          <DkButton
            variant="ghost"
            size="sm"
            onClick={() => scrollToLegalSection('byos-architecture')}
            className="text-foreground/80 hover:text-foreground"
          >
            <Server className="h-3.5 w-3.5 mr-1.5" />
            Zero-Relay Architecture
          </DkButton>

          <DkButton
            variant="ghost"
            size="sm"
            onClick={() => handleCopyEmail('legal@otix.app')}
            className="text-foreground/80 hover:text-foreground"
          >
            {copiedEmail ? (
              <Check className="h-3.5 w-3.5 mr-1.5 text-primary" />
            ) : (
              <Copy className="h-3.5 w-3.5 mr-1.5" />
            )}
            <span>Copy Legal Desk Email</span>
          </DkButton>
        </div>
      </header>

      {/* BYOS Client Notice Highlight Card */}
      <div className="rounded-2xl sm:rounded-3xl p-6 sm:p-7 backdrop-blur-xl bg-primary/[0.04] dark:bg-primary/[0.08] border border-primary/20 shadow-[var(--dk-shadow-sm)] space-y-3">
        <div className="flex items-center gap-2.5 text-primary font-bold text-sm sm:text-base">
          <Server className="h-5 w-5 shrink-0" />
          <span>Bring Your Own Server (BYOS) Client Notice</span>
        </div>
        <p className="text-xs sm:text-sm text-foreground/80 leading-relaxed">
          Otix is a personal media management client and indexing dashboard. <strong>Otix does not host, store, cache, proxy, or distribute any copyrighted video, audio, or game files.</strong> All streaming connections are established directly peer-to-peer between your web browser and your independently hosted personal servers (such as Plex, Jellyfin, or local emulator backends) for private domestic viewing.
        </p>
      </div>

      {/* Key Guarantees At A Glance */}
      <section className="space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Core Operating Terms At A Glance
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl p-5 bg-[var(--dk-surface-base)] backdrop-blur-xl border border-[var(--dk-separator)] shadow-[var(--dk-shadow-xs)] hover:shadow-[var(--dk-shadow-sm)] transition-all space-y-2.5">
            <div className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Server className="h-4 w-4" />
            </div>
            <h3 className="font-bold text-sm text-foreground">Zero Media Relay</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Otix servers never receive, touch, transcode, or proxy media files. Streams travel directly from host to client.
            </p>
          </div>

          <div className="rounded-2xl p-5 bg-[var(--dk-surface-base)] backdrop-blur-xl border border-[var(--dk-separator)] shadow-[var(--dk-shadow-xs)] hover:shadow-[var(--dk-shadow-sm)] transition-all space-y-2.5">
            <div className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Lock className="h-4 w-4" />
            </div>
            <h3 className="font-bold text-sm text-foreground">Private Domestic Use</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Software is licensed strictly for individual, personal, non-commercial organization and domestic playback.
            </p>
          </div>

          <div className="rounded-2xl p-5 bg-[var(--dk-surface-base)] backdrop-blur-xl border border-[var(--dk-separator)] shadow-[var(--dk-shadow-xs)] hover:shadow-[var(--dk-shadow-sm)] transition-all space-y-2.5">
            <div className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <DollarSign className="h-4 w-4" />
            </div>
            <h3 className="font-bold text-sm text-foreground">Fair Consumer Billing</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              One-click self-service cancellation from account settings with a 14-day statutory refund window and no dark patterns.
            </p>
          </div>

          <div className="rounded-2xl p-5 bg-[var(--dk-surface-base)] backdrop-blur-xl border border-[var(--dk-separator)] shadow-[var(--dk-shadow-xs)] hover:shadow-[var(--dk-shadow-sm)] transition-all space-y-2.5">
            <div className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <h3 className="font-bold text-sm text-foreground">DMCA Safe Harbor</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Strict compliance with 17 U.S.C. § 512, open-source font licenses, and fair-use bibliographic metadata attribution.
            </p>
          </div>
        </div>
      </section>

      {/* Quick Navigation Scroll Chips */}
      <nav aria-label="Terms sections" className="sticky top-16 z-20 -mx-4 px-4 sm:mx-0 sm:px-0 py-2.5 bg-background/80 backdrop-blur-md border-y border-[var(--dk-separator)]">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          {TERMS_SECTIONS.map((sec) => (
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

      {/* Main Content Sections */}
      <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">
        {/* Section 1: Acceptance & Nature of Service */}
        <section id="acceptance" className="rounded-2xl sm:rounded-3xl p-6 sm:p-8 bg-[var(--dk-surface-base)] backdrop-blur-xl border border-[var(--dk-separator)] shadow-[var(--dk-shadow-sm)] space-y-4 scroll-mt-28">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <FileText className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                1. Nature of the Service &amp; Acceptance of Terms
              </h2>
              <p className="text-xs text-muted-foreground">
                Scope of license, terms agreement, and client dashboard functionality.
              </p>
            </div>
          </div>

          <p>
            By accessing, browsing, downloading, or using Otix (&ldquo;the Service&rdquo;), you agree to be bound by these Terms of Service (&ldquo;Terms&rdquo;). Otix provides personal media tracking, library organization, discoverability tools, launcher integrations, and unified interface software. If you do not agree to these Terms, you may not use the Service.
          </p>
          <p>
            These Terms constitute a legally binding agreement between you and Otix. We reserve the right to update these terms with prior notice through our client interface or announcements. Continued use of the Service following revisions constitutes acceptance of the amended terms.
          </p>
        </section>

        {/* Section 2: Zero Media Relay Policy & Architecture */}
        <section id="byos-architecture" className="rounded-2xl sm:rounded-3xl p-6 sm:p-8 bg-[var(--dk-surface-base)] backdrop-blur-xl border border-[var(--dk-separator)] shadow-[var(--dk-shadow-sm)] space-y-4 scroll-mt-28">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Radio className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                2. Zero Media Relay Policy &amp; Direct Playback Architecture
              </h2>
              <p className="text-xs text-muted-foreground">
                Technical playback architecture and absolute separation from media storage.
              </p>
            </div>
          </div>

          <p>
            Otix functions strictly as a user interface client. The technical infrastructure of Otix operates under an immutable zero-media-relay architecture:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-xs sm:text-sm text-foreground/80">
            <li>
              <strong className="text-foreground">No Central Media Storage:</strong> Otix central servers and databases store only account credentials, user preferences, and metadata identifiers.
            </li>
            <li>
              <strong className="text-foreground">Direct Client-to-Host Streaming:</strong> Video and audio playback bitstreams (such as HLS fragments and MP4 containers) travel directly between your client device and your connected media server. Otix servers never receive, touch, transcode, or proxy your media data.
            </li>
            <li>
              <strong className="text-foreground">Strict Tenant Isolation:</strong> Server connections, authentication tokens, and playback streams are private and isolated to the authenticated user. Otix does not allow cross-account streaming or access to another user&apos;s private media hardware.
            </li>
          </ul>
        </section>

        {/* Section 3: User Responsibility */}
        <section id="user-responsibility" className="rounded-2xl sm:rounded-3xl p-6 sm:p-8 bg-[var(--dk-surface-base)] backdrop-blur-xl border border-[var(--dk-separator)] shadow-[var(--dk-shadow-sm)] space-y-4 scroll-mt-28">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Lock className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                3. User Responsibility &amp; Private Domestic Use
              </h2>
              <p className="text-xs text-muted-foreground">
                Personal ownership, fair-use exemptions, and non-commercial usage warranties.
              </p>
            </div>
          </div>

          <p>You acknowledge and agree that:</p>
          <ul className="list-disc pl-5 space-y-2 text-xs sm:text-sm text-foreground/80">
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

        {/* Section 4: Public Lists, Collections & Metadata */}
        <section id="lists-metadata" className="rounded-2xl sm:rounded-3xl p-6 sm:p-8 bg-[var(--dk-surface-base)] backdrop-blur-xl border border-[var(--dk-separator)] shadow-[var(--dk-shadow-sm)] space-y-4 scroll-mt-28">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Globe className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                4. Public Lists, Collections &amp; Bibliographic Metadata
              </h2>
              <p className="text-xs text-muted-foreground">
                Bibliographic metadata curation, community reviews, and anti-file-sharing controls.
              </p>
            </div>
          </div>

          <p>
            Otix enables users to curate lists, organize watchlists, write reviews, and mark titles as &ldquo;owned&rdquo; or &ldquo;in library&rdquo;:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-xs sm:text-sm text-foreground/80">
            <li>
              <strong className="text-foreground">Bibliographic Metadata Only:</strong> Public lists and collection showcases consist purely of text titles, release years, community ratings, and public promotional artwork.
            </li>
            <li>
              <strong className="text-foreground">No File Sharing or Redistribution:</strong> Sharing a list or displaying an &ldquo;in library&rdquo; status does not grant third parties access or rights to stream, download, or copy files from your personal servers. Otix never serves media files to third-party visitors viewing your lists.
            </li>
            <li>
              <strong className="text-foreground">Third-Party Metadata Sources:</strong> Media metadata, synopses, and imagery are retrieved from community public APIs (including TMDB, TheTVDB, IGDB, MusicBrainz, and SteamGridDB) and remain the property of their respective contributors.
            </li>
          </ul>
        </section>

        {/* Section 5: Third-Party Integrations */}
        <section id="integrations" className="rounded-2xl sm:rounded-3xl p-6 sm:p-8 bg-[var(--dk-surface-base)] backdrop-blur-xl border border-[var(--dk-separator)] shadow-[var(--dk-shadow-sm)] space-y-4 scroll-mt-28">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Film className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                5. Third-Party Integrations &amp; Trademarks
              </h2>
              <p className="text-xs text-muted-foreground">
                Independent client software status and third-party platform trademarks.
              </p>
            </div>
          </div>

          <p>
            Otix provides optional client-side connections to third-party services, including Plex, Jellyfin, Steam, Epic Games, and Google.
          </p>
          <p>
            Your use of any integrated third-party service is governed by that service&apos;s respective Terms of Service and Privacy Policy. Otix is an independent software application and is not affiliated with, endorsed by, or sponsored by Plex Inc., Valve Corporation, Epic Games, Google LLC, or any studio or publisher. All product names, logos, and brands are property of their respective owners.
          </p>
        </section>

        {/* Section 6: Prohibited Activities */}
        <section id="prohibited" className="rounded-2xl sm:rounded-3xl p-6 sm:p-8 bg-[var(--dk-surface-base)] backdrop-blur-xl border border-[var(--dk-separator)] shadow-[var(--dk-shadow-sm)] space-y-4 scroll-mt-28">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <AlertTriangle className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                6. Prohibited Activities &amp; Acceptable Use
              </h2>
              <p className="text-xs text-muted-foreground">
                Rules governing network integrity, lawful operation, and abuse prevention.
              </p>
            </div>
          </div>

          <p>You agree not to use Otix to:</p>
          <ul className="list-disc pl-5 space-y-2 text-xs sm:text-sm text-foreground/80">
            <li>Operate an unauthorized commercial streaming, rebroadcasting, or distribution service.</li>
            <li>Charge third parties subscription or viewing fees to access media streams from personal servers.</li>
            <li>Circumvent technological measures, encryption, or access controls implemented by Otix or third-party providers.</li>
            <li>Engage in any activity that infringes upon the intellectual property, copyright, or privacy rights of any party.</li>
            <li>Disrupt or compromise server infrastructure, rate limits, or API availability through automated bot abuse or denial-of-service attacks.</li>
          </ul>
        </section>

        {/* Section 7: Subscription, Billing & Refund Policy */}
        <section id="refunds" className="rounded-2xl sm:rounded-3xl p-6 sm:p-8 bg-[var(--dk-surface-base)] backdrop-blur-xl border border-[var(--dk-separator)] shadow-[var(--dk-shadow-sm)] space-y-4 scroll-mt-28">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <DollarSign className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                7. Subscription, Billing &amp; Refund Policy
              </h2>
              <p className="text-xs text-muted-foreground">
                Transparent billing terms, self-service cancellation, and statutory refund entitlements.
              </p>
            </div>
          </div>

          <p>
            Otix believes in transparent, consumer-friendly policies without hidden traps or artificial barriers:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-xs sm:text-sm text-foreground/80">
            <li>
              <strong className="text-foreground">Self-Service Cancellation:</strong> If any paid tier or subscription is enabled, cancellation can be performed with one click from account settings without retention surveys or artificial barriers.
            </li>
            <li>
              <strong className="text-foreground">14-Day Statutory Refund Window:</strong> Users residing in the EU, UK, and other qualifying jurisdictions are entitled to a full refund within 14 days of initial purchase.
            </li>
            <li>
              <strong className="text-foreground">Fair Usage &amp; Support:</strong> To request a refund or invoice clarification, contact <code className="text-primary font-mono">support@otix.app</code> with your account email.
            </li>
          </ul>
        </section>

        {/* Section 8: Font & Asset Licensing */}
        <section id="licensing" className="rounded-2xl sm:rounded-3xl p-6 sm:p-8 bg-[var(--dk-surface-base)] backdrop-blur-xl border border-[var(--dk-separator)] shadow-[var(--dk-shadow-sm)] space-y-4 scroll-mt-28">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Layers className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                8. Font, Asset &amp; Intellectual Property Licenses
              </h2>
              <p className="text-xs text-muted-foreground">
                Attribution and open-source licenses governing Otix interface assets.
              </p>
            </div>
          </div>

          <p>
            All software typography (including Inter and system font stacks) are utilized under permissive open-source licenses (SIL Open Font License). Movie, TV show, music, and gaming artwork is retrieved dynamically from community metadata APIs and is utilized under promotional fair use and API attribution agreements.
          </p>
        </section>

        {/* Section 9: DMCA Safe Harbor */}
        <section id="dmca" className="rounded-2xl sm:rounded-3xl p-6 sm:p-8 bg-[var(--dk-surface-base)] backdrop-blur-xl border border-[var(--dk-separator)] shadow-[var(--dk-shadow-sm)] space-y-4 scroll-mt-28">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <ShieldCheck className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                9. DMCA &amp; Copyright Safe Harbor Notice
              </h2>
              <p className="text-xs text-muted-foreground">
                Takedown procedure and designated copyright agent information.
              </p>
            </div>
          </div>

          <p>
            Otix complies with the Digital Millennium Copyright Act (17 U.S.C. § 512) and applicable international copyright conventions. Because Otix does not host, store, or transmit audio or video content, notifications regarding content hosted on independent personal servers should be directed to the relevant hosting provider or server administrator.
          </p>
          <p>
            For inquiries regarding metadata, terms, or software components operated directly by Otix, reach our designated legal team at <code className="text-primary font-mono">legal@otix.app</code> (Website:{' '}
            <a href="https://otix.app" className="text-primary underline underline-offset-2">
              https://otix.app
            </a>
            ).
          </p>
        </section>

        {/* Section 10: Disclaimer of Warranties & Limitation of Liability */}
        <section id="liability" className="rounded-2xl sm:rounded-3xl p-6 sm:p-8 bg-[var(--dk-surface-base)] backdrop-blur-xl border border-[var(--dk-separator)] shadow-[var(--dk-shadow-sm)] space-y-4 scroll-mt-28">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <FileText className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                10. Disclaimer of Warranties &amp; Limitation of Liability
              </h2>
              <p className="text-xs text-muted-foreground">
                As-is software provisions, uptime disclaimers, and statutory liabilities.
              </p>
            </div>
          </div>

          <p className="uppercase text-xs tracking-wider text-muted-foreground font-medium">
            THE SERVICE IS PROVIDED ON AN &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; BASIS WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED.
          </p>
          <p>
            To the fullest extent permitted by applicable law, Otix and its developers disclaim all liability for any indirect, incidental, punitive, or consequential damages resulting from your use of the software, including media server downtime, network interruptions, or changes to third-party APIs.
          </p>
          <p>
            If any provision of these Terms is deemed unlawful or unenforceable, that provision shall be deemed severable and shall not affect the validity and enforceability of any remaining provisions.
          </p>
        </section>
      </div>
    </div>
  )
};
