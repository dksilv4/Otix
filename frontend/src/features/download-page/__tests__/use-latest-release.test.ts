import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { createWrapper } from '@/test-utils'
import {
  fetchLatestGitHubRelease,
  useLatestRelease,
} from '../hooks/use-latest-release'
import { DEFAULT_RELEASE_INFO } from '../constants/downloads-data'

describe('use-latest-release', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetchLatestGitHubRelease parses successful GitHub API response', async () => {
    const mockPayload = {
      tag_name: 'v0.1.25',
      name: 'Otix v0.1.25',
      body: '- Fixed direct bitstream audio',
      published_at: '2026-10-22T00:00:00Z',
      assets: [
        {
          name: 'Otix-Setup-0.1.25.exe',
          size: 130000000,
          browser_download_url:
            'https://github.com/dksilv4/Otix/releases/download/v0.1.25/Otix-Setup-0.1.25.exe',
        },
      ],
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockPayload,
    } as Response)

    const result = await fetchLatestGitHubRelease()
    expect(result.version).toBe('0.1.25')
    expect(result.tagName).toBe('v0.1.25')
    expect(result.assets.length).toBe(1)
    expect(result.assets[0].name).toBe('Otix-Setup-0.1.25.exe')
  })

  it('useLatestRelease provides default release info initially', () => {
    const Wrapper = createWrapper()
    const { result } = renderHook(() => useLatestRelease(), {
      wrapper: Wrapper,
    })

    expect(result.current.releaseInfo.version).toBe(DEFAULT_RELEASE_INFO.version)
    expect(result.current.options.length).toBeGreaterThan(0)
  })
})
