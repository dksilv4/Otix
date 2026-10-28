import { describe, it, expect } from 'vitest'
import {
  filterMediaRequests,
  formatRequestRelativeTime,
  getRequestServiceLabel,
  getRequestStatusBadgeClass,
  getRequestStatusLabel,
} from '../utils/requests'
import type { MediaRequestItem } from '../use-media-requests'

describe('requests-utils', () => {
  it('formats request status label correctly', () => {
    expect(getRequestStatusLabel('requested')).toBe('Requested')
    expect(getRequestStatusLabel('processing')).toBe('Processing')
    expect(getRequestStatusLabel('downloading')).toBe('Downloading')
    expect(getRequestStatusLabel('available')).toBe('Available')
    expect(getRequestStatusLabel('completed')).toBe('Available')
    expect(getRequestStatusLabel('failed')).toBe('Failed')
  })

  it('provides theme-token based badge classes without hardcoded colors', () => {
    const availableClass = getRequestStatusBadgeClass('available')
    expect(availableClass).toContain('text-primary')
    expect(availableClass).not.toMatch(/#[0-9a-fA-F]{3,6}/)

    const failedClass = getRequestStatusBadgeClass('failed')
    expect(failedClass).toContain('text-destructive')
    expect(failedClass).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })

  it('formats relative times gracefully', () => {
    expect(formatRequestRelativeTime(null)).toBe('')
    const recent = new Date(Date.now() - 1000 * 30).toISOString()
    expect(formatRequestRelativeTime(recent)).toBe('Just now')

    const twoHoursAgo = new Date(Date.now() - 1000 * 60 * 125).toISOString()
    expect(formatRequestRelativeTime(twoHoursAgo)).toBe('2h ago')
  })

  it('determines service label accurately', () => {
    expect(getRequestServiceLabel('radarr', 'movie')).toBe('Radarr')
    expect(getRequestServiceLabel('sonarr', 'show')).toBe('Sonarr')
    expect(getRequestServiceLabel('usenet', 'game')).toBe('SABnzbd')
    expect(getRequestServiceLabel('', 'movie')).toBe('Radarr')
  })

  it('filters requests by query and media type', () => {
    const items: MediaRequestItem[] = [
      {
        id: 1,
        userId: 1,
        mediaType: 'movie',
        title: 'Gladiator II',
        service: 'radarr',
        status: 'requested',
        progress: 0,
        searchNow: true,
        monitored: true,
      },
      {
        id: 2,
        userId: 1,
        mediaType: 'show',
        title: 'Shogun',
        service: 'sonarr',
        status: 'downloading',
        progress: 50,
        searchNow: true,
        monitored: true,
      },
    ]

    expect(filterMediaRequests(items, '', 'all')).toHaveLength(2)
    expect(filterMediaRequests(items, '', 'movie')).toHaveLength(1)
    expect(filterMediaRequests(items, '', 'movie')[0].title).toBe('Gladiator II')
    expect(filterMediaRequests(items, 'shogun', 'all')).toHaveLength(1)
    expect(filterMediaRequests(items, 'nonexistent', 'all')).toHaveLength(0)
  })
})
