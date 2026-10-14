import type { DetectedEmulator } from '@/lib/desktop/api'

export interface KeyConsoleItem {
  id: string
  label: string
}

export const KEY_CONSOLE_PLATFORMS: KeyConsoleItem[] = [
  { id: 'snes', label: 'Super Nintendo' },
  { id: 'nes', label: 'NES' },
  { id: 'gba', label: 'Game Boy Advance' },
  { id: 'n64', label: 'Nintendo 64' },
  { id: 'gamecube', label: 'GameCube' },
  { id: 'wii', label: 'Wii' },
  { id: 'wiiu', label: 'Wii U' },
  { id: 'switch', label: 'Nintendo Switch' },
  { id: 'ps1', label: 'PlayStation' },
  { id: 'ps2', label: 'PlayStation 2' },
  { id: 'ps3', label: 'PlayStation 3' },
  { id: 'psp', label: 'PSP' },
  { id: 'nds', label: 'Nintendo DS' },
  { id: '3ds', label: 'Nintendo 3DS' },
  { id: 'genesis', label: 'Sega Genesis' },
  { id: 'dreamcast', label: 'Dreamcast' },
  { id: 'xbox360', label: 'Xbox 360' },
  { id: 'arcade', label: 'Arcade' },
]

export const getEmulatorsSupportingPlatform = (
  emulators: DetectedEmulator[],
  platform: string,
): DetectedEmulator[] => {
  return emulators.filter((e) => e.definition.platforms.includes(platform))
}
