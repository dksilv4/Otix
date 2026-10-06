import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Users, Link as LinkIcon, Copy, Check, Trash2, UserPlus, Loader2 } from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import { DkButton } from '@ui/atoms/button'
import { useToast } from '@ui/molecules/toast'
import { useOtixFriends } from '@/features/gameservers/queries/gameservers-queries'
import type { GameServer, NodeShare } from '@/features/downloads/types'

interface SettingsNodeSharingSectionProps {
  server: GameServer
}

export const SettingsNodeSharingSection = ({ server }: SettingsNodeSharingSectionProps) => {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { data: friends = [], isLoading: isLoadingFriends } = useOtixFriends()

  const sharesQueryKey = ['node-shares', server.id] as const
  const { data: shares = [], isLoading: isLoadingShares } = useQuery<NodeShare[]>({
    queryKey: sharesQueryKey,
    queryFn: async () => {
      const { data } = await apiClient.get<NodeShare[]>(`/library/nodes/${server.id}/shares`)
      return data || []
    },
    enabled: Boolean(server.id),
  })

  const shareMutation = useMutation({
    mutationFn: async (payload: {
      sharedWithId?: number | null
      isPublicLink?: boolean
      allowAllLibraries?: boolean
      permission?: string
    }) => {
      const { data } = await apiClient.post<NodeShare>(`/library/nodes/${server.id}/shares`, payload)
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sharesQueryKey })
      void queryClient.invalidateQueries({ queryKey: ['server-games'] })
    },
  })

  const removeShareMutation = useMutation({
    mutationFn: async (shareId: number) => {
      await apiClient.delete(`/library/nodes/${server.id}/shares/${shareId}`)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sharesQueryKey })
      void queryClient.invalidateQueries({ queryKey: ['server-games'] })
    },
  })

  const [selectedFriendId, setSelectedFriendId] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  const publicLinkShare = shares.find((s) => s.isPublicLink)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const shareableUrl = publicLinkShare
    ? `${origin}/library?nodeShareToken=${publicLinkShare.shareToken}`
    : ''

  const sharedUserIds = new Set(
    shares.filter((s) => s.sharedWith != null).map((s) => s.sharedWith!.id)
  )
  const unsharedFriends = friends.filter((f) => !sharedUserIds.has(f.id))

  const handleShareWithFriend = async () => {
    if (!selectedFriendId) return
    try {
      await shareMutation.mutateAsync({
        sharedWithId: selectedFriendId,
        allowAllLibraries: true,
        permission: 'read',
      })
      toast({
        title: 'Node Shared',
        description: 'Friend can now browse and download games from this node.',
        variant: 'success',
      })
      setSelectedFriendId(null)
    } catch (err: unknown) {
      toast({
        title: 'Could not share node',
        description: (err as { message?: string })?.message || 'Error sharing with friend.',
        variant: 'error',
      })
    }
  }

  const handleTogglePublicLink = async () => {
    try {
      if (publicLinkShare) {
        await removeShareMutation.mutateAsync(publicLinkShare.id)
        toast({
          title: 'Public Link Disabled',
          description: 'Anyone-with-link access has been revoked.',
          variant: 'default',
        })
      } else {
        await shareMutation.mutateAsync({
          isPublicLink: true,
          allowAllLibraries: true,
          permission: 'read',
        })
        toast({
          title: 'Public Link Enabled',
          description: 'Anyone with this link can browse and download games from this node.',
          variant: 'success',
        })
      }
    } catch (err: unknown) {
      toast({
        title: 'Error updating link share',
        description: (err as { message?: string })?.message,
        variant: 'error',
      })
    }
  }

  const handleCopyLink = () => {
    if (!shareableUrl) return
    void navigator.clipboard.writeText(shareableUrl)
    setCopied(true)
    toast({
      title: 'Link Copied',
      description: 'Node share link copied to clipboard.',
      variant: 'success',
    })
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      {/* Otix Friends */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Users size={16} className="text-primary" />
          <span>Share with Otix Friends</span>
        </div>
        <p className="text-xs text-white/50">
          Give Otix friends permission to browse and download game installers and ROMs hosted on this node.
        </p>

        <div className="flex gap-2">
          <select
            value={selectedFriendId ?? ''}
            onChange={(e) => setSelectedFriendId(e.target.value ? Number(e.target.value) : null)}
            className="flex-1 h-10 px-3 rounded-xl bg-white/5 text-sm text-white focus:outline-none focus:bg-white/10 cursor-pointer"
            disabled={isLoadingFriends || unsharedFriends.length === 0}
          >
            <option value="" className="bg-neutral-900">
              {isLoadingFriends
                ? 'Loading friends...'
                : unsharedFriends.length === 0
                ? 'No available friends to add'
                : 'Select an Otix friend...'}
            </option>
            {unsharedFriends.map((friend) => (
              <option key={friend.id} value={friend.id} className="bg-neutral-900">
                {friend.displayName || friend.username} (@{friend.username})
              </option>
            ))}
          </select>

          <DkButton
            type="button"
            variant="primary"
            onClick={handleShareWithFriend}
            disabled={!selectedFriendId || shareMutation.isPending}
            className="h-10 px-4"
          >
            <UserPlus size={15} />
            <span className="ml-1.5 hidden sm:inline">Share</span>
          </DkButton>
        </div>

        {/* List of current friend shares */}
        <div className="rounded-2xl bg-white/[0.03] overflow-hidden">
          <div className="px-3.5 py-2 text-[11px] font-semibold text-white/50 uppercase tracking-wider">
            Shared with Friends ({shares.filter((s) => s.sharedWith != null).length})
          </div>
          {isLoadingShares ? (
            <div className="p-4 flex items-center justify-center text-white/40 gap-2 text-xs">
              <Loader2 size={14} className="animate-spin" />
              <span>Loading shares...</span>
            </div>
          ) : shares.filter((s) => s.sharedWith != null).length === 0 ? (
            <div className="p-4 text-center text-xs text-white/40">
              Not shared with any friends yet.
            </div>
          ) : (
            shares
              .filter((s) => s.sharedWith != null)
              .map((sh) => (
                <div key={sh.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                      {(sh.sharedWith!.displayName || sh.sharedWith!.username)[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white truncate">
                        {sh.sharedWith!.displayName || sh.sharedWith!.username}
                      </div>
                      <div className="text-[10px] text-white/40">@{sh.sharedWith!.username}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-white/10 text-[10px] font-medium text-white/70 uppercase">
                      {sh.permission}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeShareMutation.mutate(sh.id)}
                      title="Revoke access"
                      className="p-1 rounded-lg text-white/40 hover:text-red-400 hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))
          )}
        </div>
      </div>

      {/* Anyone with the Link */}
      <div className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <LinkIcon size={16} className="text-primary" />
            <span>Anyone with the Link</span>
          </div>
          <DkButton
            type="button"
            variant={publicLinkShare ? 'outline' : 'secondary'}
            size="sm"
            onClick={handleTogglePublicLink}
            disabled={shareMutation.isPending || removeShareMutation.isPending}
          >
            {publicLinkShare ? 'Disable Link' : 'Enable Link'}
          </DkButton>
        </div>

        <p className="text-xs text-white/50">
          Generate a shareable link that grants read-only game download access to anyone who holds the URL.
        </p>

        {publicLinkShare && shareableUrl && (
          <div className="flex items-center gap-2 p-2 rounded-xl bg-white/5">
            <input
              type="text"
              readOnly
              value={shareableUrl}
              className="flex-1 bg-transparent text-xs text-white/80 focus:outline-none px-2 select-all font-mono"
            />
            <DkButton
              type="button"
              variant="primary"
              size="sm"
              onClick={handleCopyLink}
              className="shrink-0 h-8 gap-1.5"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </DkButton>
          </div>
        )}
      </div>
    </div>
  )
};
