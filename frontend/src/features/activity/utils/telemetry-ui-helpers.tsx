import {
  Crosshair,
  Trophy,
  Gauge,
  Flag,
  Coins,
  Skull,
  Target,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { TelemetryStatItem } from '../types/telemetry-types'


/**
 * Returns the appropriate icon for a telemetry stat metric.
 */
export const getTelemetryStatIcon = (type?: TelemetryStatItem['iconType']): ReactNode => {
  switch (type) {
    case 'crosshair':
      return <Crosshair className="h-3 w-3 text-muted-foreground" />
    case 'deaths':
      return <Skull className="h-3 w-3 text-muted-foreground" />
    case 'assists':
      return <Target className="h-3 w-3 text-muted-foreground" />
    case 'trophy':
      return <Trophy className="h-3 w-3 text-chart-4" />
    case 'speed':
      return <Gauge className="h-3 w-3 text-muted-foreground" />
    case 'lap':
    case 'flag':
      return <Flag className="h-3 w-3 text-muted-foreground" />
    case 'gold':
      return <Coins className="h-3 w-3 text-chart-4" />
    default:
      return null
  }
}

/**
 * Returns faction styling classes for Counter-Strike 2 teams.
 */
export const getCs2TeamClasses = (teamLabel: string, isUserTeam: boolean) => {
  const isCt = teamLabel.toUpperCase().includes('CT')
  if (isCt) {
    return {
      bg: isUserTeam ? 'bg-cs2-ct/25' : 'bg-cs2-ct/15',
      text: 'text-cs2-ct',
      badge: 'bg-cs2-ct text-foreground',
      border: isUserTeam ? 'border-cs2-ct/40' : 'border-white/[0.04]',
    }
  }
  return {
    bg: isUserTeam ? 'bg-cs2-t/25' : 'bg-cs2-t/15',
    text: 'text-cs2-t',
    badge: 'bg-cs2-t text-foreground',
    border: isUserTeam ? 'border-cs2-t/40' : 'border-white/[0.04]',
  }
}

/**
 * Calculates standardized percentage and status for vitals.
 */
export const getCs2VitalsMetrics = (
  isDead: boolean,
  health?: number,
  armor?: number
) => {
  const hp = isDead ? 0 : Math.max(0, health ?? 0)
  const ap = isDead ? 0 : Math.max(0, armor ?? 0)
  const hpPercent = Math.min(100, Math.max(0, hp))
  const apPercent = Math.min(100, Math.max(0, ap))
  return { hp, ap, hpPercent, apPercent }
}

import { resolveCs2OfficialSvg } from './cs2-official-svg-icons'

/**
 * Extracts the clean base weapon name, stripping any skin name or qualifiers.
 * e.g. "MAG-7 | Insomnia" -> "MAG-7"
 * e.g. "M4A1-S | Printstream" -> "M4A1-S"
 * e.g. "★ Butterfly Knife | Fade" -> "Knife"
 */
export const getCs2BaseWeaponName = (weaponOrSkin?: string): string => {
  if (!weaponOrSkin) return ''
  // Strip skin portion if formatted as "Weapon | Skin"
  let base = weaponOrSkin.split('|')[0].trim()
  // Strip special prefixes like ★
  base = base.replace(/^[★\s]+/, '').trim()
  // Strip weapon_ prefix if raw GSI name
  base = base.replace(/^weapon_/i, '').trim()
  // Normalize known weapon identifiers
  const lower = base.toLowerCase()
  if (lower === 'm4a1' || lower === 'm4a1-s' || lower === 'm4a1_silencer' || lower === 'm4a1s') return 'M4A1-S'
  if (lower === 'm4a4') return 'M4A4'
  if (lower === 'ak47' || lower === 'ak-47') return 'AK-47'
  if (lower === 'usp' || lower === 'usp-s' || lower === 'usp_silencer' || lower === 'usps') return 'USP-S'
  if (lower === 'glock' || lower === 'glock-18') return 'Glock-18'
  if (lower === 'mag7' || lower === 'mag-7') return 'MAG-7'
  if (lower === 'awp') return 'AWP'
  if (lower.includes('knife') || lower.includes('bayonet') || lower.includes('karambit') || lower.includes('daggers')) return 'Knife'
  return base
}

/**
 * Official Counter-Strike 2 Weapon Glyphs.
 * Extracted directly from official CS2 game files (killfeed & buy-menu vector glyphs).
 * Strictly renders official base weapon icons (no custom skins).
 * In CS2 in-game HUD (see user screenshot), weapon silhouettes face left.
 */
export const Cs2OfficialWeaponIcon = ({
  weapon = 'M4A1-S',
  className = 'h-5 w-auto',
  active = false,
  slot = 1,
  faceLeft = true,
}: {
  weapon?: string
  skin?: string
  className?: string
  active?: boolean
  slot?: 1 | 2 | 3
  faceLeft?: boolean
}) => {
  const baseName = getCs2BaseWeaponName(weapon)
  const svgDef = resolveCs2OfficialSvg(baseName)
  const isC4 = baseName.toLowerCase().includes('c4')
  const flipClass = faceLeft && !isC4 && !className.includes('scale-x-') ? 'scale-x-[-1]' : ''
  return (
    <svg
      viewBox={svgDef.viewBox}
      fill="currentColor"
      className={`${className} ${flipClass} transition-all duration-200 select-none ${
        active
          ? 'text-[#70b5e8] drop-shadow-[0_0_8px_rgba(112,181,232,0.65)] filter brightness-110'
          : slot === 2
            ? 'text-white/70'
            : 'text-white/60'
      }`}
      xmlns="http://www.w3.org/2000/svg"
      dangerouslySetInnerHTML={{ __html: svgDef.innerSvg }}
    />
  )
}

/**
 * Alias to official vector weapon icon for backward compatibility.
 */
export const Cs2RealWeaponIcon = Cs2OfficialWeaponIcon

export const Cs2M4Silhoutte = ({ className = 'h-5 w-auto' }: { className?: string }) => (
  <Cs2OfficialWeaponIcon weapon="m4a1-s" className={className} />
)

export const Cs2Ak47Silhouette = ({ className = 'h-5 w-auto' }: { className?: string }) => (
  <Cs2OfficialWeaponIcon weapon="ak-47" className={className} />
)

export const Cs2ShotgunSilhouette = ({ className = 'h-5 w-auto' }: { className?: string }) => (
  <Cs2OfficialWeaponIcon weapon="mag-7" className={className} />
)

export const Cs2AwpSilhouette = ({ className = 'h-5 w-auto' }: { className?: string }) => (
  <Cs2OfficialWeaponIcon weapon="awp" className={className} />
)

export const Cs2RifleSilhouette = ({
  weapon = 'm4',
  className = 'h-5 w-auto',
}: {
  weapon?: string
  className?: string
}) => <Cs2OfficialWeaponIcon weapon={weapon} className={className} />

export const Cs2PistolSilhouette = ({ className = 'h-4 w-auto' }: { className?: string }) => (
  <Cs2OfficialWeaponIcon weapon="usp-s" className={className} />
)

export const Cs2DefuseKitIcon = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* CS2 Defusal Wire-Cutter Pliers Icon */}
    <path d="M19.7 5.3a2 2 0 0 0-2.8 0l-3.2 3.2-1.4-1.4 1.8-1.8a1 1 0 0 0-1.4-1.4l-1.8 1.8-1.4-1.4 3.2-3.2a2 2 0 0 0-2.8-2.8L6.2 3.9a4 4 0 0 0 0 5.7L8.6 12l-6.3 6.3a2 2 0 0 0 2.8 2.8l6.3-6.3 2.4 2.4a4 4 0 0 0 5.7 0l4.2-4.2a2 2 0 0 0 0-2.8l-3.2-3.2 3.2-3.2a2 2 0 0 0 0-2.8z" />
  </svg>
)

export const Cs2C4Icon = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* CS2 C4 Explosive Pack with digital timer */}
    <rect x="3" y="8" width="18" height="13" rx="2" fill="currentColor" opacity="0.9" />
    <rect x="7" y="4" width="3" height="4" rx="1" fill="currentColor" />
    <rect x="14" y="4" width="3" height="4" rx="1" fill="currentColor" />
    <rect x="6" y="11" width="12" height="5" rx="1" fill="#111" />
    <path d="M8 13.5h8" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

export const Cs2HealthCrossIcon = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* CS2 Red Plus Health Marker */}
    <rect x="2" y="2" width="20" height="20" rx="4" fill="#ef4444" />
    <path d="M12 6v12M6 12h12" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" />
  </svg>
)

export const Cs2HelmetIcon = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* CS2 Tactical Ballistic Helmet */}
    <path d="M12 3a9 9 0 0 0-9 9v3a2 2 0 0 0 2 2h1a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h1a2 2 0 0 0 2-2v-3a9 9 0 0 0-9-9zm-5 13a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0zm7 0a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0z" />
  </svg>
)

export const Cs2KnifeSilhouette = ({ className = 'h-3.5 w-auto' }: { className?: string }) => (
  <Cs2OfficialWeaponIcon weapon="knife" className={className} />
)

/**
 * Official Counter-Strike 2 C4 Explosive Vector Icon.
 * Uses the official Valve vector glyph extracted directly from CS2 game files.
 */
export const Cs2RealC4Icon = ({ className = 'h-3.5 w-3.5' }: { className?: string }) => (
  <Cs2OfficialWeaponIcon
    weapon="c4"
    faceLeft={false}
    className={`${className} text-rose-500 drop-shadow-[0_0_6px_rgba(244,63,94,0.6)]`}
  />
)

/**
 * Official Counter-Terrorist team emblem.
 */
export const Cs2CtLogo = ({ className = 'h-3.5 w-3.5' }: { className?: string }) => (
  <svg
    viewBox="0 0 256 256"
    className={className}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <ellipse cx="128" cy="128" rx="128" ry="128" fill="#5E7B93" />
    <path
      d="M128 32l72 32v64c0 48-32 92-72 104-40-12-72-56-72-104V64l72-32z"
      fill="#1E2A31"
    />
    <path
      d="M128 56l52 24v48c0 36-24 68-52 78-28-10-52-42-52-78V80l52-24z"
      fill="#5E7B93"
    />
    <path
      d="M128 76l12 24 26 4-19 18 5 26-24-13-24 13 5-26-19-18 26-4 12-24z"
      fill="#E6F2FC"
    />
  </svg>
)

/**
 * Official Terrorist team emblem.
 */
export const Cs2TLogo = ({ className = 'h-3.5 w-3.5' }: { className?: string }) => (
  <svg
    viewBox="0 0 128 128"
    className={className}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="64" cy="64" r="64" fill="#C99738" />
    <path
      d="M64 20l36 28-14 48H42L28 48 64 20z"
      fill="#2A241C"
    />
    <path
      d="M64 36l24 20-10 34H50L40 56 64 36z"
      fill="#E5B24E"
    />
    <path
      d="M64 48v44M54 70l20-16M74 70l-20-16"
      stroke="#2A241C"
      strokeWidth="4"
      strokeLinecap="round"
    />
  </svg>
)




