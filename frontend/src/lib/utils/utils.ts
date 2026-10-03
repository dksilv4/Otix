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

/**
 * Formats installed physical RAM capacity to standard manufactured tiers (e.g. 8 GB, 16 GB, 32 GB, 64 GB),
 * accounting for OS hardware reservation (where a 32 GB system reports ~31.1 GB usable).
 */
export function formatRAM(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || bytes <= 0) return '0 B'
  const gib = bytes / (1024 * 1024 * 1024)
  if (gib < 0.9) {
    const mib = Math.round(bytes / (1024 * 1024))
    return `${mib} MB`
  }
  const tiers = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 768, 1024]
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i]
    const prev = i === 0 ? 0 : tiers[i - 1]
    const minBound = Math.max(prev + 0.1, tier * 0.8)
    const maxBound = tier * 1.05
    if (gib >= minBound && gib <= maxBound) {
      return `${tier} GB`
    }
  }
  return `${Math.round(gib)} GB`
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

/** Upscale TMDB/IGDB/Steam image URLs for hero backdrop use. */
export function heroImage(url: string): string {
  return url
    // TMDB — upscale any size to w1280 (skip /original/ which is already max)
    .replace(/\/w(92|154|185|342|500|780)\//, '/w1280/')
    // IGDB — upscale to t_1080p (highest non-original tier)
    .replace(/t_(cover_small|cover_big|screenshot_med|screenshot_big|screenshot_huge|thumb|720p)/g, 't_1080p')
    // Steam — replace small/medium headers with full-quality
    .replace(/\/header\.jpg$/, '/library_600x900.jpg')
}

/** Human-readable OS name. Used in >1 place, so lives in utils. */
export const osName: string = (() => {
  const plat = getDesktopPlatform().platform
  if (plat === 'darwin') return 'macOS'
  if (plat === 'win32') return 'Windows'
  return 'Linux'
})()



