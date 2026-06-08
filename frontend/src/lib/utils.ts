// TODO: DEPRECATE cn()
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { getDesktopPlatform } from "./desktop-platform"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

export const isDev = import.meta.env.DEV
export const isProd = import.meta.env.PROD
export const isTest = import.meta.env.TEST

/** Human-readable OS name. Used in >1 place, so lives in utils. */
export const osName: string = (() => {
  const plat = getDesktopPlatform().platform
  if (plat === 'darwin') return 'macOS'
  if (plat === 'win32') return 'Windows'
  return 'Linux'
})()



