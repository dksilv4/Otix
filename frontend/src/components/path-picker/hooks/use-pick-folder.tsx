import { useCallback } from 'react'
import { FolderPickerModal } from '../folder-picker-modal'
import { useModal } from '@/lib/modals'
import { getDesktopAPI, isDesktop } from '@/lib/desktop/api'
import { useGameServers } from '@/features/downloads/use-server-downloads'
import { isLocalDesktopNode, isLocalDesktopNodeId } from '@/features/settings/local-desktop-node'
import { resolveFolderPickStrategy, type FolderPickTarget } from '../strategy'

export const usePickFolder = (options?: {
  target?: FolderPickTarget
  serverId?: number
}) => {
  const api = getDesktopAPI()
  const { data: servers = [] } = useGameServers()
  const { openModal } = useModal()
  const target = options?.target ?? 'local'
  const serverId = options?.serverId

  const remoteServers = servers.filter((s) => !isLocalDesktopNode(s) && Number(s.id) > 0)

  const strategy = resolveFolderPickStrategy({
    target,
    isDesktop: isDesktop(),
    hasSelectDirectory: Boolean(api?.pickFolder || api?.openDirectoryDialog || api?.selectDirectory),
    hasServers: remoteServers.length > 0,
  })

  const pick = useCallback(async (): Promise<string | null> => {
    if (strategy === 'native') {
      const nativePick = api?.pickFolder ?? api?.openDirectoryDialog ?? api?.selectDirectory
      return (await nativePick?.call(api)) ?? null
    }
    if (strategy === 'server-modal') {
      return new Promise((resolve) => {
        const close = openModal(
          <FolderPickerModal
            initialServerId={serverId && !isLocalDesktopNodeId(serverId) ? serverId : remoteServers[0]?.id}
            onSelect={(path) => {
              close()
              resolve(path)
            }}
            onClose={() => {
              close()
              resolve(null)
            }}
          />,
        )
      })
    }
    return null
  }, [strategy, api, serverId, remoteServers, openModal])

  return {
    pick,
    strategy,
    canBrowse: strategy !== 'disabled',
  }
}
