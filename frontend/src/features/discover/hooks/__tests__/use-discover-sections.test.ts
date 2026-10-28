import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDiscoverSections } from '../use-discover-sections'
import { DISCOVER_SECTIONS_STORAGE_KEY } from '../../utils/sections'

describe('useDiscoverSections', () => {
  beforeEach(() => {
    window.localStorage.removeItem(DISCOVER_SECTIONS_STORAGE_KEY)
  })

  it('initializes with default sections and fan_spotlight near the top', () => {
    const { result } = renderHook(() => useDiscoverSections())
    expect(result.current.sections.length).toBeGreaterThan(0)
    expect(result.current.sections[0].id).toBe('fan_spotlight')
    expect(result.current.activeIntent).toBe('all')
    expect(result.current.isCustomizeOpen).toBe(false)
  })

  it('places player_activity directly below continue_watching in default order', () => {
    const { result } = renderHook(() => useDiscoverSections())
    const continueWatchingIndex = result.current.sections.findIndex((s) => s.id === 'continue_watching')
    const playerActivityIndex = result.current.sections.findIndex((s) => s.id === 'player_activity')
    expect(continueWatchingIndex).toBeGreaterThan(-1)
    expect(playerActivityIndex).toBe(continueWatchingIndex + 1)
  })

  it('toggles section visibility and persists to localStorage', () => {
    const { result } = renderHook(() => useDiscoverSections())
    const initialFreeGames = result.current.sections.find((s) => s.id === 'free_games')
    expect(initialFreeGames?.enabled).toBe(true)

    act(() => {
      result.current.toggleSection('free_games')
    })

    const updatedFreeGames = result.current.sections.find((s) => s.id === 'free_games')
    expect(updatedFreeGames?.enabled).toBe(false)

    // Check localStorage
    const saved = JSON.parse(window.localStorage.getItem(DISCOVER_SECTIONS_STORAGE_KEY) || '[]')
    const savedFreeGames = saved.find((s: { id: string }) => s.id === 'free_games')
    expect(savedFreeGames?.enabled).toBe(false)
  })

  it('moves section order correctly', () => {
    const { result } = renderHook(() => useDiscoverSections())
    const firstId = result.current.sections[0].id
    const secondId = result.current.sections[1].id

    act(() => {
      result.current.moveSection(firstId, 'down')
    })

    expect(result.current.sections[0].id).toBe(secondId)
    expect(result.current.sections[1].id).toBe(firstId)
  })

  it('applies gaming preset prioritizing gaming sections', () => {
    const { result } = renderHook(() => useDiscoverSections())

    act(() => {
      result.current.applyPreset('gaming')
    })

    expect(result.current.sections[0].id).toBe('free_games')
    expect(result.current.sections[0].enabled).toBe(true)
  })

  it('resets to default', () => {
    const { result } = renderHook(() => useDiscoverSections())

    act(() => {
      result.current.toggleSection('fan_spotlight')
      result.current.setActiveIntent('games')
    })

    expect(result.current.sections.find((s) => s.id === 'fan_spotlight')?.enabled).toBe(false)
    expect(result.current.activeIntent).toBe('games')

    act(() => {
      result.current.resetToDefault()
    })

    expect(result.current.sections.find((s) => s.id === 'fan_spotlight')?.enabled).toBe(true)
    expect(result.current.activeIntent).toBe('all')
  })
})
