import { describe, it, expect, vi } from 'vitest'

describe('desktop/main.ts Header Interception Adversarial Testing', () => {
  // Re-create the exact handler defined in desktop/main.ts lines 588-604
  const setupInterceptor = () => {
    let registeredFilter: any = null
    let registeredListener: ((details: any, callback: any) => void) | null = null

    const mockSession = {
      webRequest: {
        onBeforeSendHeaders: vi.fn((filter: any, listener: any) => {
          registeredFilter = filter
          registeredListener = listener
        }),
      },
    }

    const applyYouTubeHeaderInterceptor = (targetSession: any) => {
      targetSession.webRequest.onBeforeSendHeaders(
        {
          urls: [
            '*://*.youtube.com/*',
            '*://*.youtube-nocookie.com/*',
            '*://*.googlevideo.com/*',
          ],
        },
        (details: any, callback: any) => {
          const requestHeaders = details.requestHeaders || {}
          requestHeaders['Referer'] = 'https://www.youtube.com/'
          requestHeaders['Origin'] = 'https://www.youtube.com'
          callback({ cancel: false, requestHeaders })
        },
      )
    }

    applyYouTubeHeaderInterceptor(mockSession)

    return {
      filter: registeredFilter,
      listener: registeredListener!,
    }
  }

  it('registers correct URL patterns for YouTube and Google Video', () => {
    const { filter } = setupInterceptor()
    expect(filter.urls).toEqual([
      '*://*.youtube.com/*',
      '*://*.youtube-nocookie.com/*',
      '*://*.googlevideo.com/*',
    ])
  })

  it('sets Referer and Origin when requestHeaders is empty or undefined', () => {
    const { listener } = setupInterceptor()

    // Test with undefined requestHeaders
    const callback1 = vi.fn()
    listener({ url: 'https://www.youtube-nocookie.com/embed/test', requestHeaders: undefined }, callback1)

    expect(callback1).toHaveBeenCalledWith({
      cancel: false,
      requestHeaders: {
        Referer: 'https://www.youtube.com/',
        Origin: 'https://www.youtube.com',
      },
    })

    // Test with empty object
    const callback2 = vi.fn()
    listener({ url: 'https://www.youtube.com/watch', requestHeaders: {} }, callback2)

    expect(callback2).toHaveBeenCalledWith({
      cancel: false,
      requestHeaders: {
        Referer: 'https://www.youtube.com/',
        Origin: 'https://www.youtube.com',
      },
    })
  })

  it('reveals header casing behavior when headers contain lowercase referer/origin', () => {
    const { listener } = setupInterceptor()

    const details = {
      url: 'https://www.youtube-nocookie.com/embed/test',
      requestHeaders: {
        referer: 'app://otix',
        origin: 'app://otix',
        'user-agent': 'OtixDesktop/1.0',
      },
    }

    const callback = vi.fn()
    listener(details, callback)

    const resultHeaders = callback.mock.calls[0][0].requestHeaders

    // EMPIRICAL OBSERVATION:
    // Notice that setting requestHeaders['Referer'] and ['Origin'] does NOT remove
    // the existing lowercase 'referer' and 'origin'!
    expect(resultHeaders['Referer']).toBe('https://www.youtube.com/')
    expect(resultHeaders['Origin']).toBe('https://www.youtube.com')
    expect(resultHeaders['referer']).toBe('app://otix')
    expect(resultHeaders['origin']).toBe('app://otix')
  })

  it('throws TypeError if details parameter is undefined (lack of optional chaining)', () => {
    const { listener } = setupInterceptor()
    const callback = vi.fn()

    expect(() => {
      listener(undefined as any, callback)
    }).toThrow(TypeError)
  })
})
