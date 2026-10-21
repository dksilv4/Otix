import { useState, useEffect } from 'react'
import { ScrollText, ExternalLink, RefreshCw } from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { openExternal } from '@/lib/utils/open-external'
import { useAppUpdater } from '../hooks/use-app-updater'
import {
  fetchLatestReleaseNotes,
  formatReleaseNotesDate,
} from '../utils/updater-utils'
import { ReleaseNotesMarkdown } from './release-notes-markdown'

export interface ReleaseNotesModalProps {
  isOpen?: boolean
  isExiting?: boolean
  onClose?: () => void
  version?: string | null
  releaseNotes?: string | null
}

export const ReleaseNotesModal = ({
  isOpen,
  isExiting,
  onClose,
  version,
  releaseNotes: propReleaseNotes,
}: ReleaseNotesModalProps) => {
  const {
    currentVersion,
    availableVersion,
    releaseNotes: updaterNotes,
    isReleaseNotesOpen,
    closeReleaseNotesModal,
  } = useAppUpdater()

  const resolvedOpen = isOpen !== undefined ? isOpen : (isReleaseNotesOpen ?? false)
  const resolvedVersion = version || availableVersion || currentVersion
  const [fetchedNotes, setFetchedNotes] = useState<string | null>(null)
  const [publishedAt, setPublishedAt] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)

  const activeNotes = propReleaseNotes ?? updaterNotes

  useEffect(() => {
    if (resolvedOpen && !activeNotes && !fetchedNotes && !isLoading) {
      setIsLoading(true)
      fetchLatestReleaseNotes()
        .then((latest) => {
          if (latest?.notes) {
            setFetchedNotes(latest.notes)
            if (latest.publishedAt) {
              setPublishedAt(latest.publishedAt)
            }
          }
        })
        .catch(() => {})
        .finally(() => {
          setIsLoading(false)
        })
    }
  }, [resolvedOpen, activeNotes, fetchedNotes, isLoading])

  const handleClose = () => {
    onClose?.()
    closeReleaseNotesModal?.()
  }

  const notesToDisplay = activeNotes || fetchedNotes || ''

  const handleOpenGitHub = () => {
    const rawTag = resolvedVersion ? resolvedVersion.trim() : ''
    const tag = rawTag ? (rawTag.startsWith('v') ? rawTag : `v${rawTag}`) : ''
    const url = tag
      ? `https://github.com/dksilv4/Otix/releases/tag/${tag}`
      : 'https://github.com/dksilv4/Otix/releases'
    openExternal(url, { newTab: true })
  }

  return (
    <DkDialog
      open={resolvedOpen && !isExiting}
      onOpenChange={(open) => {
        if (!open) handleClose()
      }}
      className="max-w-2xl max-h-[88vh] flex flex-col p-6 sm:p-7"
    >
      <div className="flex flex-col min-h-0 flex-1 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-3 border-b border-white/[0.04]">
          <div className="flex items-center gap-3.5">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl glass-inset shadow-inner"
              style={{
                color: 'var(--primary)',
                backgroundColor: 'color-mix(in srgb, var(--primary) 14%, transparent)',
              }}
            >
              <ScrollText className="h-5 w-5" />
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight text-foreground">
                  Release Notes
                </h2>
                {resolvedVersion && (
                  <span className="rounded-full px-2.5 py-0.5 font-mono text-[11px] font-semibold bg-primary/10 text-primary border border-white/[0.04]">
                    v{resolvedVersion.replace(/^v/, '')}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {publishedAt
                  ? `Published on ${formatReleaseNotesDate(publishedAt)}`
                  : 'Official changelog and feature updates for Otix.'}
              </p>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl p-4 sm:p-5 bg-[var(--dk-surface-base)] border border-white/[0.04] space-y-3">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <RefreshCw className="h-6 w-6 animate-spin text-primary" />
              <span className="text-xs font-semibold text-foreground">
                Loading release notes...
              </span>
              <p className="text-xs text-muted-foreground">
                Fetching latest release details from GitHub.
              </p>
            </div>
          ) : (
            <ReleaseNotesMarkdown content={notesToDisplay} />
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-1">
          <DkButton
            type="button"
            size="sm"
            variant="ghost"
            leftIcon={ExternalLink}
            onClick={handleOpenGitHub}
            className="rounded-xl px-3 text-xs font-semibold"
          >
            View on GitHub
          </DkButton>

          <DkButton
            type="button"
            size="sm"
            variant="primary"
            onClick={handleClose}
            className="rounded-xl px-5 text-xs font-semibold"
          >
            Close
          </DkButton>
        </div>
      </div>
    </DkDialog>
  )
}
