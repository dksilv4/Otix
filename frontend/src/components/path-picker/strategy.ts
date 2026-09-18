export type FolderPickTarget = 'local' | 'server'
export type FolderPickStrategy = 'native' | 'server-modal' | 'disabled'

export function resolveFolderPickStrategy(opts: {
  target: FolderPickTarget
  isDesktop: boolean
  hasSelectDirectory: boolean
  hasServers: boolean
}): FolderPickStrategy {
  if (opts.target === 'local' && opts.isDesktop && opts.hasSelectDirectory) {
    return 'native'
  }
  if (opts.hasServers) return 'server-modal'
  return 'disabled'
}
