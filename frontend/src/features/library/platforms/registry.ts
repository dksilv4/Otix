// TODO: Review this file
import type { User } from "@/features/auth/types"
import type { PlatformDefinition } from "./types"

const platformMap = new Map<string, PlatformDefinition>()

export function registerPlatform(def: PlatformDefinition): void {
  platformMap.set(def.id, def)
}

export function getPlatform(id: string): PlatformDefinition | undefined {
  return platformMap.get(id)
}

export function getAllPlatforms(): PlatformDefinition[] {
  return Array.from(platformMap.values())
}

export function getConnectedPlatforms(user: User | null): PlatformDefinition[] {
  return getAllPlatforms().filter((p) => p.requiresConnection(user))
}

export function getPlatformTabs(user: User | null) {
  return getConnectedPlatforms(user).map((p) => ({
    id: p.id,
    label: p.label,
    icon: p.icon,
  }))
}

export function clearRegistry(): void {
  platformMap.clear()
}
