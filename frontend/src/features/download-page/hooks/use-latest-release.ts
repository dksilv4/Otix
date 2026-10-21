import { useQuery } from '@tanstack/react-query'
import type { LatestReleaseInfo, PlatformDownloadOption, ReleaseAsset } from '../types'
import {
  DEFAULT_RELEASE_INFO,
  GITHUB_API_LATEST,
} from '../constants/downloads-data'
import { resolvePlatformOptions } from '../utils/downloads-utils'

interface GitHubReleasePayload {
  tag_name?: string
  name?: string
  body?: string
  published_at?: string
  assets?: Array<{
    name: string
    size: number
    browser_download_url: string
    content_type?: string
    updated_at?: string
  }>
}

export const fetchLatestGitHubRelease = async (): Promise<LatestReleaseInfo> => {
  const response = await fetch(GITHUB_API_LATEST, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
    },
  })

  if (!response.ok) {
    throw new Error(`GitHub release fetch returned ${response.status}`)
  }

  const data = (await response.json()) as GitHubReleasePayload
  const tagName = data.tag_name || DEFAULT_RELEASE_INFO.tagName
  const version = tagName.replace(/^v/, '')
  const assets: ReleaseAsset[] = Array.isArray(data.assets)
    ? data.assets.map((item) => ({
        name: item.name,
        size: item.size,
        browserDownloadUrl: item.browser_download_url,
        contentType: item.content_type,
        updatedAt: item.updated_at,
      }))
    : DEFAULT_RELEASE_INFO.assets

  return {
    version: version || DEFAULT_RELEASE_INFO.version,
    tagName,
    name: data.name || `Otix ${tagName}`,
    publishedAt: data.published_at || DEFAULT_RELEASE_INFO.publishedAt,
    releaseNotes: data.body || DEFAULT_RELEASE_INFO.releaseNotes,
    assets: assets.length > 0 ? assets : DEFAULT_RELEASE_INFO.assets,
  }
}

export const useLatestRelease = (): {
  releaseInfo: LatestReleaseInfo
  options: PlatformDownloadOption[]
  isLoading: boolean
  isError: boolean
  refetch: () => void
} => {
  const { data, isLoading, isError, refetch } = useQuery<LatestReleaseInfo>({
    queryKey: ['otix-latest-release'],
    queryFn: fetchLatestGitHubRelease,
    initialData: DEFAULT_RELEASE_INFO,
    staleTime: 1000 * 60 * 15, // 15 minutes
    retry: 1,
  })

  const releaseInfo = data || DEFAULT_RELEASE_INFO
  const options = resolvePlatformOptions(releaseInfo)

  return {
    releaseInfo,
    options,
    isLoading,
    isError,
    refetch,
  }
}
