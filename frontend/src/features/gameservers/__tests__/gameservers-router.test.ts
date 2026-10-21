import { describe, it, expect, vi } from 'vitest'
import { createGameServersRoutes } from '../router'
import type { AnyRoute } from '@tanstack/react-router'

vi.mock('@tanstack/react-router', () => ({
  createRoute: (config: Record<string, unknown>) => ({ ...config, isRoute: true }),
  redirect: (config: Record<string, unknown>) => ({ isRedirect: true, ...config }),
}))

describe('createGameServersRoutes', () => {
  it('creates the required server routes', () => {
    const fakeRoot = { id: 'root' } as unknown as AnyRoute
    const routes = createGameServersRoutes(fakeRoot)

    expect(routes).toHaveLength(3)

    const paths = routes.map((r) => (r as unknown as { path: string }).path)
    expect(paths).toContain('/servers/join/$code')
    expect(paths).toContain('/servers/join')
    expect(paths).toContain('/servers')
  })

  it('redirects /servers and /servers/join to settings game servers', () => {
    const fakeRoot = { id: 'root' } as unknown as AnyRoute
    const routes = createGameServersRoutes(fakeRoot)

    const joinRedirect = routes.find((r) => (r as unknown as { path: string }).path === '/servers/join')
    const serversRedirect = routes.find((r) => (r as unknown as { path: string }).path === '/servers')

    expect(joinRedirect).toBeDefined()
    expect(serversRedirect).toBeDefined()

    expect(() => (joinRedirect as unknown as { beforeLoad: () => void }).beforeLoad()).toThrow()
    expect(() => (serversRedirect as unknown as { beforeLoad: () => void }).beforeLoad()).toThrow()
  })
})
