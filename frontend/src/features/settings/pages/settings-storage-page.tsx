import { useState, type ComponentType } from 'react'
import { Helmet } from 'react-helmet-async'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/lib/providers/auth'
import { apiClient } from '@/lib/api/client'
import { formatBytes } from '@/lib/utils'
import { DkCheckbox } from '@ui/atoms/checkbox'
import { DkInput } from '@ui/atoms/input'
import { DkSelect } from '@ui/atoms/select'
import { DkSwitch } from '@ui/atoms/switch'
import { DkDialog } from '@ui/molecules/dialog'
import { useToast } from '@ui/molecules/toast'
import {
  AlertTriangle,
  Download,
  FolderOpen,
  Gauge,
  HardDrive,
  Image,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import {
  PlexStorageOptimizerModal,
  usePlexStorageSummary,
} from '@/features/integrations/plex-storage'
import {
  ASSET_TYPE_OPTIONS,
  type ArtworkSettingsPatch,
  mediaAdminQueryKeys,
  useArtworkSettings,
  useMirroring,
  usePurgeAssets,
  useSetArtworkSettings,
  useSetMirroring,
} from '@/features/media/hooks/use-media-admin-settings'
import { SectionHeader } from '../components/molecules/settings-section-header'
import { SettingsCard } from '../components/molecules/settings-card'
import { SettingsRow } from '../components/molecules/settings-row'
import { SettingsLockedState } from '../components/molecules/settings-locked-state'

interface StorageStats {
  mediaDir: string
  downloadedCount: number
  downloadedBytes: number
  disk: { total: number; used: number; free: number }
}

const Metric = ({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  value: string
  hint?: string
}) => {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">{label}</p>
        <p className="text-lg font-bold text-white tabular-nums leading-tight">{value}</p>
        {hint && <p className="text-[11px] text-white/40 mt-0.5">{hint}</p>}
      </div>
    </div>
  )
};

const SWEEP_INTERVAL_OPTIONS = [
  { value: '1', label: 'Every 1 minute' },
  { value: '5', label: 'Every 5 minutes' },
  { value: '10', label: 'Every 10 minutes' },
  { value: '15', label: 'Every 15 minutes' },
  { value: '30', label: 'Every 30 minutes' },
  { value: '60', label: 'Every hour' },
]

const ToggleRow = ({
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  title: string
  description: string
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
}) => {
  return (
    <SettingsRow
      label={title}
      description={description}
      disabled={disabled}
      action={<DkSwitch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />}
    />
  )
};

const SubHeading = ({ title, description }: { title: string; description?: string }) => {
  return <SectionHeader title={title} description={description} />
};

/** Auto-mirror sub-settings: fetch/discover/local-game triggers, sweep rate,
 * artwork types, and download guardrails (max-storage budget + disk cap).
 * Grayed out while the master mirroring switch (owned by SettingsStoragePage)
 * is off. */
const AutoMirrorControls = ({ masterEnabled }: { masterEnabled: boolean }) => {
  const { toast } = useToast()
  const { data: settings, isLoading } = useArtworkSettings()
  const setSettings = useSetArtworkSettings()
  // Local edit drafts for the number fields; null means "show the server value".
  // Nothing is synced in an effect — a successful commit resets the draft back
  // to null so the field re-binds to the acknowledged server number.
  const [sweepDraft, setSweepDraft] = useState<string | null>(null)
  const [capDraft, setCapDraft] = useState<string | null>(null)
  const [budgetDraft, setBudgetDraft] = useState<string | null>(null)
  const off = !masterEnabled || setSettings.isPending

  const commit = async (patch: ArtworkSettingsPatch): Promise<boolean> => {
    try {
      await setSettings.mutateAsync(patch)
      toast({ title: 'Artwork settings updated', variant: 'success' })
      return true
    } catch {
      toast({ title: 'Could not update artwork settings', variant: 'error' })
      return false
    }
  }

  if (isLoading) {
    return (
      <SettingsCard tone="raised" className="flex items-center justify-center gap-3 py-10 text-white/50">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">Loading artwork settings…</span>
      </SettingsCard>
    )
  }
  if (!settings) return null

  const mirror = settings.mirrored

  const toggleType = (value: string, checked: boolean) => {
    const next = checked
      ? [...settings.assetTypes, value]
      : settings.assetTypes.filter((t) => t !== value)
    if (next.length === 0) return
    commit({ assetTypes: next })
  }

  const sweepValue = sweepDraft ?? String(settings.sweepLimit)
  const capValue = capDraft ?? String(settings.minFreeGb)
  const budgetValue = budgetDraft ?? String(mirror.maxGb)

  const commitSweep = async (raw: string) => {
    const parsed = Number.parseInt(raw, 10)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed === settings.sweepLimit) {
      setSweepDraft(null)
      return
    }
    if (await commit({ sweepLimit: parsed })) setSweepDraft(null)
  }

  const commitCap = async (raw: string) => {
    const parsed = Number.parseInt(raw, 10)
    if (!Number.isInteger(parsed) || parsed < 0 || parsed === settings.minFreeGb) {
      setCapDraft(null)
      return
    }
    if (await commit({ minFreeGb: parsed })) setCapDraft(null)
  }

  const commitBudget = async (raw: string) => {
    const parsed = Number.parseInt(raw, 10)
    if (!Number.isInteger(parsed) || parsed < 0 || parsed === mirror.maxGb) {
      setBudgetDraft(null)
      return
    }
    if (await commit({ maxGb: parsed })) setBudgetDraft(null)
  }

  const capPaused = settings.disk.tripped
  const capBytes = mirror.maxGb * 1024 ** 3
  const budgetPct =
    mirror.maxGb > 0 ? Math.min(100, (mirror.bytes / capBytes) * 100) : null
  const overBudget = mirror.maxGb > 0 && mirror.overBudget

  return (
    <>
      <SettingsCard tone="raised">
        <SectionHeader
          icon={Download}
          title="Automatic downloads"
          description="Mirror provider artwork to this server automatically. Each trigger is independent; the master switch above pauses everything."
        />
        <div className="mt-4 space-y-1">
          <ToggleRow
            title="After a single-title fetch"
            description="When a title is fetched on demand (not a bulk catalog backfill), download its selected artwork right away."
            checked={settings.fetchEnabled}
            disabled={off}
            onCheckedChange={(v) => commit({ fetchEnabled: v })}
          />
          <ToggleRow
            title="Discover sweep"
            description="Periodically scan the catalog for popular titles still missing a local copy and download them."
            checked={settings.discoverEnabled}
            disabled={off}
            onCheckedChange={(v) => commit({ discoverEnabled: v })}
          />
          <ToggleRow
            title="Claimed local games"
            description="When you claim an installed game, download its artwork so the library has it locally."
            checked={settings.localGamesEnabled}
            disabled={off}
            onCheckedChange={(v) => commit({ localGamesEnabled: v })}
          />
          <div className="grid gap-4 pt-3 sm:grid-cols-2">
            <DkInput
              label="Sweep limit (per run)"
              type="number"
              min={1}
              disabled={off}
              value={sweepValue}
              onChange={(e) => setSweepDraft(e.target.value)}
              onBlur={(e) => commitSweep(e.target.value)}
            />
            <DkSelect
              label="Sweep interval"
              disabled={off}
              value={String(settings.sweepIntervalMinutes)}
              onChange={(e) =>
                commit({
                  sweepIntervalMinutes: Number.parseInt(e.target.value, 10),
                })
              }
            >
              {SWEEP_INTERVAL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </DkSelect>
          </div>
        </div>

        <div className="mt-5 pt-5">
          <SubHeading
            title="Artwork types"
            description="Which artwork a downloaded title gets. Already-downloaded files are kept even if a type is unchecked."
          />
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {ASSET_TYPE_OPTIONS.map((option) => (
              <DkCheckbox
                key={option.value}
                label={option.label}
                checked={settings.assetTypes.includes(option.value)}
                disabled={off}
                onCheckedChange={(checked) => toggleType(option.value, Boolean(checked))}
              />
            ))}
          </div>
        </div>
      </SettingsCard>

      <SettingsCard tone="raised">
        <SectionHeader
          icon={Gauge}
          title="Download guardrails"
          description="Bounds on how much artwork is stored and how full the disk may get. Over the storage budget the least-used images are replaced to make room for new media."
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <DkInput
            label="Maximum artwork storage (GB)"
            type="number"
            min={0}
            disabled={off}
            value={budgetValue}
            onChange={(e) => setBudgetDraft(e.target.value)}
            onBlur={(e) => commitBudget(e.target.value)}
            hint="0 stores every download. Above the budget, images served least often are removed first to make room — admin-kept and pinned picks are never removed."
          />
          <DkInput
            label="Minimum free space (GB)"
            type="number"
            min={0}
            disabled={off}
            value={capValue}
            onChange={(e) => setCapDraft(e.target.value)}
            onBlur={(e) => commitCap(e.target.value)}
            hint="0 disables the cap."
          />
        </div>

        {budgetPct !== null && (
          <div className="mt-4 rounded-xl bg-white/[0.03] p-4 ring-1 ring-inset ring-white/[0.05]">
            <div className="mb-2 flex items-center justify-between text-[11px]">
              <span className="font-semibold uppercase tracking-widest text-white/50">
                Artwork budget
              </span>
              <span className="text-white/50 tabular-nums">
                {formatBytes(mirror.bytes)} of {formatBytes(capBytes)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${budgetPct}%`,
                  backgroundColor:
                    overBudget || budgetPct > 95
                      ? 'var(--dk-danger, #ef4444)'
                      : 'var(--primary)',
                }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-white/40 tabular-nums">
              {formatBytes(mirror.bytes)} stored · {mirror.count} image
              {mirror.count === 1 ? '' : 's'} downloaded
            </p>
          </div>
        )}

        {overBudget && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-amber-400/10 px-3.5 py-3 text-xs leading-relaxed text-amber-300/90">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Stored artwork is over its {mirror.maxGb} GB budget. New auto-downloads replace the
              least-used images to get back under — raise the cap or remove admin-kept artwork if
              you'd rather not.
            </p>
          </div>
        )}

        {capPaused && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-amber-400/10 px-3.5 py-3 text-xs leading-relaxed text-amber-300/90">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Downloads are paused — only {formatBytes(settings.disk.free)} free, below your{' '}
              {settings.minFreeGb} GB cap. Free up space or raise the cap to resume.
            </p>
          </div>
        )}
      </SettingsCard>
    </>
  )
};

export const SettingsStoragePage = () => {
  const { isAuthenticated, user } = useAuth()
  const admin = Boolean(user?.isAdmin)
  const { toast } = useToast()
  const { data, isLoading, error } = useQuery<StorageStats>({
    queryKey: mediaAdminQueryKeys.storage,
    queryFn: async () => {
      const { data } = await apiClient.get<StorageStats>('/media/admin/storage')
      return data
    },
    staleTime: 15_000,
    enabled: admin,
  })
  const mirroring = useMirroring(admin)
  const setMirroring = useSetMirroring()
  const purge = usePurgeAssets()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [plexOptimizerOpen, setPlexOptimizerOpen] = useState(false)
  const { data: plexStorage } = usePlexStorageSummary(null, { enabled: admin })

  if (!isAuthenticated || !user) {
    return (
      <SettingsLockedState
        title="Sign in to view storage"
        description="Downloaded-library usage is only visible to signed-in admins."
        icon={ShieldCheck}
      />
    )
  }
  if (!user.isAdmin) {
    return (
      <SettingsLockedState
        title="Admin access required"
        description="Only server admins can inspect the locally downloaded media library and disk usage."
        icon={ShieldAlert}
        action={<span />}
      />
    )
  }

  const disk = data?.disk
  const usedPct = disk && disk.total > 0 ? Math.min(100, (disk.used / disk.total) * 100) : 0
  const mirroringEnabled = mirroring.data?.enabled ?? true

  const toggleMirroring = async (next: boolean) => {
    try {
      const state = await setMirroring.mutateAsync(next)
      toast({
        title: state.enabled ? 'Mirroring enabled' : 'Mirroring paused',
        description: state.enabled
          ? 'New artwork downloads will store a local copy on this server.'
          : 'New downloads are paused. Already-downloaded artwork still serves until you delete it.',
        variant: 'success',
      })
    } catch {
      toast({ title: 'Could not update mirroring', variant: 'error' })
    }
  }

  const deleteAllDownloaded = async () => {
    setConfirmOpen(false)
    try {
      const result = await purge.mutateAsync()
      toast({
        title: 'Downloaded artwork deleted',
        description: `Removed ${result.deleted} file${result.deleted === 1 ? '' : 's'} · ${formatBytes(result.bytesFreed)} freed`,
        variant: 'success',
      })
    } catch {
      toast({ title: 'Delete failed', description: 'Could not remove downloaded artwork.', variant: 'error' })
    }
  }

  return (
    <div id="settings-storage-section" className="space-y-5">
      <Helmet>
        <title>Storage - Otix</title>
      </Helmet>

      <SectionHeader
        variant="page"
        icon={HardDrive}
        title="Storage"
        description="Locally downloaded artwork and disk usage on the Otix backend."
      />

      {isLoading && (
        <SettingsCard tone="raised" className="flex items-center justify-center gap-3 py-14 text-white/50">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading storage usage…</span>
        </SettingsCard>
      )}

      {error && (
        <SettingsCard tone="raised" className="text-sm text-red-400/90 bg-red-400/5 py-6 text-center">
          Could not load storage usage. The media admin API may be unreachable.
        </SettingsCard>
      )}

      {data && !isLoading && (
        <>
          <SettingsCard tone="raised">
            <SectionHeader
              icon={Download}
              title="Download artwork to this server"
              description="Store a local copy of posters, backdrops, logos and icons so the catalog serves them from this backend instead of provider URLs."
              action={
                mirroring.isSuccess ? (
                  <DkSwitch
                    checked={mirroringEnabled}
                    onCheckedChange={toggleMirroring}
                    disabled={setMirroring.isPending}
                  />
                ) : (
                  <div className="flex items-center gap-2 text-xs text-white/40">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading…
                  </div>
                )
              }
            />
            {mirroring.isSuccess && !mirroringEnabled && (
              <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-amber-400/10 px-3.5 py-3 text-xs leading-relaxed text-amber-300/90">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Mirroring is paused. The{' '}
                  <span className="font-semibold text-amber-200">Download Images</span> action on
                  media is blocked until you turn this back on. Artwork already downloaded keeps
                  being served from this server.
                </p>
              </div>
            )}

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Metric
                icon={Image}
                label="Downloaded artwork"
                value={`${data.downloadedCount} image${data.downloadedCount === 1 ? '' : 's'}`}
                hint={`${formatBytes(data.downloadedBytes)} on disk`}
              />
              <Metric
                icon={HardDrive}
                label="Filesystem"
                value={formatBytes(disk?.total ?? 0)}
                hint={`${formatBytes(disk?.free ?? 0)} free of ${formatBytes(disk?.total ?? 0)}`}
              />
            </div>

            <div className="mt-5 pt-5">
              <div className="mb-2 flex items-center justify-between text-[11px] text-white/50">
                <span className="font-semibold uppercase tracking-widest">Volume usage</span>
                <span className="tabular-nums">
                  {formatBytes(disk?.used ?? 0)} used · {formatBytes(disk?.free ?? 0)} free
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${usedPct}%`,
                    backgroundColor: usedPct > 85 ? 'var(--dk-danger, #ef4444)' : 'var(--primary)',
                  }}
                />
              </div>
            </div>

            <div className="mt-5 flex items-center gap-2.5 text-white/60">
              <FolderOpen className="h-4 w-4 shrink-0" />
              <p className="text-xs">
                Downloaded files live at{' '}
                <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-white/80">
                  {data.mediaDir}
                </code>
              </p>
            </div>

            <div className="mt-5 flex flex-col gap-4 rounded-xl bg-red-500/[0.06] px-4 py-3.5 ring-1 ring-inset ring-red-500/20 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-400/10 text-red-400">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Delete downloaded artwork</h4>
                  <p className="text-xs text-white/40">
                    {data.downloadedCount > 0
                      ? `${data.downloadedCount} image${data.downloadedCount === 1 ? '' : 's'} · ${formatBytes(data.downloadedBytes)} on disk`
                      : 'Nothing downloaded to delete'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={purge.isPending || data.downloadedCount === 0}
                onClick={() => setConfirmOpen(true)}
                className="inline-flex items-center justify-center gap-2 self-start rounded-xl bg-red-500/15 px-4 py-2 text-xs font-semibold text-red-300 ring-1 ring-inset ring-red-500/30 transition-all hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-40 sm:self-auto"
              >
                <Trash2 className="h-4 w-4" />
                {purge.isPending ? 'Deleting…' : 'Delete all'}
              </button>
            </div>
          </SettingsCard>

          <AutoMirrorControls masterEnabled={mirroringEnabled} />

          <SettingsCard tone="raised">
            <SectionHeader
              icon={HardDrive}
              title="Plex Media Servers Storage"
              description="Analyze connected Plex servers to find duplicate versions, legacy codecs suitable for transcode, and unwatched dead weight."
              action={
                <DkButton
                  size="sm"
                  onClick={() => setPlexOptimizerOpen(true)}
                  leftIcon={Sparkles}
                  className="bg-primary/10 text-primary shadow-none hover:bg-primary/15"
                >
                  Open Optimizer
                </DkButton>
              }
            />

            {plexStorage ? (
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Metric
                  icon={HardDrive}
                  label="Plex media scanned"
                  value={formatBytes(plexStorage.totalBytes ?? plexStorage.total_bytes ?? 0)}
                  hint={`${plexStorage.totalItems ?? plexStorage.total_items ?? 0} items · ${plexStorage.totalFiles ?? plexStorage.total_files ?? 0} files`}
                />
                <Metric
                  icon={Sparkles}
                  label="Potential savings"
                  value={`Up to ${formatBytes(plexStorage.potentialSavingsBytes ?? plexStorage.potential_savings_bytes ?? 0)}`}
                  hint="Reclaimable from duplicates, transcode & dead weight"
                />
              </div>
            ) : (
              <div className="mt-3 text-xs text-white/50">
                Launch the optimizer to inspect connected servers and view actionable savings.
              </div>
            )}
          </SettingsCard>

          {plexOptimizerOpen && (
            <PlexStorageOptimizerModal
              open={plexOptimizerOpen}
              onOpenChange={setPlexOptimizerOpen}
            />
          )}

          <DkDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="Delete downloaded artwork?"
            description={`This permanently deletes ${data.downloadedCount} image${data.downloadedCount === 1 ? '' : 's'} (${formatBytes(data.downloadedBytes)}) from the server disk. The catalog will fall back to the provider URLs. This cannot be undone.`}
          >
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={purge.isPending}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-white/70 transition-all hover:bg-white/10 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={deleteAllDownloaded}
                disabled={purge.isPending}
                className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-red-600 disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {purge.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </DkDialog>
        </>
      )}
    </div>
  )
};
