import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  BookmarkCheck,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Film,
  FolderOpen,
  HardDrive,
  Layers,
  Loader2,
  Play,
  Radio,
  Search,
  Server,
  SlidersHorizontal,
  Sparkles,
  Tv,
} from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { DkDropdown, type DkDropdownOption } from '@ui/atoms/dropdown'
import { DkSwitch } from '@ui/atoms/switch'
import { showToast } from '@ui/molecules/toast'
import { cn } from '@/lib/utils'
import {
  useSaveServerRadarrConfig,
  useSaveServerSonarrConfig,
  useServerRadarrConfig,
  useServerRadarrQualityProfiles,
  useServerRadarrRootFolders,
  useServerSonarrConfig,
  useServerSonarrQualityProfiles,
  useServerSonarrRootFolders,
} from '@/features/downloads/use-server-arr'
import { useCreateMediaRequest } from '@/features/downloads/use-media-requests'
import type { RequestMediaState } from '../../hooks/use-request-media'
import { parseServerArrInstanceId } from '../../hooks/arr-detail-status'
import {
  formatStorageFree,
  isStorageCriticallyLow,
  pickBestRootFolder,
} from '../../utils/request'

export interface MediaRequestConfirmModalProps {
  open?: boolean
  onClose: () => void
  state: RequestMediaState
  initialInstanceId?: string
  onWatch?: () => void
}

export const MediaRequestConfirmModal = ({
  open = true,
  onClose,
  state,
  initialInstanceId,
  onWatch,
}: MediaRequestConfirmModalProps) => {
  const navigate = useNavigate()
  const isMovie = state.mediaType === 'movie'
  const serviceLabel = isMovie ? 'Radarr' : 'Sonarr'
  const mediaTypeLabel = isMovie ? 'Movie · Radarr' : 'TV Series · Sonarr'
  const { refetchStatus } = state

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
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [requestSuccess, setRequestSuccess] = useState(false)
  const [savingDefault, setSavingDefault] = useState(false)
  const [defaultSaved, setDefaultSaved] = useState(false)
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Live double-check status on target instances when modal opens
  useEffect(() => {
    if (open) {
      void refetchStatus?.()
    }
  }, [open, refetchStatus])

  // Clear auto-close timer on unmount
  useEffect(() => {
    return () => {
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current)
      }
    }
  }, [])

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

  const saveRadarr = useSaveServerRadarrConfig(targetServerId)
  const saveSonarr = useSaveServerSonarrConfig(targetServerId)
  const createMediaRequest = useCreateMediaRequest()

  // Fetch quality profiles
  const sonarrProfilesQuery = useServerSonarrQualityProfiles(targetServerId, parsed.arrInstanceId, {
    enabled: open && !isMovie,
  })
  const radarrProfilesQuery = useServerRadarrQualityProfiles(targetServerId, parsed.arrInstanceId, {
    enabled: open && isMovie,
  })
  const profiles = useMemo(
    () => (isMovie ? radarrProfilesQuery.data : sonarrProfilesQuery.data) || [],
    [isMovie, radarrProfilesQuery.data, sonarrProfilesQuery.data],
  )
  const loadingProfiles = isMovie ? radarrProfilesQuery.isLoading : sonarrProfilesQuery.isLoading

  // Fetch root folders
  const sonarrFoldersQuery = useServerSonarrRootFolders(targetServerId, parsed.arrInstanceId, {
    enabled: open && !isMovie,
  })
  const radarrFoldersQuery = useServerRadarrRootFolders(targetServerId, parsed.arrInstanceId, {
    enabled: open && isMovie,
  })
  const rootFolders = useMemo(
    () => (isMovie ? radarrFoldersQuery.data : sonarrFoldersQuery.data) || [],
    [isMovie, radarrFoldersQuery.data, sonarrFoldersQuery.data],
  )
  const loadingFolders = isMovie ? radarrFoldersQuery.isLoading : sonarrFoldersQuery.isLoading

  const configuredProfileId = config?.quality_profile_id ?? config?.qualityProfileId
  const configuredRootPath = config?.root_folder_path ?? config?.rootFolderPath

  // Synchronize default quality profile
  useEffect(() => {
    if (!open || profiles.length === 0) return
    const exists = profiles.some((p) => String(p.id) === String(configuredProfileId))
    setQualityProfileId((prev) => {
      const prevExists = profiles.some((p) => String(p.id) === prev)
      if (prev && prevExists) return prev
      if (configuredProfileId && exists) return String(configuredProfileId)
      return String(profiles[0].id)
    })
  }, [open, profiles, configuredProfileId])

  // Synchronize default root folder using smart free-space picker
  useEffect(() => {
    if (!open || rootFolders.length === 0) return
    const bestFolder = pickBestRootFolder(rootFolders, configuredRootPath)
    if (bestFolder) {
      setRootFolderPath((prev) => {
        const exists = rootFolders.some((rf) => rf.path === prev)
        if (prev && exists) return prev
        return bestFolder.path
      })
    }
  }, [open, rootFolders, configuredRootPath])

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
      rootFolders.map((rf) => ({
        value: rf.path,
        label: `${rf.path} (${formatStorageFree(rf)})`,
      })),
    [rootFolders],
  )

  const selectedInstance = currentInstance || targets.find((item) => item.id === selectedInstanceId) || targets[0]
  const selectedProfile = profiles.find((p) => String(p.id) === qualityProfileId)
  const selectedFolder = rootFolders.find((rf) => rf.path === rootFolderPath)
  const isStorageLow = isStorageCriticallyLow(selectedFolder)

  // Detect whether the user altered profile or root folder from server default config
  const isProfileChanged = Boolean(
    configuredProfileId &&
    qualityProfileId &&
    String(configuredProfileId) !== String(qualityProfileId),
  )
  const isFolderChanged = Boolean(
    configuredRootPath &&
    rootFolderPath &&
    configuredRootPath !== rootFolderPath,
  )
  const isPresetChanged = isProfileChanged || isFolderChanged

  const handleSaveAsDefault = async () => {
    if (!targetServerId) return
    setSavingDefault(true)
    try {
      const updatePayload: Record<string, unknown> = {
        ...(config || {}),
        quality_profile_id: qualityProfileId ? Number(qualityProfileId) : undefined,
        root_folder_path: rootFolderPath || undefined,
      }
      if (isMovie) {
        await saveRadarr.mutateAsync(updatePayload)
      } else {
        await saveSonarr.mutateAsync(updatePayload)
      }
      setDefaultSaved(true)
      showToast({
        title: 'New default saved',
        description: `Saved as your default ${serviceLabel} preset.`,
        variant: 'success',
      })
    } catch (err) {
      showToast({
        title: 'Failed to save default',
        description: err instanceof Error ? err.message : 'Could not update default preset',
        variant: 'error',
      })
    } finally {
      setSavingDefault(false)
    }
  }

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
      try {
        await createMediaRequest.mutateAsync({
          serverId: targetServerId,
          service: isMovie ? 'radarr' : 'sonarr',
          mediaType: state.mediaType,
          title: state.mediaTitle,
          year: state.mediaYear,
          posterUrl: state.posterUrl || undefined,
          instanceId: parsed.arrInstanceId || undefined,
          instanceName: selectedInstance?.name || undefined,
          qualityProfileName: selectedProfile?.name || undefined,
          rootFolderPath: rootFolderPath || undefined,
          searchNow,
          monitored,
        })
      } catch {
        // Backend also automatically records request via Radarr/Sonarr endpoint
      }
      setRequestSuccess(true)
      showToast({
        title: `${state.requestLabel.replace('Request ', '')} requested`,
        description: `Sent to ${selectedInstance?.name || state.activeServerName}`,
        variant: 'success',
      })
      autoCloseTimerRef.current = setTimeout(() => {
        onClose()
      }, 2500)
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

  const handleGoToDownloads = () => {
    if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current)
    onClose()
    void navigate({ to: '/downloads', search: { tab: 'requests' } as any })
  }

  const handleWatchNow = () => {
    onClose()
    if (onWatch) {
      onWatch()
    }
  }

  return (
    <DkDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !submitting) onClose()
      }}
      className="relative max-w-md sm:max-w-lg !p-0 border-none shadow-2xl bg-[var(--dk-surface-base)] overflow-hidden rounded-3xl"
    >
      <div className="relative flex min-h-[460px] flex-col overflow-hidden">
        {/* Full-bleed Modal Background with Crisp Artwork (Reduced Blur) */}
        {state.posterUrl && (
          <div
            className="absolute inset-0 bg-cover bg-center scale-105 filter blur-[3px] opacity-75 pointer-events-none transition-all duration-700"
            style={{ backgroundImage: `url(${state.posterUrl})` }}
            aria-hidden="true"
          />
        )}
        {/* Balanced Vignette Gradients for Text Contrast */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/45 to-black/85 pointer-events-none" />
        <div className="absolute inset-0 bg-[var(--dk-surface-base)]/25 pointer-events-none" />

        {/* Content Layer */}
        <div className="relative z-10 flex flex-1 flex-col p-6 sm:p-7 space-y-4">
          {/* Header Row: Elevated Poster & Title */}
          <div className="flex items-start gap-4 pr-8">
            {state.posterUrl ? (
              <img
                src={state.posterUrl}
                alt={state.mediaTitle}
                className="h-24 w-16 shrink-0 rounded-2xl object-cover shadow-2xl ring-1 ring-white/[0.20] transition-transform duration-300 hover:scale-105"
              />
            ) : (
              <div className="flex h-24 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/[0.10] text-muted-foreground shadow-2xl ring-1 ring-white/[0.20]">
                {isMovie ? <Film className="h-7 w-7 text-primary" /> : <Tv className="h-7 w-7 text-primary" />}
              </div>
            )}
            <div className="min-w-0 flex-1 pt-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-primary block leading-none mb-1.5">
                Confirm Request: {state.mediaTitle || 'Media'}
              </span>
              <h3 className="truncate font-bold text-foreground text-lg sm:text-xl tracking-tight leading-snug">
                {state.mediaTitle || 'Unknown title'}
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {state.mediaYear && (
                  <span className="font-medium text-foreground/90">{state.mediaYear}</span>
                )}
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.12] px-2.5 py-0.5 text-[11px] font-medium text-foreground backdrop-blur-md">
                  {isMovie ? <Film className="h-3 w-3 text-primary" /> : <Tv className="h-3 w-3 text-primary" />}
                  {mediaTypeLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Body Content */}
          {requestSuccess ? (
            /* Smooth Success Pod */
            <div className="my-auto rounded-2xl bg-white/[0.08] p-6 text-center space-y-3.5 shadow-xl backdrop-blur-2xl ring-1 ring-white/[0.08] animate-in fade-in zoom-in-95 duration-200">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/25 text-primary shadow-inner">
                <Check className="h-6 w-6 stroke-[2.5]" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold text-foreground text-base">Request Sent Successfully</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Sent to <span className="font-medium text-foreground">{selectedInstance?.name || state.activeServerName}</span>.
                  {searchNow ? ' Searching releases immediately.' : ' Monitored for upcoming releases.'}
                </p>
              </div>
              <div className="flex items-center justify-center gap-2.5 pt-2">
                <DkButton
                  variant="ghost"
                  onClick={onClose}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Done
                </DkButton>
                <DkButton
                  variant="primary"
                  onClick={handleGoToDownloads}
                  className="text-xs px-4 inline-flex items-center gap-1.5 shadow-md shadow-primary/20"
                >
                  <span>View in Downloads</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </DkButton>
              </div>
            </div>
          ) : (
            <div className="space-y-3.5 flex-1 flex flex-col justify-between">
              <div className="space-y-3">
                {/* Status Alerts */}
                {isDownloaded && (
                  <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.08] p-3.5 text-xs shadow-md backdrop-blur-2xl ring-1 ring-white/[0.08]">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <Check className="h-4 w-4 shrink-0 text-primary mt-0.5 stroke-[2.5]" />
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">Available in Library</p>
                        <p className="text-muted-foreground mt-0.5">
                          This {isMovie ? 'movie' : 'show'} is already downloaded on{' '}
                          <span className="text-foreground font-medium">
                            {selectedInstance?.name || state.activeServerName}
                          </span>.
                        </p>
                      </div>
                    </div>
                    {onWatch && (
                      <DkButton
                        variant="primary"
                        onClick={handleWatchNow}
                        className="shrink-0 h-8 px-3.5 text-xs inline-flex items-center gap-1.5 shadow-md shadow-primary/20"
                      >
                        <Play className="h-3 w-3 fill-current" />
                        <span>Watch Now</span>
                      </DkButton>
                    )}
                  </div>
                )}

                {isRequested && (
                  <div className="space-y-2.5 rounded-2xl bg-white/[0.08] p-3.5 text-xs shadow-md backdrop-blur-2xl ring-1 ring-white/[0.08]">
                    <div className="flex items-start gap-2.5">
                      <Download className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-foreground">Already Requested</p>
                        <p className="text-muted-foreground mt-0.5">
                          This {isMovie ? 'movie' : 'show'} is already requested and monitored on{' '}
                          <span className="text-foreground font-medium">
                            {selectedInstance?.name || state.activeServerName}
                          </span>.
                        </p>
                      </div>
                    </div>

                    {/* Active Queue Progress Bar if present */}
                    {state.queueItem && (
                      <div className="pt-1.5 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span className="capitalize">{state.queueItem.status || 'Downloading'}</span>
                          <span className="font-semibold text-foreground">
                            {Math.round(state.queuePercent)}%
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.12]">
                          <div
                            className="h-full bg-primary transition-all duration-300 rounded-full"
                            style={{ width: `${Math.min(100, Math.max(0, state.queuePercent))}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Primary Configuration Pod */}
                <div className="space-y-3 rounded-2xl bg-white/[0.08] p-4 text-xs shadow-lg backdrop-blur-2xl ring-1 ring-white/[0.08]">
                  {/* Destination Instance Row */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 text-muted-foreground min-w-0">
                      <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/[0.10] text-primary">
                        <Server className="h-3.5 w-3.5" />
                      </span>
                      <span className="font-medium text-foreground">Destination</span>
                    </div>
                    {instanceOptions.length > 1 ? (
                      <div className="w-52">
                        <DkDropdown
                          options={instanceOptions}
                          value={selectedInstanceId}
                          onChange={setSelectedInstanceId}
                          placeholder="Select instance..."
                          className="w-full text-xs"
                        />
                      </div>
                    ) : (
                      <span className="truncate font-semibold text-foreground bg-white/[0.10] px-3 py-1.5 rounded-xl">
                        {selectedInstance?.name || state.activeServerName}
                      </span>
                    )}
                  </div>

                  {/* Quality Profile Row */}
                  <div className="flex items-center justify-between gap-3 pt-0.5">
                    <div className="flex items-center gap-2.5 text-muted-foreground">
                      <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/[0.10] text-primary">
                        <Layers className="h-3.5 w-3.5" />
                      </span>
                      <span className="font-medium text-foreground">Quality Profile</span>
                    </div>
                    {loadingProfiles ? (
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground text-[11px] bg-white/[0.10] px-2.5 py-1 rounded-xl">
                        <Loader2 className="h-3 w-3 animate-spin text-primary" />
                        <span>Loading profiles…</span>
                      </span>
                    ) : qualityProfileOptions.length > 1 ? (
                      <div className="w-52">
                        <DkDropdown
                          options={qualityProfileOptions}
                          value={qualityProfileId}
                          onChange={(val) => {
                            setQualityProfileId(val)
                            setDefaultSaved(false)
                          }}
                          placeholder="Select quality profile..."
                          className="w-full text-xs"
                        />
                      </div>
                    ) : (
                      <span className="font-semibold text-foreground bg-white/[0.10] px-3 py-1.5 rounded-xl">
                        {selectedProfile?.name || 'Default Profile'}
                      </span>
                    )}
                  </div>

                  {/* Storage Row */}
                  <div className="flex items-center justify-between gap-3 pt-0.5">
                    <div className="flex items-center gap-2.5 text-muted-foreground min-w-0">
                      <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/[0.10] text-primary">
                        <HardDrive className="h-3.5 w-3.5" />
                      </span>
                      <span className="font-medium text-foreground">Storage</span>
                    </div>
                    {loadingFolders ? (
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground text-[11px] bg-white/[0.10] px-2.5 py-1 rounded-xl">
                        <Loader2 className="h-3 w-3 animate-spin text-primary" />
                        <span>Checking space…</span>
                      </span>
                    ) : (
                      <div className="flex items-center gap-2 text-right min-w-0">
                        <span className="truncate max-w-[130px] text-muted-foreground text-[11px] font-mono">
                          {rootFolderPath || 'Default'}
                        </span>
                        <span
                          className={cn(
                            'rounded-xl px-2.5 py-1 text-[11px] font-semibold transition-colors',
                            isStorageLow
                              ? 'bg-primary/25 text-primary'
                              : 'bg-white/[0.10] text-foreground',
                          )}
                        >
                          {formatStorageFree(selectedFolder)}
                        </span>
                      </div>
                    )}
                  </div>

                  {isStorageLow && (
                    <div className="flex items-center gap-1.5 text-[11px] text-primary pt-1">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>Low storage space on this destination volume.</span>
                    </div>
                  )}

                  {/* Set as New Default Preset Button if Changed */}
                  {isPresetChanged && (
                    <div className="pt-2.5 border-t border-white/[0.06] flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">
                        Custom preset active
                      </span>
                      {defaultSaved ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary">
                          <BookmarkCheck className="h-3.5 w-3.5" />
                          <span>Saved as default</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={handleSaveAsDefault}
                          disabled={savingDefault}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-white/[0.10] hover:bg-white/[0.16] px-3 py-1.5 text-[11px] font-medium text-foreground transition-all cursor-pointer disabled:opacity-50"
                        >
                          {savingDefault ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                          ) : (
                            <Sparkles className="h-3.5 w-3.5 text-primary" />
                          )}
                          <span>Set as new default</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Advanced Options Accordion - Cohesive UI/UX & Typography */}
                <div className="rounded-2xl bg-white/[0.08] overflow-hidden shadow-lg backdrop-blur-2xl ring-1 ring-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((v) => !v)}
                    className="flex w-full items-center justify-between p-3.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/[0.10] text-primary">
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                      </span>
                      <span className="font-medium text-foreground">Advanced Options</span>
                    </div>
                    {showAdvanced ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>

                  {showAdvanced && (
                    <div className="p-4 pt-2 space-y-3.5 text-xs border-t border-white/[0.06]">
                      {/* Custom Root Folder Row */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 text-muted-foreground min-w-0">
                          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/[0.10] text-primary">
                            <FolderOpen className="h-3.5 w-3.5" />
                          </span>
                          <span className="font-medium text-foreground">Custom Root Folder</span>
                        </div>
                        {loadingFolders ? (
                          <span className="inline-flex items-center gap-1.5 text-muted-foreground text-[11px] bg-white/[0.10] px-2.5 py-1 rounded-xl">
                            <Loader2 className="h-3 w-3 animate-spin text-primary" />
                            <span>Loading folders…</span>
                          </span>
                        ) : rootFolderOptions.length > 0 ? (
                          <div className="w-52">
                            <DkDropdown
                              options={rootFolderOptions}
                              value={rootFolderPath}
                              onChange={(path) => {
                                setRootFolderPath(path)
                                setDefaultSaved(false)
                              }}
                              placeholder="Select root folder..."
                              className="w-full text-xs"
                            />
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-[11px] bg-white/[0.10] px-3 py-1.5 rounded-xl">
                            Default directory
                          </span>
                        )}
                      </div>

                      {/* Search Immediately Toggle Row */}
                      <div className="flex items-center justify-between gap-3 pt-0.5">
                        <div className="flex items-center gap-2.5 text-muted-foreground min-w-0">
                          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/[0.10] text-primary">
                            <Search className="h-3.5 w-3.5" />
                          </span>
                          <div className="min-w-0">
                            <span className="font-medium text-foreground block leading-tight">Search immediately</span>
                            <span className="text-[11px] text-muted-foreground leading-tight">
                              Search indexers upon adding
                            </span>
                          </div>
                        </div>
                        <DkSwitch checked={searchNow} onCheckedChange={setSearchNow} />
                      </div>

                      {/* Monitored Toggle Row */}
                      <div className="flex items-center justify-between gap-3 pt-0.5">
                        <div className="flex items-center gap-2.5 text-muted-foreground min-w-0">
                          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/[0.10] text-primary">
                            <Radio className="h-3.5 w-3.5" />
                          </span>
                          <div className="min-w-0">
                            <span className="font-medium text-foreground block leading-tight">Monitored</span>
                            <span className="text-[11px] text-muted-foreground leading-tight">
                              Track releases & quality upgrades
                            </span>
                          </div>
                        </div>
                        <DkSwitch checked={monitored} onCheckedChange={setMonitored} />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <DkButton
                  variant="ghost"
                  onClick={onClose}
                  disabled={submitting}
                  className="text-muted-foreground hover:text-foreground text-xs"
                >
                  Cancel
                </DkButton>
                {isDownloaded ? (
                  <DkButton
                    variant="secondary"
                    disabled
                    className="px-5 opacity-60 cursor-not-allowed text-xs"
                  >
                    Already Available
                  </DkButton>
                ) : isRequested ? (
                  <DkButton
                    variant="secondary"
                    disabled
                    className="px-5 opacity-60 cursor-not-allowed text-xs"
                  >
                    Already Requested
                  </DkButton>
                ) : (
                  <DkButton
                    variant="primary"
                    onClick={handleConfirm}
                    loading={submitting || isChecking}
                    disabled={submitting}
                    className="px-5 shadow-lg shadow-primary/25 text-xs font-semibold"
                  >
                    Confirm Request
                  </DkButton>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </DkDialog>
  )
}
