import { useState } from 'react'
import { Copy, Check, Users, Link as LinkIcon, Trash2, UserPlus, Loader2 } from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { useToast } from '@ui/molecules/toast'
import {
  useCreateGameServerInvite,
  useDisableGameServerInvite,
  useGameServerShares,
  useOtixFriends,
  useRemoveGameServerShare,
  useShareGameServer,
} from '../queries/gameservers-queries'
import type { DedicatedGameServer } from '../types'

interface ShareGameServerModalProps {
  server: DedicatedGameServer
  isOpen: boolean
  onClose: () => void
}

export function ShareGameServerModal({ server, isOpen, onClose }: ShareGameServerModalProps) {
  const { toast } = useToast()
  const { data: friends = [], isLoading: isLoadingFriends } = useOtixFriends()
  const { data: shares = [], isLoading: isLoadingShares } = useGameServerShares(server.id)
  const shareMutation = useShareGameServer()
  const removeShareMutation = useRemoveGameServerShare()
  const createInviteMutation = useCreateGameServerInvite()
  const disableInviteMutation = useDisableGameServerInvite()

  const [copied, setCopied] = useState(false)
  const [selectedFriendId, setSelectedFriendId] = useState<number | null>(null)
  const [permission, setPermission] = useState<'viewer' | 'moderator'>('viewer')

  const activeInviteCode = server.activeInviteCode
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const shareableUrl = activeInviteCode ? `${origin}/servers/join/${activeInviteCode}` : ''

  const sharedUserIds = new Set(shares.map((s) => s.user.id))
  const unsharedFriends = friends.filter((f) => !sharedUserIds.has(f.id))

  const handleCopyLink = () => {
    if (!shareableUrl) return
    void navigator.clipboard.writeText(shareableUrl)
    setCopied(true)
    toast({
      title: 'Link Copied',
      description: 'Server invite link copied to clipboard.',
      variant: 'success',
    })
    setTimeout(() => setCopied(false), 2000)
  }

  const handleShareWithFriend = async () => {
    if (!selectedFriendId) return
    try {
      await shareMutation.mutateAsync({
        serverId: server.id,
        userId: selectedFriendId,
        permission,
      })
      toast({
        title: 'Server Shared',
        description: 'Friend now has access to this game server.',
        variant: 'success',
      })
      setSelectedFriendId(null)
    } catch (err: unknown) {
      toast({
        title: 'Could not share server',
        description: (err as { message?: string })?.message || 'Error sharing server with friend.',
        variant: 'error',
      })
    }
  }

  const handleRemoveShare = async (userId: number, username: string) => {
    try {
      await removeShareMutation.mutateAsync({ serverId: server.id, userId })
      toast({
        title: 'Share Removed',
        description: `Removed access for ${username}.`,
        variant: 'default',
      })
    } catch (err: unknown) {
      toast({
        title: 'Could not remove share',
        description: (err as { message?: string })?.message,
        variant: 'error',
      })
    }
  }

  const handleTogglePublicLink = async () => {
    try {
      if (server.isPublicLink && activeInviteCode) {
        await disableInviteMutation.mutateAsync(server.id)
        toast({
          title: 'Link Sharing Disabled',
          description: 'The public invite link has been deactivated.',
          variant: 'default',
        })
      } else {
        await createInviteMutation.mutateAsync(server.id)
        toast({
          title: 'Link Sharing Enabled',
          description: 'Anyone with this link can now view and join this server.',
          variant: 'success',
        })
      }
    } catch (err: unknown) {
      toast({
        title: 'Error updating link sharing',
        description: (err as { message?: string })?.message,
        variant: 'error',
      })
    }
  }

  return (
    <DkDialog
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      title={`Share "${server.name}"`}
      description="Share this dedicated game server with your Otix friends or generate a public link."
      className="max-w-lg"
    >
      <div className="space-y-6 pt-2">
        {/* Section 1: Otix Friends Sharing */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Users size={16} className="text-primary" />
            <span>Share with Otix Friends</span>
          </div>

          <div className="flex gap-2">
            <select
              value={selectedFriendId ?? ''}
              onChange={(e) => setSelectedFriendId(e.target.value ? Number(e.target.value) : null)}
              className="flex-1 h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-primary cursor-pointer"
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

            <select
              value={permission}
              onChange={(e) => setPermission(e.target.value as 'viewer' | 'moderator')}
              className="h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-xs text-white focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value="viewer" className="bg-neutral-900">Viewer</option>
              <option value="moderator" className="bg-neutral-900">Moderator</option>
            </select>

            <DkButton
              type="button"
              variant="primary"
              onClick={handleShareWithFriend}
              disabled={!selectedFriendId || shareMutation.isPending}
              className="h-10 px-4"
            >
              <UserPlus size={15} />
            </DkButton>
          </div>

          {/* Currently Shared List */}
          <div className="rounded-2xl bg-white/[0.03] border border-white/[0.08] divide-y divide-white/[0.06] overflow-hidden">
            <div className="px-3.5 py-2 text-[11px] font-semibold text-white/50 uppercase tracking-wider">
              Currently Shared Friends ({shares.length})
            </div>
            {isLoadingShares ? (
              <div className="p-4 flex items-center justify-center text-white/40 gap-2 text-xs">
                <Loader2 size={14} className="animate-spin" />
                <span>Loading shares...</span>
              </div>
            ) : shares.length === 0 ? (
              <div className="p-4 text-center text-xs text-white/40">
                Not shared with any friends yet.
              </div>
            ) : (
              shares.map((sh) => (
                <div key={sh.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                      {(sh.user.displayName || sh.user.username)[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white truncate">
                        {sh.user.displayName || sh.user.username}
                      </div>
                      <div className="text-[10px] text-white/40">@{sh.user.username}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-white/10 text-[10px] font-medium text-white/70 uppercase">
                      {sh.permission}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveShare(sh.user.id, sh.user.username)}
                      title="Remove access"
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

        {/* Section 2: Anyone with the Link */}
        <div className="pt-3 border-t border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <LinkIcon size={16} className="text-primary" />
              <span>Anyone with the Link</span>
            </div>
            <DkButton
              type="button"
              variant={server.isPublicLink ? 'outline' : 'secondary'}
              size="sm"
              onClick={handleTogglePublicLink}
              disabled={createInviteMutation.isPending || disableInviteMutation.isPending}
            >
              {server.isPublicLink ? 'Disable Link' : 'Enable Link'}
            </DkButton>
          </div>

          <p className="text-xs text-white/50">
            Allow anyone with this unique invite link to view connection details and join this server.
          </p>

          {server.isPublicLink && shareableUrl && (
            <div className="flex items-center gap-2 p-2 rounded-xl bg-white/5 border border-white/10">
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
    </DkDialog>
  )
}
