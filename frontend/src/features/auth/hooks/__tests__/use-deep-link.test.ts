import { describe, expect, it } from 'vitest'
import { parseDeepLinkUrl } from '../use-deep-link'

describe('deep link parser', () => {
  it('parses oauth callback deep links with tokens and query parameters', () => {
    const parsed = parseDeepLinkUrl('otix://auth/callback/google-login?success=true&accessToken=token123&source=mobile')
    expect(parsed).not.toBeNull()
    expect(parsed?.action).toBe('auth/callback/google-login')
    expect(parsed?.params.success).toBe('true')
    expect(parsed?.params.accessToken).toBe('token123')
    expect(parsed?.params.source).toBe('mobile')
  })

  it('parses app routing links', () => {
    const parsed = parseDeepLinkUrl('otix://open?path=%2Fmedia%2Fmovie%2F123')
    expect(parsed).not.toBeNull()
    expect(parsed?.action).toBe('open')
    expect(parsed?.params.path).toBe('/media/movie/123')
  })

  it('handles urls without query parameters', () => {
    const parsed = parseDeepLinkUrl('otix://settings/integrations')
    expect(parsed).not.toBeNull()
    expect(parsed?.action).toBe('settings/integrations')
    expect(parsed?.params).toEqual({})
  })
})
