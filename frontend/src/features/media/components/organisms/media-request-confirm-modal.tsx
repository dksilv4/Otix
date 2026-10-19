import { useEffect, useMemo, useState } from 'react'
import { Check, Clock, Film, HardDrive, Layers, Loader2, Server, Tv } from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { DkDropdown, type DkDropdownOption } from '@ui/atoms/dropdown'
import { DkSwitch } from '@ui/atoms/switch'
import { showToast } from '@ui/molecules/toast'
import { formatBytes } from '@/lib/utils'
import {
  useServerRadarrConfig,
  useServerRadarrQualityProfiles,
  useServerRadarrRootFolders,
  useServerSonarrConfig,
  useServerSonarrQualityProfiles,
  useServerSonarrRootFolders,
} from '@/features/downloads/use-server-arr'
import type { RequestMediaState } from '../../hooks/use-request-media'
import { parseServerArrInstanceId } from '../../hooks/arr-detail-status'

interface MediaRequestConfirmModalProps {
  open: boolean
  onClose: () => void
  state: RequestMediaState
  initialInstanceId?: string
}

export const MediaRequestConfirmModal = ({
  open,
  onClose,
  state,
  initialInstanceId,
}: MediaRequestConfirmModalProps) => {
  const isMovie = state.mediaType === 'movie'

  // Requestable instances
  const targets = useMemo(() => {
    const list = state.instances.filter((item) => item.status === 'not_exists' || item.status === 'error')
    return list.length > 0 ? list : state.instances
  }, [state.instances])

  const availableInstances = state.instances.length > 0 ? state.instances : targets

  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('')
  const [qualityProfileId, setQualityProfileId] = useState<string>('')
  const [rootFolderPath, setRootFolderPath] = useState<string>('')
  const [searchNow, setSearchNow] = useState(true)
  const [monitored, setMonitored] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Live double-check status on target instances when modal opens
  useEffect(() => {
    if (open) {
      void state.refetchStatus?.()
    }
  }, [open, state.refetchStatus])

  // Synchronize initial instance
  useEffect(() => {
    if (!open) return
    const fallbackId = targets[0]?.id || availableInstances[0]?.id || ''
    const match = availableInstances.find((item) => item.id === initialInstanceId)
    setSelectedInstanceId(match ? match.id : fallbackId)
  }, [open, initialInstanceId, targets, availableInstances])

  const currentInstance =
    state.instances.find((item) => item.id === selectedInstanceId) ||
    targets.find((item) => item.id === selectedInstanceId) ||
    targets[0] ||
    state.instances[0]

  const isDownloaded = currentInstance?.status === 'downloaded'
  const isRequested = currentInstance?.status === 'requested'
  const isChecking = Boolean(state.isCheckingStatus)

  // Extract parsed arrInstanceId
  const parsed = useMemo(
    () => parseServerArrInstanceId(selectedInstanceId || targets[0]?.id || ''),
    [selectedInstanceId, targets],
  )
  const targetServerId = state.serverId

  // Config defaults
  const sonarrConfigQuery = useServerSonarrConfig(targetServerId)
  const radarrConfigQuery = useServerRadarrConfig(targetServerId)
  const config = isMovie ? radarrConfigQuery.data : sonarrConfigQuery.data

  // Fetch quality profiles
  const sonarrProfilesQuery = useServerSonarrQualityProfiles(targetServerId, parsed.arrInstanceId, {
    enabled: open && !isMovie,
  })
  const radarrProfilesQuery = useServerRadarrQualityProfiles(targetServerId, parsed.arrInstanceId, {
    enabled: open && isMovie,
  })
  const profiles = (isMovie ? radarrProfilesQuery.data : sonarrProfilesQuery.data) || []
  const loadingProfiles = isMovie ? radarrProfilesQuery.isLoading : sonarrProfilesQuery.isLoading

  // Fetch root folders
  const sonarrFoldersQuery = useServerSonarrRootFolders(targetServerId, parsed.arrInstanceId, {
    enabled: open && !isMovie,
  })
  const radarrFoldersQuery = useServerRadarrRootFolders(targetServerId, parsed.arrInstanceId, {
    enabled: open && isMovie,
  })
  const rootFolders = (isMovie ? radarrFoldersQuery.data : sonarrFoldersQuery.data) || []
  const loadingFolders = isMovie ? radarrFoldersQuery.isLoading : sonarrFoldersQuery.isLoading

  // Synchronize default quality profile
  useEffect(() => {
    if (!open || profiles.length === 0) return
    const configuredId = config?.quality_profile_id ?? config?.qualityProfileId
    const exists = profiles.some((p) => String(p.id) === String(configuredId))
    if (configuredId && exists) {
      setQualityProfileId(String(configuredId))
    } else if (!qualityProfileId || !profiles.some((p) => String(p.id) === qualityProfileId)) {
      setQualityProfileId(String(profiles[0].id))
    }
  }, [open, profiles, config, qualityProfileId])

  // Synchronize default root folder
  useEffect(() => {
    if (!open || rootFolders.length === 0) return
    const configuredPath = config?.root_folder_path ?? config?.rootFolderPath
    const exists = rootFolders.some((rf) => rf.path === configuredPath)
    if (configuredPath && exists) {
      setRootFolderPath(configuredPath)
    } else if (!rootFolderPath || !rootFolders.some((rf) => rf.path === rootFolderPath)) {
      setRootFolderPath(rootFolders[0].path)
    }
  }, [open, rootFolders, config, rootFolderPath])

  const instanceOptions: DkDropdownOption[] = useMemo(
    () =>
      availableInstances.map((inst) => {
        let suffix = ''
        if (inst.status === 'downloaded') suffix = ' (Available)'
        else if (inst.status === 'requested') suffix = ' (Requested)'
        return { value: inst.id, label: `${inst.name}${suffix}` }
      }),
    [availableInstances],
  )

  const qualityProfileOptions: DkDropdownOption[] = useMemo(
    () => profiles.map((p) => ({ value: String(p.id), label: p.name })),
    [profiles],
  )

  const rootFolderOptions: DkDropdownOption[] = useMemo(
    () =>
      rootFolders.map((rf) => {
        const free = rf.freeSpace ?? rf.free_space
        return {
          value: rf.path,
          label: free ? `${rf.path} (${formatBytes(free)} free)` : rf.path,
        }
      }),
    [rootFolders],
  )

  const selectedInstance = currentInstance || targets.find((item) => item.id === selectedInstanceId) || targets[0]

  const handleConfirm = async () => {
    if (isDownloaded || isRequested) {
      showToast({
        title: isDownloaded ? 'Already in Library' : 'Already requested',
        description: `This title is already ${isDownloaded ? 'downloaded' : 'requested'} on ${selectedInstance?.name || state.activeServerName}`,
        variant: 'info',
      })
      onClose()
      return
    }

    setSubmitting(true)
    try {
      await state.handleRequest({
        instanceId: selectedInstanceId || undefined,
        qualityProfileId: qualityProfileId ? Number(qualityProfileId) : undefined,
        rootFolderPath: rootFolderPath || undefined,
        searchNow,
        monitored,
      })
      showToast({
        title: `${state.requestLabel.replace('Request ', '')} requested`,
        description: `Sent to ${selectedInstance?.name || state.activeServerName}`,
        variant: 'success',
      })
      onClose()
    } catch (err) {
      showToast({
        title: 'Request failed',
        description: err instanceof Error ? err.message : 'Could not send this title to your server',
        variant: 'error',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <DkDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !submitting) onClose()
      }}
      title={`Confirm Request: ${state.mediaTitle || 'Media'}`}
      description="Review destination and quality profile before sending to your library"
      className="max-w-lg"
    >
      <div className="space-y-4 pt-1">
        {/* Media Preview Card */}
        <div className="flex items-center gap-3.5 rounded-2xl border border-[var(--dk-separator)] bg-[var(--dk-surface-glass)] p-3">
          {state.posterUrl ? (
            <img
              src={state.posterUrl}
              alt={state.mediaTitle}
              className="h-16 w-11 shrink-0 rounded-lg object-cover shadow border border-[var(--dk-separator)] bg-[var(--dk-surface-glass)]"
            />
          ) : (
            <div className="flex h-16 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--dk-separator)] bg-[var(--dk-surface-glass)] text-muted-foreground">
              {isMovie ? <Film className="h-5 w-5" /> : <Tv className="h-5 w-5" />}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h4 className="truncate font-semibold text-foreground text-sm sm:text-base leading-snug">
              {state.mediaTitle || 'Unknown title'}
            </h4>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {state.mediaYear && <span>{state.mediaYear}</span>}
              <span className="inline-flex items-center gap-1 rounded-md bg-[var(--dk-surface-glass)] px-2 py-0.5 text-[11px] font-medium text-foreground">
                {isMovie ? <Film className="h-3 w-3" /> : <Tv className="h-3 w-3" />}
                {isMovie ? 'Movie · Radarr' : 'TV Series · Sonarr'}
              </span>
            </div>
          </div>
        </div>

        {/* Status Verification Alerts */}
        {isDownloaded && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300">
            <Check className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
            <div className="min-w-0">
              <p className="font-semibold text-emerald-700 dark:text-emerald-300">Available in Library</p>
              <p className="text-muted-foreground mt-0.5">
                This {isMovie ? 'movie' : 'show'} is already downloaded on{' '}
                <span className="text-foreground font-medium">{selectedInstance?.name || state.activeServerName}</span>.
              </p>
            </div>
          </div>
        )}

        {isRequested && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
            <Clock className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
            <div className="min-w-0">
              <p className="font-semibold text-amber-700 dark:text-amber-300">Already Requested</p>
              <p className="text-muted-foreground mt-0.5">
                This {isMovie ? 'movie' : 'show'} is already requested and monitored on{' '}
                <span className="text-foreground font-medium">{selectedInstance?.name || state.activeServerName}</span>.
              </p>
            </div>
          </div>
        )}

        {/* Form Options */}
        <div className="space-y-3.5 rounded-2xl border border-[var(--dk-separator)] bg-[var(--dk-surface-glass)] p-4 text-xs">
          {/* Target Instance */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="flex items-center gap-1.5 font-medium text-foreground">
                <Server className="h-3.5 w-3.5 text-primary" />
                <span>Target Instance</span>
              </label>
              {isChecking && (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  <span>Checking status…</span>
                </span>
              )}
            </div>
            {instanceOptions.length > 1 ? (
              <DkDropdown
                options={instanceOptions}
                value={selectedInstanceId}
                onChange={setSelectedInstanceId}
                placeholder="Select instance..."
                className="w-full"
              />
            ) : (
              <div className="flex items-center justify-between rounded-xl border border-[var(--dk-separator)] bg-[var(--dk-surface-glass)] px-3 py-2 text-sm text-foreground">
                <span>{selectedInstance?.name || state.activeServerName}</span>
                <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Active</span>
              </div>
            )}
          </div>

          {/* Quality Profile */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 font-medium text-foreground">
              <Layers className="h-3.5 w-3.5 text-primary" />
              <span>Quality Profile</span>
            </label>
            {loadingProfiles ? (
              <div className="flex items-center gap-2 rounded-xl border border-[var(--dk-separator)] bg-[var(--dk-surface-glass)] px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Loading quality profiles…</span>
              </div>
            ) : qualityProfileOptions.length > 0 ? (
              <DkDropdown
                options={qualityProfileOptions}
                value={qualityProfileId}
                onChange={setQualityProfileId}
                placeholder="Select quality profile..."
                className="w-full"
              />
            ) : (
              <div className="rounded-xl border border-[var(--dk-separator)] bg-[var(--dk-surface-glass)] px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                No quality profiles discovered. Default will be requested.
              </div>
            )}
          </div>

          {/* Root Folder */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 font-medium text-foreground">
              <HardDrive className="h-3.5 w-3.5 text-primary" />
              <span>Root Folder</span>
            </label>
            {loadingFolders ? (
              <div className="flex items-center gap-2 rounded-xl border border-[var(--dk-separator)] bg-[var(--dk-surface-glass)] px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Loading root folders…</span>
              </div>
            ) : rootFolderOptions.length > 0 ? (
              <DkDropdown
                options={rootFolderOptions}
                value={rootFolderPath}
                onChange={setRootFolderPath}
                placeholder="Select root folder..."
                className="w-full"
              />
            ) : (
              <div className="rounded-xl border border-[var(--dk-separator)] bg-[var(--dk-surface-glass)] px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                No root folders discovered. Default path will be used.
              </div>
            )}
          </div>

          {/* Toggles */}
          <div className="pt-2 border-t border-[var(--dk-separator)] space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium text-foreground block">Search immediately</span>
                <span className="text-[11px] text-muted-foreground">Start searching for releases upon adding</span>
              </div>
              <DkSwitch checked={searchNow} onCheckedChange={setSearchNow} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium text-foreground block">Monitor</span>
                <span className="text-[11px] text-muted-foreground">Monitor for new episodes or quality upgrades</span>
              </div>
              <DkSwitch checked={monitored} onCheckedChange={setMonitored} />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <DkButton
            variant="ghost"
            onClick={onClose}
            disabled={submitting}
            className="text-muted-foreground hover:text-foreground"
          >
            Cancel
          </DkButton>
          {isDownloaded ? (
            <DkButton
              variant="secondary"
              disabled
              className="px-5 opacity-60 cursor-not-allowed"
            >
              Already Available
            </DkButton>
          ) : isRequested ? (
            <DkButton
              variant="secondary"
              disabled
              className="px-5 opacity-60 cursor-not-allowed"
            >
              Already Requested
            </DkButton>
          ) : (
            <DkButton
              variant="primary"
              onClick={handleConfirm}
              loading={submitting || isChecking}
              disabled={submitting}
              className="px-5 shadow-lg shadow-primary/20"
            >
              Confirm Request
            </DkButton>
          )}
        </div>
      </div>
    </DkDialog>
  )
};
