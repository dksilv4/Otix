// TODO: DEPRECATE cn()
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { getDesktopPlatform } from "../desktop/platform"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return '0:00'
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

import { IS_DEV, IS_PROD, IS_TEST } from "../config/config"

export const isDev = IS_DEV
export const isProd = IS_PROD
export const isTest = IS_TEST

export function formatTime(ms: number): string {
  return formatDuration(ms)
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'] as const
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/** Human-readable OS name. Used in >1 place, so lives in utils. */
export const osName: string = (() => {
  const plat = getDesktopPlatform().platform
  if (plat === 'darwin') return 'macOS'
  if (plat === 'win32') return 'Windows'
  return 'Linux'
})()



