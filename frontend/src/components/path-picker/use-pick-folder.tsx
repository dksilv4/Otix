import { useCallback } from 'react'
import { FolderPickerModal } from './folder-picker-modal'
import { useModal } from '@/lib/modals'
import { getDesktopAPI, isDesktop } from '@/lib/desktop/api'
import { useGameServers } from '@/features/downloads/use-server-downloads'
import { resolveFolderPickStrategy, type FolderPickTarget } from './strategy'

export function usePickFolder(options?: {
  target?: FolderPickTarget
  serverId?: number
}) {
  const api = getDesktopAPI()
  const { data: servers = [] } = useGameServers()
  const { openModal } = useModal()
  const target = options?.target ?? 'local'
  const serverId = options?.serverId

  const strategy = resolveFolderPickStrategy({
    target,
    isDesktop: isDesktop(),
    hasSelectDirectory: Boolean(api?.selectDirectory),
    hasServers: servers.length > 0,
  })

  const pick = useCallback(async (): Promise<string | null> => {
    if (strategy === 'native') {
      return (await api?.selectDirectory?.()) ?? null
    }
    if (strategy === 'server-modal') {
      return new Promise((resolve) => {
        const close = openModal(
          <FolderPickerModal
            initialServerId={serverId ?? servers[0]?.id}
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
  }, [strategy, api, serverId, servers, openModal])

  return {
    pick,
    strategy,
    canBrowse: strategy !== 'disabled',
  }
}
