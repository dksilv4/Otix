import type { ComponentType, SVGProps } from 'react'

import PlayStationLogo from '@/assets/platform-logos/playstation.svg?react'
import PS1Logo from '@/assets/platform-logos/ps1.svg?react'
import PS2Logo from '@/assets/platform-logos/ps2.svg?react'
import PS3Logo from '@/assets/platform-logos/ps3.svg?react'
import PS4Logo from '@/assets/platform-logos/ps4.svg?react'
import PS5Logo from '@/assets/platform-logos/ps5.svg?react'
import PSPLogo from '@/assets/platform-logos/psp.svg?react'
import PSVitaLogo from '@/assets/platform-logos/psvita.svg?react'

import XboxLogo from '@/assets/platform-logos/xbox.svg?react'
import Xbox360Logo from '@/assets/platform-logos/xbox360.svg?react'

import NintendoLogo from '@/assets/platform-logos/nintendo.svg?react'
import SwitchLogo from '@/assets/platform-logos/switch.svg?react'
import GameCubeLogo from '@/assets/platform-logos/gamecube.svg?react'
import WiiLogo from '@/assets/platform-logos/wii.svg?react'
import WiiULogo from '@/assets/platform-logos/wiiu.svg?react'
import ThreeDSLogo from '@/assets/platform-logos/3ds.svg?react'
import NDSLogo from '@/assets/platform-logos/nds.svg?react'
import N64Logo from '@/assets/platform-logos/n64.svg?react'
import SNESLogo from '@/assets/platform-logos/snes.svg?react'
import NESLogo from '@/assets/platform-logos/nes.svg?react'
import GameBoyLogo from '@/assets/platform-logos/gameboy.svg?react'
import GBCLogo from '@/assets/platform-logos/gbc.svg?react'
import GBALogo from '@/assets/platform-logos/gba.svg?react'

import SegaLogo from '@/assets/platform-logos/sega.svg?react'
import GenesisLogo from '@/assets/platform-logos/genesis.svg?react'
import DreamcastLogo from '@/assets/platform-logos/dreamcast.svg?react'
import SaturnLogo from '@/assets/platform-logos/saturn.svg?react'
import MasterSystemLogo from '@/assets/platform-logos/mastersystem.svg?react'
import GameGearLogo from '@/assets/platform-logos/gamegear.svg?react'

import SteamLogo from '@/assets/platform-logos/steam.svg?react'
import EpicLogo from '@/assets/platform-logos/epic.svg?react'
import GOGLogo from '@/assets/platform-logos/gog.svg?react'
import BattleNetLogo from '@/assets/platform-logos/battlenet.svg?react'
import OriginLogo from '@/assets/platform-logos/origin.svg?react'
import EALogo from '@/assets/platform-logos/ea.svg?react'
import UbisoftLogo from '@/assets/platform-logos/ubisoft.svg?react'
import RiotLogo from '@/assets/platform-logos/riot.svg?react'
import ItchLogo from '@/assets/platform-logos/itch.svg?react'

import WindowsLogo from '@/assets/platform-logos/windows.svg?react'
import MacLogo from '@/assets/platform-logos/mac.svg?react'
import LinuxLogo from '@/assets/platform-logos/linux.svg?react'
import AndroidLogo from '@/assets/platform-logos/android.svg?react'
import IOSLogo from '@/assets/platform-logos/ios.svg?react'
import ArcadeLogo from '@/assets/platform-logos/arcade.svg?react'
import ISOLogo from '@/assets/platform-logos/iso.svg?react'
import ServerLogo from '@/assets/platform-logos/server.svg?react'

export type SvgIconComponent = ComponentType<SVGProps<SVGSVGElement>>

export const isPS5Slug = (slug: string): boolean => {
  const s = (slug || '').toLowerCase().trim().replace(/_/g, '-')
  return s === 'ps5' || s === 'playstation-5' || s === 'playstation5'
}

export const isPS4Slug = (slug: string): boolean => {
  const s = (slug || '').toLowerCase().trim().replace(/_/g, '-')
  return s === 'ps4' || s === 'playstation-4' || s === 'playstation4'
}

export const getPlatformIconComponent = (slug: string): SvgIconComponent | null => {
  const s = (slug || '').toLowerCase().trim().replace(/_/g, '-')

  // PlayStation series
  if (s === 'ps5' || s === 'playstation-5' || s === 'playstation5') return PS5Logo
  if (s === 'ps4' || s === 'playstation-4' || s === 'playstation4') return PS4Logo
  if (s === 'ps3' || s === 'playstation-3' || s === 'playstation3') return PS3Logo
  if (s === 'ps2' || s === 'playstation-2' || s === 'playstation2') return PS2Logo
  if (s === 'ps1' || s === 'playstation-1' || s === 'playstation1' || s === 'psone') return PS1Logo
  if (s === 'psp' || s.includes('playstation-portable')) return PSPLogo
  if (s === 'psvita' || s === 'vita' || s.includes('playstation-vita')) return PSVitaLogo
  if (s.includes('playstation') || s === 'ps' || s === 'psn') return PlayStationLogo

  // Xbox series
  if (s === 'xbox360' || s === 'xbox-360') return Xbox360Logo
  if (s.includes('xbox') || s.includes('game-pass') || s === 'microsoft') return XboxLogo

  // Nintendo series
  if (s === 'switch' || s.includes('nintendo-switch')) return SwitchLogo
  if (s === 'n64' || s.includes('nintendo-64')) return N64Logo
  if (s === 'gamecube' || s.includes('gamecube') || s === 'gc') return GameCubeLogo
  if (s === 'wiiu' || s === 'wii-u') return WiiULogo
  if (s === 'wii') return WiiLogo
  if (s === '3ds' || s.includes('3ds')) return ThreeDSLogo
  if (s === 'nds' || s === 'ds' || s.includes('nintendo-ds')) return NDSLogo
  if (s === 'gba' || s.includes('advance')) return GBALogo
  if (s === 'gbc' || s.includes('color')) return GBCLogo
  if (s === 'gb' || s.includes('game-boy') || s.includes('gameboy')) return GameBoyLogo
  if (s === 'snes' || s.includes('super-nintendo') || s.includes('super-famicom')) return SNESLogo
  if (s === 'nes' || s.includes('famicom')) return NESLogo
  if (s.includes('nintendo')) return NintendoLogo

  // Sega series
  if (s === 'genesis' || s.includes('mega-drive')) return GenesisLogo
  if (s === 'dreamcast') return DreamcastLogo
  if (s === 'saturn' || s.includes('sega-saturn')) return SaturnLogo
  if (s === 'mastersystem' || s.includes('master-system')) return MasterSystemLogo
  if (s === 'gamegear' || s.includes('game-gear')) return GameGearLogo
  if (s.includes('sega')) return SegaLogo

  // Stores & Clients
  if (s === 'steam') return SteamLogo
  if (s === 'epic' || s === 'egs' || s.includes('epic-games')) return EpicLogo
  if (s === 'gog' || s.includes('gog-galaxy')) return GOGLogo
  if (s === 'battlenet' || s === 'bnet' || s === 'blizzard') return BattleNetLogo
  if (s === 'origin') return OriginLogo
  if (s === 'ea' || s.includes('ea-app')) return EALogo
  if (s === 'ubisoft' || s === 'uplay') return UbisoftLogo
  if (s === 'riot' || s.includes('riot-games')) return RiotLogo
  if (s === 'itch' || s.includes('itch-io') || s.includes('itchio')) return ItchLogo

  // Operating Systems & General
  if (s === 'pc' || s.includes('windows')) return WindowsLogo
  if (s.includes('mac') || s.includes('apple') || s.includes('osx')) return MacLogo
  if (s.includes('linux')) return LinuxLogo
  if (s.includes('android')) return AndroidLogo
  if (s.includes('ios') || s.includes('iphone') || s.includes('ipad')) return IOSLogo
  if (s === 'arcade' || s.includes('mame')) return ArcadeLogo
  if (s === 'iso' || s === 'rom' || s === 'disc') return ISOLogo
  if (s === 'server') return ServerLogo

  return null
}
