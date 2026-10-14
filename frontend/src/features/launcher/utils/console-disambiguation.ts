import { PLATFORM_LABELS } from '@/constants/games'

export interface ConsoleOptionInfo {
  platform: string
  label: string
  generation: string
  vendor: 'Sony' | 'Nintendo' | 'Sega' | 'Microsoft' | 'Arcade' | 'Other'
}

const CONSOLE_METADATA: Record<string, { generation: string; vendor: 'Sony' | 'Nintendo' | 'Sega' | 'Microsoft' | 'Arcade' | 'Other' }> = {
  ps1: { generation: '5th Gen', vendor: 'Sony' },
  ps2: { generation: '6th Gen', vendor: 'Sony' },
  ps3: { generation: '7th Gen', vendor: 'Sony' },
  psp: { generation: 'Handheld', vendor: 'Sony' },
  psvita: { generation: 'Handheld', vendor: 'Sony' },
  nes: { generation: '3rd Gen', vendor: 'Nintendo' },
  snes: { generation: '4th Gen', vendor: 'Nintendo' },
  n64: { generation: '5th Gen', vendor: 'Nintendo' },
  gamecube: { generation: '6th Gen', vendor: 'Nintendo' },
  wii: { generation: '7th Gen', vendor: 'Nintendo' },
  wiiu: { generation: '8th Gen', vendor: 'Nintendo' },
  switch: { generation: 'Hybrid', vendor: 'Nintendo' },
  gb: { generation: 'Handheld', vendor: 'Nintendo' },
  gbc: { generation: 'Handheld', vendor: 'Nintendo' },
  gba: { generation: 'Handheld', vendor: 'Nintendo' },
  nds: { generation: 'Handheld', vendor: 'Nintendo' },
  '3ds': { generation: 'Handheld', vendor: 'Nintendo' },
  genesis: { generation: '4th Gen', vendor: 'Sega' },
  mastersystem: { generation: '3rd Gen', vendor: 'Sega' },
  gamegear: { generation: 'Handheld', vendor: 'Sega' },
  saturn: { generation: '5th Gen', vendor: 'Sega' },
  dreamcast: { generation: '6th Gen', vendor: 'Sega' },
  xbox: { generation: '6th Gen', vendor: 'Microsoft' },
  xbox360: { generation: '7th Gen', vendor: 'Microsoft' },
  arcade: { generation: 'Arcade', vendor: 'Arcade' },
}

export const isConsolePlatform = (platform?: string): boolean => {
  return !!platform && platform in CONSOLE_METADATA
}

export const getConsoleOptionInfo = (platform: string): ConsoleOptionInfo => {
  const meta = CONSOLE_METADATA[platform] || { generation: 'Console', vendor: 'Other' }
  const label = PLATFORM_LABELS[platform] || platform.toUpperCase()
  return {
    platform,
    label,
    generation: meta.generation,
    vendor: meta.vendor,
  }
}
