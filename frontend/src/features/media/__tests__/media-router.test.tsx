import { describe, it, expect } from 'vitest'

describe('MediaDetailPage import and router initialization', () => {
  it('imports router and media detail page', async () => {
    const mediaRouter = await import('@media/router')
    expect(mediaRouter.createMediaRoutes).toBeDefined()
    const page = await import('@media/pages/media-detail-page')
    expect(page.MediaDetailPage).toBeDefined()
  }, 20000)

  it('initializes the application router without TDZ errors and with component defined', async () => {
    const { router } = await import('@/lib/router')
    expect(router).toBeDefined()
    const mediaDetailRoute = router.routesById['/media/$mediaType/$mediaId']
    expect(mediaDetailRoute).toBeDefined()
    expect(mediaDetailRoute.options.component).toBeDefined()
  }, 20000)
})
