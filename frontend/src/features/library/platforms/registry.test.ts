// TODO: Review this file
import { describe, expect, it, beforeEach } from "vitest"
import { registerPlatform, getPlatform, getAllPlatforms, getConnectedPlatforms, getPlatformTabs, clearRegistry } from "./index"
import type { PlatformDefinition } from "./types"
import type { User } from "@/features/auth/types"

function makePlatform(id: string, requiresConnection: (user: User | null) => boolean): PlatformDefinition {
  return {
    id,
    label: id.toUpperCase(),
    icon: null,
    requiresConnection,
    EmptyState: () => null,
    OverviewModule: () => null,
    Content: () => null,
  }
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "1",
    email: "test@test.com",
    username: "test",
    isVerified: true,
    twoFactorEnabled: false,
    ...overrides,
  }
}

describe("Platform registry", () => {
  beforeEach(() => {
    clearRegistry()
  })

  it("registers and retrieves a platform", () => {
    const p = makePlatform("test-platform", () => true)
    registerPlatform(p)
    expect(getPlatform("test-platform")).toBe(p)
  })

  it("returns undefined for unknown platform", () => {
    expect(getPlatform("nonexistent")).toBeUndefined()
  })

  it("lists all registered platforms", () => {
    const p1 = makePlatform("p1", () => true)
    const p2 = makePlatform("p2", () => false)
    registerPlatform(p1)
    registerPlatform(p2)

    const all = getAllPlatforms()
    expect(all).toContain(p1)
    expect(all).toContain(p2)
  })

  it("getConnectedPlatforms filters by connection check", () => {
    registerPlatform(makePlatform("connected", (u) => !!u?.steamId))
    registerPlatform(makePlatform("disconnected", () => false))
    registerPlatform(makePlatform("always", () => true))

    const user = makeUser({ steamId: "12345" })
    const connected = getConnectedPlatforms(user)
    const ids = connected.map((p) => p.id)

    expect(ids).toContain("connected")
    expect(ids).toContain("always")
    expect(ids).not.toContain("disconnected")
  })

  it("getConnectedPlatforms returns empty when user is null", () => {
    registerPlatform(makePlatform("needs-user", (u) => !!u))
    registerPlatform(makePlatform("always-true", () => true))

    const connected = getConnectedPlatforms(null)
    expect(connected.map((p) => p.id)).toEqual(["always-true"])
  })

  it("getPlatformTabs returns tab entries for connected platforms", () => {
    registerPlatform(makePlatform("spotify", (u) => !!u?.spotifyId))

    const user = makeUser({ spotifyId: "spotify-123" })
    const tabs = getPlatformTabs(user)

    expect(tabs).toHaveLength(1)
    expect(tabs[0].id).toBe("spotify")
    expect(tabs[0].label).toBe("SPOTIFY")
  })

  it("getPlatformTabs returns empty when no platforms are connected", () => {
    registerPlatform(makePlatform("needs-steam", (u) => !!u?.steamId))
    const tabs = getPlatformTabs(makeUser())
    expect(tabs).toHaveLength(0)
  })
})
