import { useState, useCallback, useEffect } from 'react'
import {
  type StoredSectionItem,
  type DiscoverPreset,
  type DiscoverIntent,
  DEFAULT_DISCOVER_SECTIONS,
  PRESET_CONFIGS,
  loadStoredSectionConfig,
  saveStoredSectionConfig,
} from '../utils/sections'

export const useDiscoverSections = () => {
  const [sections, setSections] = useState<StoredSectionItem[]>(() => loadStoredSectionConfig())
  const [activeIntent, setActiveIntent] = useState<DiscoverIntent>('all')
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false)

  // Persist whenever sections change
  useEffect(() => {
    saveStoredSectionConfig(sections)
  }, [sections])

  const toggleSection = useCallback((id: string) => {
    setSections((prev) =>
      prev.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item)),
    )
  }, [])

  const moveSection = useCallback((id: string, direction: 'up' | 'down') => {
    setSections((prev) => {
      const index = prev.findIndex((item) => item.id === id)
      if (index === -1) return prev
      const targetIndex = direction === 'up' ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= prev.length) return prev

      const next = [...prev]
      const [item] = next.splice(index, 1)
      next.splice(targetIndex, 0, item)
      return next
    })
  }, [])

  const applyPreset = useCallback((preset: DiscoverPreset) => {
    const config = PRESET_CONFIGS[preset]
    if (!config) return
    const enabledSet = new Set(config.enabled)
    const newItems: StoredSectionItem[] = config.order.map((id) => ({
      id,
      enabled: enabledSet.has(id),
    }))

    // Keep any default sections that might have been omitted
    const included = new Set(newItems.map((i) => i.id))
    for (const def of DEFAULT_DISCOVER_SECTIONS) {
      if (!included.has(def.id)) {
        newItems.push({ id: def.id, enabled: false })
      }
    }
    setSections(newItems)
  }, [])

  const resetToDefault = useCallback(() => {
    setSections(DEFAULT_DISCOVER_SECTIONS.map((s) => ({ id: s.id, enabled: s.defaultEnabled })))
    setActiveIntent('all')
  }, [])

  return {
    sections,
    activeIntent,
    setActiveIntent,
    isCustomizeOpen,
    setIsCustomizeOpen,
    toggleSection,
    moveSection,
    applyPreset,
    resetToDefault,
  }
}
