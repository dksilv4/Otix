import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DkDropdown, type DkDropdownOption } from '@ui/atoms/dropdown'
import { DkButton } from '@ui/atoms/button'
import { DkSwitch } from '@ui/atoms/switch'
import { DkDialog } from '@ui/molecules/dialog'
import { Trash2, CheckCircle2, Sparkles, RotateCcw, Ban } from 'lucide-react'
import { SectionHeader } from '../components/molecules/settings-section-header'
import { SettingsCard } from '../components/molecules/settings-card'
import { useSteamFreePacksSetting, STEAM_FREE_PACKS_STORAGE_KEY } from '../hooks/use-steam-free-packs-setting'
import { isDesktop } from '@/lib/desktop/api'
import { useAuth } from '@auth/hooks/use-auth'
import { apiClient } from '@/lib/api/client'
import { useToast } from '@ui/molecules/toast'
import { queryClient } from '@/lib/query/client'
import { mediaKeys } from '@media/queries/media-keys'
import { mediaQueries, useUnblockRecommendation } from '@media/queries/media-queries'

const STORAGE_KEY = 'otix:default-landing-page'

const LANDING_PAGE_OPTIONS = [
  { value: 'discover', label: 'Discover' },
  { value: 'launcher', label: 'Launcher' },
  { value: 'library', label: 'Library' },
] satisfies readonly DkDropdownOption[]

function readDefaultPage(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || 'discover'
  } catch {
    return 'discover'
  }
}

function formatResetAt(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return null
  }
}

export function SettingsGeneralPage() {
  const [defaultPage, setDefaultPage] = useState(readDefaultPage)
  const [showSteamPacks, setShowSteamPacks] = useSteamFreePacksSetting()
  const [cleared, setCleared] = useState(false)
  const [confirmTasteReset, setConfirmTasteReset] = useState(false)
  const [tasteResetting, setTasteResetting] = useState(false)
  const [showBlockedModal, setShowBlockedModal] = useState(false)
  const desktop = isDesktop()
  const { isAuthenticated, user, refreshUser } = useAuth()
  const { toast } = useToast()

  const { data: blockedData } = useQuery({
    ...mediaQueries.blockedRecommendations(),
    enabled: isAuthenticated,
  })
  const unblockMutation = useUnblockRecommendation()

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, defaultPage)
    } catch {
      // ignore
    }
  }, [defaultPage])

  const handleClearCache = () => {
    try {
      const preserveKeys = new Set([
        'otix:token',
        'otix:user',
        'otix-accent',
        'otix-accent-customs',
        'otix:default-landing-page',
        'otix:launcher-theme',
        STEAM_FREE_PACKS_STORAGE_KEY,
      ])
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && !preserveKeys.has(key) && !key.startsWith('otix:auth')) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k))
      setCleared(true)
      setTimeout(() => setCleared(false), 2500)
    } catch {
      // ignore
    }
  }

  const handleResetTaste = async () => {
    setTasteResetting(true)
    try {
      await apiClient.post('/auth/me/taste/reset')
      await refreshUser()
      await queryClient.invalidateQueries({ queryKey: mediaKeys.all() })
      setConfirmTasteReset(false)
      toast({
        title: 'Taste profile reset',
        description: 'For You will rebuild from new ratings and activity. Your library is unchanged.',
        variant: 'success',
      })
    } catch {
      toast({
        title: 'Could not reset taste',
        description: 'Try again in a moment.',
        variant: 'error',
      })
    } finally {
      setTasteResetting(false)
    }
  }

  const lastTasteReset = formatResetAt(user?.tasteResetAt)

  return (
    <div id="general" className="space-y-5 scroll-mt-28">
      {/* Default Landing Page */}
      <SettingsCard>
        <SectionHeader
          title="Default Landing Page"
          description="Choose which view opens first whenever you launch Otix."
          action={
            <DkDropdown
              options={LANDING_PAGE_OPTIONS}
              value={defaultPage}
              onChange={(v) => setDefaultPage(v)}
              className="w-44"
            />
          }
        />
      </SettingsCard>

      {/* Free Steam Packs & DLC */}
      <SettingsCard>
        <SectionHeader
          title="Show Free Steam Packs & DLC"
          description="Include promotional packs, DLCs, and bundles from Steam in Discover rails. Free packs for games you view will always appear on their game detail page."
          action={
            <DkSwitch
              checked={showSteamPacks}
              onCheckedChange={setShowSteamPacks}
            />
          }
        />
      </SettingsCard>

      {/* Cache & Local State */}
      <SettingsCard>
        <SectionHeader
          title="Application Cache"
          description="Clear temporary cached catalog queries, search filters, and volatile media states without logging out."
          action={
            <DkButton
              size="sm"
              variant="ghost"
              onClick={handleClearCache}
              className="hover:bg-white/10 text-xs font-semibold gap-2"
            >
              {cleared ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Cache Cleared</span>
                </>
              ) : (
                <>
                  <Trash2 className="h-3.5 w-3.5 text-white/60" />
                  <span>Clear Cache</span>
                </>
              )}
            </DkButton>
          }
        />
      </SettingsCard>

      {isAuthenticated && (
        <SettingsCard>
          <SectionHeader
            icon={Sparkles}
            title="For You taste"
            description={
              lastTasteReset
                ? `Recommendations ignore activity from before ${lastTasteReset}. Library ratings and history stay intact.`
                : 'For You blends this title with your ratings and watch activity. Reset to start a fresh taste profile without deleting your library.'
            }
            action={
              <DkButton
                size="sm"
                variant="ghost"
                onClick={() => setConfirmTasteReset(true)}
                className="hover:bg-white/10 text-xs font-semibold gap-2"
              >
                <RotateCcw className="h-3.5 w-3.5 text-white/60" />
                <span>Reset taste</span>
              </DkButton>
            }
          />
        </SettingsCard>
      )}

      {isAuthenticated && (
        <SettingsCard>
          <SectionHeader
            icon={Ban}
            title="Blocked recommendations"
            description={
              blockedData?.total
                ? `${blockedData.total} title${blockedData.total === 1 ? '' : 's'} blocked from appearing in Decide for me and For You.`
                : 'No titles blocked from recommendations.'
            }
            action={
              <DkButton
                size="sm"
                variant="ghost"
                onClick={() => setShowBlockedModal(true)}
                className="hover:bg-white/10 text-xs font-semibold gap-2"
                disabled={!blockedData?.items?.length}
              >
                <span>Manage ({blockedData?.total ?? 0})</span>
              </DkButton>
            }
          />
        </SettingsCard>
      )}

      {confirmTasteReset && (
        <DkDialog
          open={confirmTasteReset}
          onOpenChange={(open) => {
            if (!open && !tasteResetting) setConfirmTasteReset(false)
          }}
          title="Reset For You taste?"
          description="Start fresh personalization without deleting your library."
        >
          <div className="space-y-4 pt-2">
            <p className="text-xs text-white/70 leading-relaxed">
              Otix will stop using your past ratings and activity for For You
              recommendations, and clear preferred genres / discover emphases.
              Your watch history, ratings, and library stay as they are. New
              activity after this reset will rebuild your taste profile.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <DkButton
                type="button"
                variant="ghost"
                size="sm"
                disabled={tasteResetting}
                onClick={() => setConfirmTasteReset(false)}
              >
                Cancel
              </DkButton>
              <DkButton
                type="button"
                variant="destructive"
                size="sm"
                loading={tasteResetting}
                onClick={handleResetTaste}
              >
                Reset taste
              </DkButton>
            </div>
          </div>
        </DkDialog>
      )}

      {showBlockedModal && (
        <DkDialog
          open={showBlockedModal}
          onOpenChange={(open) => {
            if (!open) setShowBlockedModal(false)
          }}
          title="Blocked recommendations"
          description="These titles will not appear in Decide for me or For You feeds."
          className="max-w-xl max-h-[80vh] overflow-hidden flex flex-col"
        >
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-2">
            {!blockedData?.items?.length ? (
              <p className="text-xs text-white/50 py-4 text-center">No blocked recommendations.</p>
            ) : (
              blockedData.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-white/5 p-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {item.posterUrl && (
                      <img
                        src={item.posterUrl}
                        alt=""
                        className="h-12 w-8 shrink-0 rounded object-cover"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{item.title}</p>
                      <p className="text-xs text-white/50 capitalize">{item.mediaType}</p>
                    </div>
                  </div>
                  <DkButton
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await unblockMutation.mutateAsync({
                        mediaId: item.id,
                        mediaType: item.mediaType,
                      })
                      toast({
                        title: 'Unblocked',
                        description: `"${item.title}" can now be recommended again.`,
                      })
                    }}
                    disabled={unblockMutation.isPending}
                    className="text-xs text-white/70 hover:text-white"
                  >
                    Unblock
                  </DkButton>
                </div>
              ))
            )}
          </div>
        </DkDialog>
      )}

      {/* About Otix */}
      <SettingsCard>
        <SectionHeader
          title="About Otix"
          description="Client environment and build information."
        />

        <div
          className="rounded-2xl p-4 sm:p-5 space-y-3"
          style={{ backgroundColor: 'var(--dk-surface-raised)' }}
        >
          <div className="flex items-center justify-between text-xs">
            <span className="text-white/60">Platform Environment</span>
            <span className="font-semibold text-white">
              {desktop ? 'Otix Desktop App (Electron)' : 'Otix Web App'}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs pt-3">
            <span className="text-white/60">Version</span>
            <span className="font-mono text-white/80">0.0.1 (Release)</span>
          </div>
          <div className="flex items-center justify-between text-xs pt-3">
            <span className="text-white/60">Status</span>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Operational
            </span>
          </div>
        </div>
      </SettingsCard>
    </div>
  )
}
