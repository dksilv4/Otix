import { describe, it, expect } from 'vitest'
import { formatTemplateSample, getGameFolderFromTemplate, SAMPLE_RELEASES } from '../utils/naming-template'

describe('frontend naming-template dedup', () => {
  const sample = SAMPLE_RELEASES[0] // Cyberpunk 2077 (2020), Platform PC

  it('deduplicates duplicate [{platform}] tags in folder-only template', () => {
    const formatted = formatTemplateSample('{Title} [{platform}] [{Platform}]', sample)
    expect(formatted).toBe('Cyberpunk 2077 [PC]')
  })

  it('deduplicates duplicate [{platform}] tags with file part', () => {
    const formatted = formatTemplateSample('{Title} [{platform}] [{Platform}]/{OriginalName}.{ext}', sample)
    expect(formatted).toBe('Cyberpunk 2077 [PC]/Cyberpunk.2077.v2.12.REPACK-ELAMIGOS.iso')
  })

  it('replaces lowercase {platform} and {title} case-insensitively', () => {
    const formatted = formatTemplateSample('{title} [{platform}]', sample)
    expect(formatted).toBe('Cyberpunk 2077 [PC]')
  })

  it('deduplicates duplicate tags in getGameFolderFromTemplate', () => {
    const folder = getGameFolderFromTemplate('{Title} [{Platform}] [{platform}]/{OriginalName}.{ext}', sample)
    expect(folder).toBe('Cyberpunk 2077 [PC]')
  })
})
