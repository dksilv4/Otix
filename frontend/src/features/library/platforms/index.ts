// TODO: Review this file
// Import platform modules so they self-register via registerPlatform()
import "./spotify"
import "./steam"
import "./plex"

export { getPlatform, getAllPlatforms, getConnectedPlatforms, getPlatformTabs } from "./registry"
export type { PlatformDefinition, PlatformStatus, ScanResult, PlatformEmptyStateProps } from "./types"
