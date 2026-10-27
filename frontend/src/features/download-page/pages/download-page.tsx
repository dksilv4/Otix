import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from '@tanstack/react-router'
import {
  ChevronRight,
  ExternalLink,
  Sparkles,
  HelpCircle,
  FolderDown,
  RefreshCw,
} from 'lucide-react'
import { useDetectedPlatform } from '../hooks/use-detected-platform'
import { useLatestRelease } from '../hooks/use-latest-release'
import {
  getPrimaryOptionForPlatform,
  parseReleaseNotesHighlights,
} from '../utils/downloads-utils'
import { DOWNLOAD_FAQS } from '../constants/downloads-data'
import { DownloadHero } from '../components/molecules/download-hero'
import { DownloadOptionsGrid } from '../components/molecules/download-options-grid'
import { DownloadNodeSection } from '../components/molecules/download-node-section'
import { DownloadSuccessBanner } from '../components/molecules/download-success-banner'
import { DkButton } from '@ui/atoms/button'
import { ReleaseNotesModal } from '@/features/updater'
import type { PlatformDownloadOption, PlatformId } from '../types'

export const DownloadPage = () => {
  const { detectedPlatform, activeTab, setActiveTab } = useDetectedPlatform()
  const { releaseInfo, options, isLoading, refetch } = useLatestRelease()
  const [lastDownloaded, setLastDownloaded] = useState<PlatformDownloadOption | null>(null)
  const [showReleaseNotesModal, setShowReleaseNotesModal] = useState(false)

  const primaryOption = getPrimaryOptionForPlatform(options, detectedPlatform)
  const highlights = parseReleaseNotesHighlights(releaseInfo.releaseNotes)

  const handleDownloadInitiated = (option: PlatformDownloadOption) => {
    setLastDownloaded(option)
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const handleDismissBanner = () => {
    setLastDownloaded(null)
  }

  const handleTabSelect = (tab: PlatformId) => {
    setActiveTab(tab)
  }

  return (
    <div
      id="downloads-page"
      className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-10"
    >
      <Helmet>
        <title>Download Otix — Free Desktop App for Windows, macOS &amp; Linux</title>
        <meta
          name="description"
          content="Download Otix directly for Windows, macOS, Linux, and Otix Node. 100% free, open-source media client and universal game launcher."
        />
        <meta property="og:title" content="Download Otix Desktop App" />
        <meta
          property="og:description"
          content="Get the official Otix app for Windows, macOS, Linux, and headless servers straight from the official build repository."
        />
      </Helmet>

      {/* Top Header & Breadcrumb Nav */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-xs text-muted-foreground"
        >
          <Link to="/" className="hover:text-foreground transition-colors">
            Home
          </Link>
          <ChevronRight className="h-3 w-3 opacity-40 shrink-0" />
          <span className="text-foreground font-semibold">Downloads</span>
        </nav>

        <div className="flex items-center gap-3 text-xs">
          <button
            type="button"
            onClick={() => setShowReleaseNotesModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)] transition-colors cursor-pointer"
          >
            <span>Release Notes</span>
          </button>
          <a
            href="https://github.com/dksilv4/Otix"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)] transition-colors"
          >
            <span>GitHub Repository</span>
            <ExternalLink className="h-3 w-3 opacity-60" />
          </a>
          <a
            href="https://github.com/dksilv4/Otix/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)] transition-colors"
          >
            <span>Release Archive</span>
            <ExternalLink className="h-3 w-3 opacity-60" />
          </a>
        </div>
      </div>

      {/* Active Download Success / Instructions Banner */}
      <DownloadSuccessBanner
        lastDownloadedOption={lastDownloaded}
        onDismiss={handleDismissBanner}
      />

      {/* Hero Section with Detected OS */}
      <DownloadHero
        releaseInfo={releaseInfo}
        detectedPlatform={detectedPlatform}
        primaryOption={primaryOption}
        onSelectTab={handleTabSelect}
        onDownload={handleDownloadInitiated}
      />

      {/* Release Highlights / What's New Card */}
      {highlights.length > 0 && (
        <section className="rounded-2xl sm:rounded-3xl p-6 sm:p-7 backdrop-blur-xl bg-[var(--dk-surface-glass)] shadow-[var(--dk-shadow-glass)] space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>What&apos;s New in Otix {releaseInfo.tagName}</span>
            </div>
            <div className="flex items-center gap-2">
              <DkButton
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setShowReleaseNotesModal(true)}
                className="rounded-xl px-2.5 py-1 text-xs font-semibold"
              >
                View Full Release Notes
              </DkButton>
              <button
                type="button"
                onClick={() => refetch()}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-[var(--dk-surface-ghost)] transition-colors"
                title="Refresh release info"
                aria-label="Refresh release info"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <ul className="space-y-1.5 text-xs text-muted-foreground">
            {highlights.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2 leading-relaxed">
                <span className="text-primary font-bold">›</span>
                <span className="text-foreground/90">{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Platform Download Options & Companion Node */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2">
            <FolderDown className="h-5 w-5 text-primary" />
            <span>All Platforms &amp; Formats</span>
          </h2>
          <span className="text-xs text-muted-foreground">
            Version {releaseInfo.version}
          </span>
        </div>

        {activeTab === 'node' ? (
          <div className="space-y-6">
            <div className="flex justify-center pb-2">
              <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-[var(--dk-surface-ghost)] backdrop-blur-xl shadow-inner">
                <button
                  type="button"
                  onClick={() => handleTabSelect('windows')}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  Windows
                </button>
                <button
                  type="button"
                  onClick={() => handleTabSelect('macos')}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  macOS
                </button>
                <button
                  type="button"
                  onClick={() => handleTabSelect('linux')}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  Linux
                </button>
                <button
                  type="button"
                  onClick={() => handleTabSelect('node')}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--dk-surface-raised)] text-foreground shadow-[var(--dk-shadow-sm)]"
                >
                  Otix Node
                </button>
              </div>
            </div>
            <DownloadNodeSection options={options} onDownload={handleDownloadInitiated} />
          </div>
        ) : (
          <DownloadOptionsGrid
            options={options}
            activeTab={activeTab}
            onSelectTab={handleTabSelect}
            onDownload={handleDownloadInitiated}
          />
        )}
      </section>

      {/* Frequently Asked Questions */}
      <section className="rounded-2xl sm:rounded-3xl p-6 sm:p-8 backdrop-blur-xl bg-[var(--dk-surface-glass)] shadow-[var(--dk-shadow-glass)] space-y-6">
        <div className="flex items-center gap-2 text-foreground font-bold text-base sm:text-lg">
          <HelpCircle className="h-5 w-5 text-primary" />
          <span>Downloads FAQ</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {DOWNLOAD_FAQS.map((faq, idx) => (
            <div
              key={idx}
              className="p-4 rounded-xl bg-[var(--dk-surface-ghost)] space-y-2"
            >
              <h3 className="font-semibold text-xs sm:text-sm text-foreground">
                {faq.question}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {faq.answer}
              </p>
            </div>
          ))}
        </div>
      </section>

      {showReleaseNotesModal && (
        <ReleaseNotesModal
          isOpen={showReleaseNotesModal}
          onClose={() => setShowReleaseNotesModal(false)}
          version={releaseInfo.tagName}
          releaseNotes={releaseInfo.releaseNotes}
        />
      )}
    </div>
  )
}
