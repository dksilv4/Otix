export interface GameChangelogItem {
  id: string
  title: string
  version?: string
  date: number // Unix timestamp in seconds
  content: string
  author?: string
  url?: string
  isPatchNote: boolean
  feedLabel?: string
}

export interface GameVersionInfo {
  installedVersion?: string
  latestVersion?: string
  hasLocalUpdate: boolean
  localUpdateFiles: { name: string; path: string }[]
}
