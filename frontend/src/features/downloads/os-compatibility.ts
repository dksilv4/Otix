export type ClientOperatingSystem = 'windows' | 'macos' | 'linux' | 'unknown'

export interface GamePlatformEntry {
  platform?: {
    name?: string | null
    slug?: string | null
  } | null
}

export interface InstallCompatibility {
  compatible: boolean
  verified: boolean
  clientOs: ClientOperatingSystem
  supportedOs: ClientOperatingSystem[]
  button: string
  title: string
}

/**
 * Temporary: show scanned releases as installable on the current OS while
 * incompatible styling is designed.
 */
export const PREVIEW_INCOMPATIBLE_AS_AVAILABLE = true

export function treatInstallAsAvailable(compatibility: InstallCompatibility): boolean {
  return PREVIEW_INCOMPATIBLE_AS_AVAILABLE || compatibility.compatible
}

const OS_LABELS: Record<ClientOperatingSystem, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  unknown: 'Unknown OS',
}

function platformOperatingSystem(value: string): ClientOperatingSystem {
  const platform = value.toLowerCase().replace(/[_-]+/g, ' ')
  if (
    platform === 'win' ||
    platform === 'windows' ||
    platform.includes('microsoft windows')
  ) {
    return 'windows'
  }
  if (
    platform === 'mac' ||
    platform === 'macos' ||
    platform.includes('mac os') ||
    platform.includes('os x')
  ) {
    return 'macos'
  }
  if (platform === 'linux' || platform.includes('linux')) return 'linux'
  return 'unknown'
}

export function detectClientOperatingSystem(
  userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '',
): ClientOperatingSystem {
  const ua = userAgent.toLowerCase()
  if (ua.includes('windows')) return 'windows'
  if (ua.includes('mac os') || ua.includes('macintosh')) return 'macos'
  if (ua.includes('linux') && !ua.includes('android')) return 'linux'
  return 'unknown'
}

export function gameInstallCompatibility(
  platforms: GamePlatformEntry[] | null | undefined,
  clientOs = detectClientOperatingSystem(),
): InstallCompatibility {
  const supportedOs = Array.from(
    new Set(
      (platforms || [])
        .flatMap((entry) => [
          platformOperatingSystem(entry.platform?.slug || ''),
          platformOperatingSystem(entry.platform?.name || ''),
        ])
        .filter((os): os is Exclude<ClientOperatingSystem, 'unknown'> => os !== 'unknown'),
    ),
  )

  if (clientOs === 'unknown') {
    return {
      compatible: false,
      verified: false,
      clientOs,
      supportedOs,
      button: 'OS unknown',
      title: 'Operating system could not be detected.',
    }
  }

  if (supportedOs.length === 0) {
    return {
      compatible: false,
      verified: false,
      clientOs,
      supportedOs,
      button: 'Compatibility unknown',
      title: `No ${OS_LABELS[clientOs]} compatibility information.`,
    }
  }

  const compatible = supportedOs.includes(clientOs)
  const supportedLabel = supportedOs.map((os) => OS_LABELS[os]).join(', ')
  return {
    compatible,
    verified: true,
    clientOs,
    supportedOs,
    button: compatible ? 'Install' : `Not for ${OS_LABELS[clientOs]}`,
    title: compatible
      ? `Compatible with ${OS_LABELS[clientOs]}.`
      : `Requires ${supportedLabel}.`,
  }
}
