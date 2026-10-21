import { useState, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from '@tanstack/react-router'
import {
  ScrollText,
  ExternalLink,
  ChevronRight,
  Maximize2,
  RefreshCw,
} from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { openExternal } from '@/lib/utils/open-external'
import { useAppUpdater } from '../hooks/use-app-updater'
import {
  fetchLatestReleaseNotes,
  formatReleaseNotesDate,
} from '../utils/updater-utils'
import { ReleaseNotesMarkdown } from '../components/release-notes-markdown'
import { ReleaseNotesModal } from '../components/release-notes-modal'

export const ReleaseNotesPage = () => {
  const {
    currentVersion,
    availableVersion,
    releaseNotes,
    openReleaseNotesModal,
  } = useAppUpdater()

  const [fetchedNotes, setFetchedNotes] = useState<string | null>(null)
  const [publishedAt, setPublishedAt] = useState<string | null>(null)
  const [fetchedVersion, setFetchedVersion] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)

  const activeNotes = releaseNotes || fetchedNotes || ''
  const displayVersion = fetchedVersion || availableVersion || currentVersion

  useEffect(() => {
    if (!releaseNotes && !fetchedNotes && !isLoading) {
      setIsLoading(true)
      fetchLatestReleaseNotes()
        .then((latest) => {
          if (latest?.notes) {
            setFetchedNotes(latest.notes)
            if (latest.version) setFetchedVersion(latest.version)
            if (latest.publishedAt) setPublishedAt(latest.publishedAt)
          }
        })
        .catch(() => {})
        .finally(() => {
          setIsLoading(false)
        })
    }
  }, [releaseNotes, fetchedNotes, isLoading])

  const handleOpenGitHub = () => {
    const rawTag = displayVersion ? displayVersion.trim() : ''
    const tag = rawTag ? (rawTag.startsWith('v') ? rawTag : `v${rawTag}`) : ''
    const url = tag
      ? `https://github.com/dksilv4/Otix/releases/tag/${tag}`
      : 'https://github.com/dksilv4/Otix/releases'
    openExternal(url, { newTab: true })
  }

  const handleOpenModal = () => {
    if (openReleaseNotesModal) {
      openReleaseNotesModal()
    } else {
      setIsModalOpen(true)
    }
  }

  return (
    <div
      id="release-notes-page"
      className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-8"
    >
      <Helmet>
        <title>Release Notes — What&apos;s New in Otix</title>
        <meta
          name="description"
          content="Latest release notes, changelogs, feature updates, and performance improvements for Otix."
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
          <span className="text-foreground font-semibold">Release Notes</span>
        </nav>

        <div className="flex items-center gap-2 text-xs">
          <DkButton
            type="button"
            size="sm"
            variant="ghost"
            leftIcon={Maximize2}
            onClick={handleOpenModal}
            className="rounded-xl px-3 text-xs font-semibold"
          >
            Open in Modal
          </DkButton>
          <DkButton
            type="button"
            size="sm"
            variant="secondary"
            leftIcon={ExternalLink}
            onClick={handleOpenGitHub}
            className="rounded-xl px-3 text-xs font-semibold"
          >
            GitHub Releases
          </DkButton>
        </div>
      </div>

      {/* Hero Header */}
      <header className="rounded-2xl sm:rounded-3xl p-6 sm:p-8 backdrop-blur-xl bg-[var(--dk-surface-base)] border border-white/[0.04] shadow-[var(--dk-shadow-xs)] space-y-4">
        <div className="flex items-start gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl glass-inset shadow-inner"
            style={{
              color: 'var(--primary)',
              backgroundColor: 'color-mix(in srgb, var(--primary) 14%, transparent)',
            }}
          >
            <ScrollText className="h-6 w-6" />
          </div>
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                Release Notes
              </h1>
              {displayVersion && (
                <span className="rounded-full px-2.5 py-0.5 font-mono text-xs font-semibold bg-primary/10 text-primary border border-white/[0.04]">
                  v{displayVersion.replace(/^v/, '')}
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {publishedAt
                ? `Published on ${formatReleaseNotesDate(publishedAt)}`
                : 'Latest release changelog, features, and fixes.'}
            </p>
          </div>
        </div>
      </header>

      {/* Main Release Notes Content */}
      <section className="rounded-2xl sm:rounded-3xl p-6 sm:p-8 backdrop-blur-xl bg-[var(--dk-surface-base)] border border-white/[0.04] shadow-[var(--dk-shadow-xs)] min-h-[300px]">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <RefreshCw className="h-7 w-7 animate-spin text-primary" />
            <span className="text-sm font-semibold text-foreground">
              Loading release notes...
            </span>
            <p className="text-xs text-muted-foreground">
              Fetching latest release data from GitHub servers.
            </p>
          </div>
        ) : (
          <ReleaseNotesMarkdown content={activeNotes} />
        )}
      </section>

      {isModalOpen && (
        <ReleaseNotesModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          version={displayVersion}
          releaseNotes={activeNotes}
        />
      )}
    </div>
  )
}
