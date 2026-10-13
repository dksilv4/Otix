import { describe, it, expect } from 'vitest'

describe('MediaDetailPage import and router initialization', () => {
  it('imports router and media detail page', async () => {
    const mediaRouter = await import('@media/router')
    expect(mediaRouter.createMediaRoutes).toBeDefined()
    const page = await import('@media/pages/media-detail-page')
    expect(page.MediaDetailPage).toBeDefined()
  }, 20000)

  it('initializes the application router without TDZ errors', async () => {
    const { router } = await import('@/lib/router')
    expect(router).toBeDefined()
    expect(router.routesById['/media/$mediaType/$mediaId']).toBeDefined()
  }, 20000)
})
