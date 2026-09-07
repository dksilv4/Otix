import { useState, type ComponentType } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useLocation } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/lib/providers/auth'
import { apiClient } from '@/lib/api/client'
import { formatBytes, cn } from '@/lib/utils'
import { DkSwitch } from '@/old-features/ui/atoms/switch'
import { DkDialog } from '@/old-features/ui/molecules/dialog'
import { useToast } from '@/old-features/ui/molecules/toast'
import { HardDrive, Image, FolderOpen, ShieldAlert, ShieldCheck, Loader2, Trash2, AlertTriangle } from 'lucide-react'
import {
  mediaAdminQueryKeys,
  useMirroring,
  usePurgeAssets,
  useSetMirroring,
} from '@/features/media/hooks/use-media-admin-settings'
import { SectionHeader } from '../components/molecules/settings-section-header'
import { SettingsCard } from '../components/molecules/settings-card'

interface StorageStats {
  mediaDir: string
  downloadedCount: number
  downloadedBytes: number
  disk: { total: number; used: number; free: number }
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-white/50">{label}</p>
          <p className="text-xl font-bold text-white tabular-nums leading-tight">{value}</p>
          {hint && <p className="text-[11px] text-white/40 mt-0.5">{hint}</p>}
        </div>
      </div>
    </div>
  )
}

function AccessBlock({ signedOut }: { signedOut: boolean }) {
  const location = useLocation()
  return (
    <SettingsCard className="p-8 sm:p-10 text-center space-y-5 max-w-xl mx-auto my-8">
      <div
        className={cn(
          'mx-auto flex h-14 w-14 items-center justify-center rounded-2xl',
          signedOut ? 'bg-primary/10 text-primary' : 'bg-amber-400/10 text-amber-400',
        )}
      >
        {signedOut ? <ShieldCheck className="h-7 w-7" /> : <ShieldAlert className="h-7 w-7" />}
      </div>
      <div className="space-y-1.5">
        <h3 className="text-lg font-bold text-white tracking-tight">
          {signedOut ? 'Sign in to view storage' : 'Admin access required'}
        </h3>
        <p className="text-xs text-white/60 leading-relaxed max-w-md mx-auto">
          {signedOut
            ? 'Downloaded-library usage is only visible to signed-in admins.'
            : 'Only server admins can inspect the locally downloaded media library and disk usage.'}
        </p>
      </div>
      {signedOut && (
        <div className="pt-2">
          <Link
            to="/auth/login"
            search={{ redirect: location.href }}
            className="inline-flex items-center justify-center font-semibold rounded-xl px-6 py-2.5 text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-md active:scale-[0.98]"
          >
            Sign In
          </Link>
        </div>
      )}
    </SettingsCard>
  )
}

export function SettingsStoragePage() {
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

  if (!isAuthenticated || !user) return <AccessBlock signedOut />
  if (!user.isAdmin) return <AccessBlock signedOut={false} />

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
        <SettingsCard className="flex items-center justify-center gap-3 py-14 text-white/50">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading storage usage…</span>
        </SettingsCard>
      )}

      {error && (
        <SettingsCard className="text-sm text-red-400/90 bg-red-400/5 py-6 text-center">
          Could not load storage usage. The media admin API may be unreachable.
        </SettingsCard>
      )}

      {data && !isLoading && (
        <>
          <SettingsCard className="space-y-4">
            <SectionHeader
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
              <div className="flex items-start gap-2.5 rounded-xl bg-amber-400/10 px-3.5 py-3 text-xs text-amber-300/90 leading-relaxed">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Mirroring is paused. The <span className="font-semibold text-amber-200">Download Images</span> action
                  on media is blocked until you turn this back on. Artwork already downloaded keeps being served from
                  this server.
                </p>
              </div>
            )}
          </SettingsCard>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatCard
              icon={Image}
              label="Downloaded artwork"
              value={`${data.downloadedCount} image${data.downloadedCount === 1 ? '' : 's'}`}
              hint={`${formatBytes(data.downloadedBytes)} on disk`}
            />
            <StatCard
              icon={HardDrive}
              label="Filesystem"
              value={formatBytes(disk?.total ?? 0)}
              hint={`${formatBytes(disk?.free ?? 0)} free of ${formatBytes(disk?.total ?? 0)}`}
            />
          </div>

          <SettingsCard>
            <SectionHeader
              title="Filesystem usage"
              description={`${formatBytes(disk?.used ?? 0)} used · ${formatBytes(disk?.free ?? 0)} free`}
            />
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${usedPct}%`,
                  backgroundColor: usedPct > 85 ? 'var(--dk-danger, #ef4444)' : 'var(--primary)',
                }}
              />
            </div>
            <p className="mt-2 text-[11px] text-white/40 tabular-nums">{usedPct.toFixed(1)}% of the volume is in use</p>
          </SettingsCard>

          <SettingsCard>
            <div className="flex items-center gap-3 text-white/60">
              <FolderOpen className="h-4 w-4 shrink-0" />
              <p className="text-xs">
                Downloaded files live at{' '}
                <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-white/80">{data.mediaDir}</code>
              </p>
            </div>
          </SettingsCard>

          <SettingsCard>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
                className="inline-flex items-center justify-center gap-2 self-start sm:self-auto rounded-xl bg-red-500/15 px-4 py-2 text-xs font-semibold text-red-300 ring-1 ring-inset ring-red-500/30 hover:bg-red-500/25 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="h-4 w-4" />
                {purge.isPending ? 'Deleting…' : 'Delete all'}
              </button>
            </div>
          </SettingsCard>

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
                className="rounded-xl px-4 py-2 text-xs font-semibold text-white/70 hover:bg-white/10 transition-all cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={deleteAllDownloaded}
                disabled={purge.isPending}
                className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-xs font-semibold text-white hover:bg-red-600 transition-all cursor-pointer disabled:opacity-60"
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
}
