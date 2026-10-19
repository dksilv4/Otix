import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Sparkles, RotateCcw, Ban, Gift, Lock } from 'lucide-react'
import { SectionHeader } from '../components/molecules/settings-section-header'
import { SettingsCard } from '../components/molecules/settings-card'
import { SettingsLockedState } from '../components/molecules/settings-locked-state'
import { DkButton } from '@ui/atoms/button'
import { DkSwitch } from '@ui/atoms/switch'
import { DkDialog } from '@ui/molecules/dialog'
import { useAuth } from '@auth/hooks/use-auth'
import { apiClient } from '@/lib/api/client'
import { useToast } from '@ui/molecules/toast'
import { queryClient } from '@/lib/query/client'
import { mediaKeys } from '@media/queries/media-keys'
import { mediaQueries, useUnblockRecommendation } from '@media/queries/media-queries'
import { useSteamFreePacksSetting } from '../hooks/use-steam-free-packs-setting'
import { formatResetAt } from '../utils/recommendations'
import { useSettingsHashScroll } from '../hooks/use-settings-hash-scroll'

export const SettingsRecommendationsPage = () => {
  const [showSteamPacks, setShowSteamPacks] = useSteamFreePacksSetting()
  const [confirmTasteReset, setConfirmTasteReset] = useState(false)
  const [tasteResetting, setTasteResetting] = useState(false)
  const [showBlockedModal, setShowBlockedModal] = useState(false)
  const { isAuthenticated, user, refreshUser } = useAuth()
  const { toast } = useToast()
  useSettingsHashScroll()

  const { data: blockedData } = useQuery({
    ...mediaQueries.blockedRecommendations(),
    enabled: isAuthenticated,
  })
  const unblockMutation = useUnblockRecommendation()

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
    <div id="settings-recommendations-section" className="space-y-8">
      <SectionHeader
        variant="page"
        icon={Sparkles}
        title="Recommendations"
        description="Personalization taste profile, blocked titles, and store discover preferences."
      />

      <div id="recommendations" className="space-y-5 scroll-mt-28">
        {/* Discover Content: Free Steam Packs & DLC */}
        <SettingsCard>
          <SectionHeader
            icon={Gift}
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

        {/* Personalization Taste & Blocked Recommendations */}
        {!isAuthenticated ? (
          <SettingsLockedState
            title="Personalized Recommendations"
            description="Sign in to customize For You taste profiles and manage blocked titles across all your devices."
            icon={Lock}
          />
        ) : (
          <>
            <SettingsCard>
              <SectionHeader
                icon={Sparkles}
                title="For You taste"
                description={
                  lastTasteReset
                    ? `Recommendations ignore activity from before ${lastTasteReset}. Library ratings and history stay intact.`
                    : 'For You blends catalog suggestions with your ratings and watch activity. Reset to start a fresh taste profile without deleting your library.'
                }
                action={
                  <DkButton
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmTasteReset(true)}
                    className="hover:bg-[var(--dk-surface-hover)] text-xs font-semibold gap-2"
                  >
                    <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Reset taste</span>
                  </DkButton>
                }
              />
            </SettingsCard>

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
                    className="hover:bg-[var(--dk-surface-hover)] text-xs font-semibold gap-2"
                    disabled={!blockedData?.items?.length}
                  >
                    <span>Manage ({blockedData?.total ?? 0})</span>
                  </DkButton>
                }
              />
            </SettingsCard>
          </>
        )}
      </div>

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
            <p className="text-xs text-muted-foreground leading-relaxed">
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
              <p className="text-xs text-muted-foreground py-4 text-center">No blocked recommendations.</p>
            ) : (
              blockedData.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-[var(--dk-surface-field)] p-3"
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
                      <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                      <p className="text-xs text-muted-foreground capitalize">{item.mediaType}</p>
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
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Unblock
                  </DkButton>
                </div>
              ))
            )}
          </div>
        </DkDialog>
      )}
    </div>
  )
};
