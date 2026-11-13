import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Sliders,
  RotateCcw,
  Camera,
  ChevronDown,
  ChevronUp,
  Search,
  Copy,
  Check,
  Undo2,
  Lock,
  Unlock,
  Info,
  Compass,
  Sparkles,
  Share2,
  Dices,
} from 'lucide-react'
import { showToast } from '@ui/molecules/toast'
import {
  generateVisualizerSeed,
  parseVisualizerSeed,
  generateRandomVisualizerSeed,
} from '../utils/visualizer-seed'
import type { MusicPlayerTheme } from '../../hooks/use-music-palette'
import {
  type MeshGridParams,
  type MeshGridVariantPreset,
  type PresetGroupFilter,
  type CameraSnapPresetId,
  CAMERA_SNAP_PRESETS,
  MESH_GRID_PRESETS,
  MESH_GRID_PARAM_CATEGORIES,
  CATEGORY_ICONS,
  formatMeshGridParamValue,
  isControlModifiedFromDefault,
  getDefaultControlValue,
  filterPresetsByGroup,
  filterMeshGridCategories,
  isPresetActive,
} from '../utils/mesh-grid-helpers'
import { DkSwitch } from '@/components/ui/atoms/switch'
import { cn } from '@/lib/utils'

export interface MeshGridControlsPanelProps {
  isOpen: boolean
  onClose: () => void
  params: MeshGridParams
  onParamChange: <K extends keyof MeshGridParams>(key: K, value: MeshGridParams[K]) => void
  onApplyPreset: (preset: MeshGridVariantPreset) => void
  onResetParams: () => void
  onResetCamera: () => void
  onSnapCamera?: (presetId: CameraSnapPresetId) => void
  onImportSeed?: (params: MeshGridParams) => void
  theme: MusicPlayerTheme
}

export const MeshGridControlsPanel = ({
  isOpen,
  onClose,
  params,
  onParamChange,
  onApplyPreset,
  onResetParams,
  onResetCamera,
  onSnapCamera,
  onImportSeed,
  theme,
}: MeshGridControlsPanelProps) => {
  const [activeTab, setActiveTab] = useState<string>('all')
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [presetFilter, setPresetFilter] = useState<PresetGroupFilter>('all')
  const [copied, setCopied] = useState(false)
  const [copiedSeed, setCopiedSeed] = useState(false)
  const [importSeedInput, setImportSeedInput] = useState('')
  const [seedError, setSeedError] = useState<string | null>(null)

  const isCameraLocked = Boolean(params.lockCameraOnPresetChange)

  const toggleCategory = (categoryId: string) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [categoryId]: !prev[categoryId],
    }))
  }

  const toggleAllCategories = () => {
    const areAnyExpanded = MESH_GRID_PARAM_CATEGORIES.some((cat) => !collapsedCategories[cat.id])
    if (areAnyExpanded) {
      const allCollapsed: Record<string, boolean> = {}
      MESH_GRID_PARAM_CATEGORIES.forEach((cat) => {
        allCollapsed[cat.id] = true
      })
      setCollapsedCategories(allCollapsed)
    } else {
      setCollapsedCategories({})
    }
  }

  const filteredPresets = useMemo(() => {
    return filterPresetsByGroup(MESH_GRID_PRESETS, presetFilter)
  }, [presetFilter])

  const filteredCategories = useMemo(() => {
    const base = filterMeshGridCategories(MESH_GRID_PARAM_CATEGORIES, searchQuery)
    if (activeTab === 'all' || activeTab === 'presets' || searchQuery) {
      return base
    }
    return base.filter((c) => c.id === activeTab)
  }, [searchQuery, activeTab])

  const handleCopyConfig = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(params, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
    }
  }

  const handleCopySeed = async () => {
    try {
      const seed = generateVisualizerSeed(params)
      await navigator.clipboard.writeText(seed)
      setCopiedSeed(true)
      showToast({
        title: 'Visualizer seed copied to clipboard',
        description: 'Share this code with anyone to let them experience your exact visualizer setup.',
        variant: 'success',
      })
      setTimeout(() => setCopiedSeed(false), 2000)
    } catch {
      showToast({
        title: 'Unable to copy to clipboard',
        description: 'Please copy the seed manually from the Seed & Share tab.',
        variant: 'info',
      })
    }
  }

  const handleApplySeed = (seedToApply: string) => {
    setSeedError(null)
    const parsed = parseVisualizerSeed(seedToApply)
    if (!parsed) {
      setSeedError('Invalid visualizer seed format. Please verify the code string.')
      return
    }

    if (onImportSeed) {
      onImportSeed(parsed)
    } else {
      onApplyPreset({
        id: 'imported-seed',
        name: 'Imported Seed',
        description: 'Custom community visualizer configuration',
        params: parsed,
      })
    }

    setImportSeedInput('')
    showToast({
      title: 'Visualizer seed applied!',
      description: 'Your 3D visualizer settings have been updated and saved.',
      variant: 'success',
    })
  }

  const handleRollRandomSeed = () => {
    const { params: randomParams } = generateRandomVisualizerSeed({
      useAlbumPalette: params.useAlbumPalette,
    })
    if (onImportSeed) {
      onImportSeed(randomParams)
    } else {
      onApplyPreset({
        id: 'procedural-seed',
        name: 'Procedural Seed',
        description: 'Procedurally generated seed configuration',
        params: randomParams,
      })
    }
    showToast({
      title: 'Generated new visualizer seed!',
      description: 'Applied new unique procedural parameters.',
      variant: 'success',
    })
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.aside
        key="mesh-grid-controls-panel"
        initial={{ x: '100%', opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="absolute top-0 right-0 bottom-0 z-40 w-full max-w-lg backdrop-blur-2xl p-5 sm:p-6 flex flex-col shadow-2xl border-l border-white/[0.06] overflow-hidden select-none"
        style={{
          background: theme.podBackground,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sliders className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground leading-tight">
                Mesh Visualizer Controls
              </h2>
              <span className="text-[11px] font-mono text-muted-foreground leading-tight">
                High-Definition 3D Audio Engine
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Lock Camera Toggle Button */}
            <button
              type="button"
              onClick={() => onParamChange('lockCameraOnPresetChange', !isCameraLocked)}
              className={cn(
                'flex h-8 items-center gap-1.5 px-2 rounded-lg text-xs font-medium transition-colors',
                isCameraLocked
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)]',
              )}
              title={
                isCameraLocked
                  ? 'Camera Locked: Presets will preserve current 3D angle'
                  : 'Lock Camera: Keep current 3D angle when auditioning presets'
              }
              aria-label="Toggle Camera Lock"
            >
              {isCameraLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline text-[11px] font-mono">
                {isCameraLocked ? 'Locked' : 'Free'}
              </span>
            </button>

            {/* Reset Camera Perspective */}
            <button
              type="button"
              onClick={onResetCamera}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)] transition-colors"
              title="Reset 3D Camera Perspective"
              aria-label="Reset Camera"
            >
              <Camera className="h-4 w-4" />
            </button>

            {/* Share / Copy Seed */}
            <button
              type="button"
              onClick={handleCopySeed}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)] transition-colors"
              title="Share Visualizer Seed Code"
              aria-label="Share Visualizer Seed"
            >
              {copiedSeed ? <Check className="h-4 w-4 text-primary" /> : <Share2 className="h-4 w-4" />}
            </button>

            {/* Copy Config JSON */}
            <button
              type="button"
              onClick={handleCopyConfig}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)] transition-colors"
              title="Copy All Parameters as JSON"
              aria-label="Copy Parameters JSON"
            >
              {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
            </button>

            {/* Reset All Parameters to Preset 14 Flagship */}
            <button
              type="button"
              onClick={onResetParams}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)] transition-colors"
              title="Reset All Parameters to Preset 14"
              aria-label="Reset Parameters to Preset 14"
            >
              <RotateCcw className="h-4 w-4" />
            </button>

            {/* Close Panel */}
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)] transition-colors"
              title="Close Panel"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Quick Horizontal Jump Tabs Strip */}
        <div className="py-2.5 border-b border-white/[0.06] shrink-0 overflow-x-auto no-scrollbar flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={cn(
              'px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors whitespace-nowrap',
              activeTab === 'all'
                ? 'bg-[var(--dk-surface-raised)] text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)]',
            )}
          >
            All Settings
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('presets')}
            className={cn(
              'px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors whitespace-nowrap flex items-center gap-1',
              activeTab === 'presets'
                ? 'bg-[var(--dk-surface-raised)] text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)]',
            )}
          >
            <span>Presets</span>
            <span className="text-[10px] font-mono text-primary">({MESH_GRID_PRESETS.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('seed')}
            className={cn(
              'px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors whitespace-nowrap flex items-center gap-1',
              activeTab === 'seed'
                ? 'bg-[var(--dk-surface-raised)] text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)]',
            )}
          >
            <Sparkles className="h-3 w-3 text-primary" />
            <span>Seed & Share</span>
          </button>

          {MESH_GRID_PARAM_CATEGORIES.map((category) => {
            const Icon = CATEGORY_ICONS[category.iconName] || Sliders
            const isSelected = activeTab === category.id
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => setActiveTab(category.id)}
                className={cn(
                  'px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5',
                  isSelected
                    ? 'bg-[var(--dk-surface-raised)] text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)]',
                )}
              >
                <Icon className={cn('h-3 w-3', isSelected ? 'text-primary' : 'text-muted-foreground')} />
                <span>{category.shortTitle || category.title}</span>
              </button>
            )
          })}
        </div>

        {/* Seed & Share Pod (visible in All or Seed & Share tab) */}
        {(activeTab === 'seed' || activeTab === 'all') && !searchQuery && (
          <div className="py-3 border-b border-white/[0.06] shrink-0 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Visualizer Seed & Sharing
                </span>
              </div>
              <button
                type="button"
                onClick={handleRollRandomSeed}
                className="flex items-center gap-1 text-[10.5px] font-medium text-primary hover:underline cursor-pointer"
                title="Procedurally randomize settings into a new seed"
              >
                <Dices className="h-3 w-3" />
                <span>Roll Random Seed</span>
              </button>
            </div>

            <div className="rounded-2xl bg-[var(--dk-surface-raised)]/40 p-3 space-y-3 border border-white/[0.04]">
              {/* Share Current Seed */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">Current Seed Code</span>
                  <button
                    type="button"
                    onClick={handleCopySeed}
                    className="flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors cursor-pointer"
                  >
                    {copiedSeed ? (
                      <>
                        <Check className="h-3 w-3" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>Copy Seed</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="w-full bg-[var(--dk-surface-base)]/80 text-foreground font-mono text-[10px] p-2 rounded-xl border border-white/[0.04] break-all select-all max-h-14 overflow-y-auto no-scrollbar">
                  {generateVisualizerSeed(params)}
                </div>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  Share this seed code with other people so they can load and see your exact visualizer!
                </p>
              </div>

              {/* Import Seed */}
              <div className="pt-2 border-t border-white/[0.04] space-y-1.5">
                <span className="text-xs font-medium text-foreground block">Import Friend's Seed</span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={importSeedInput}
                    onChange={(e) => {
                      setImportSeedInput(e.target.value)
                      if (seedError) setSeedError(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleApplySeed(importSeedInput)
                      }
                    }}
                    placeholder="Paste visualizer seed (OTIX-VIZ-1:...)"
                    aria-label="Paste visualizer seed"
                    className="flex-1 bg-[var(--dk-surface-base)]/80 text-foreground font-mono text-[11px] px-2.5 py-1.5 rounded-xl border border-white/[0.04] focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/60"
                  />
                  <button
                    type="button"
                    onClick={() => handleApplySeed(importSeedInput)}
                    disabled={!importSeedInput.trim()}
                    className={cn(
                      'px-3 py-1.5 rounded-xl text-xs font-medium transition-colors shrink-0 cursor-pointer',
                      importSeedInput.trim()
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                        : 'bg-[var(--dk-surface-raised)] text-muted-foreground opacity-50 cursor-not-allowed',
                    )}
                  >
                    Apply Seed
                  </button>
                </div>
                {seedError && (
                  <p className="text-[10.5px] text-destructive leading-tight font-medium">
                    {seedError}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Presets & Camera Hero Pod (visible in All or dedicated tabs) */}
        {(activeTab === 'all' || activeTab === 'presets') && !searchQuery && (
          <div className="py-3 border-b border-white/[0.06] shrink-0 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Presets ({MESH_GRID_PRESETS.length})
                </span>
                {isCameraLocked && (
                  <span className="text-[10px] font-mono text-primary px-1.5 py-0.5 rounded-full bg-primary/10">
                    Camera Angle Preserved
                  </span>
                )}
                {params.useAlbumPalette && (
                  <span className="text-[10px] font-mono text-primary px-1.5 py-0.5 rounded-full bg-primary/10">
                    Album Theme Persisted
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={onResetParams}
                className="text-[10.5px] font-medium text-primary hover:underline"
              >
                Reset to Preset 14
              </button>
            </div>

            {/* Preset Group Filter Tabs */}
            <div className="flex items-center gap-1 bg-[var(--dk-surface-ghost)] p-1 rounded-xl">
              {(['all', 'featured', 'variants'] as const).map((group) => {
                const count = filterPresetsByGroup(MESH_GRID_PRESETS, group).length
                const label =
                  group === 'all'
                    ? `All (${count})`
                    : group === 'featured'
                      ? `Featured (${count})`
                      : `Variants (${count})`
                const isSelected = presetFilter === group
                return (
                  <button
                    key={group}
                    type="button"
                    onClick={() => setPresetFilter(group)}
                    className={cn(
                      'flex-1 py-1 text-[11px] font-medium rounded-lg transition-colors text-center',
                      isSelected
                        ? 'bg-[var(--dk-surface-raised)] text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {label}
                  </button>
                )
              })}
            </div>

            {/* Scrollable Preset Grid */}
            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
              {filteredPresets.map((preset) => {
                const active = isPresetActive(preset, params)
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onApplyPreset(preset)}
                    className={cn(
                      'flex flex-col items-start px-2.5 py-1.5 rounded-xl text-left transition-colors duration-200 border border-transparent',
                      active
                        ? 'bg-primary/10 hover:bg-primary/15 text-foreground border-primary/25 shadow-sm'
                        : 'bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] text-muted-foreground hover:text-foreground',
                    )}
                    title={preset.description}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-medium truncate">{preset.name}</span>
                      {active && (
                        <span className="text-[9px] font-semibold text-primary px-1.5 py-0.2 rounded-full bg-primary/15">
                          Active
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground truncate w-full mt-0.5">
                      {preset.id === 'variant-14' || preset.id === 'grid-preset-14'
                        ? 'Exact Flagship Preset'
                        : preset.description.length > 32
                          ? preset.description.slice(0, 32) + '...'
                          : preset.description}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Quick Camera Angle Snap Strip (visible in All or Camera tab) */}
        {(activeTab === 'all' || activeTab === 'camera') && !searchQuery && (
          <div className="py-2.5 border-b border-white/[0.06] shrink-0 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Compass className="h-3.5 w-3.5 text-primary" />
                <span>Quick Camera Angles</span>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground">
                Click to snap perspective
              </span>
            </div>

            <div className="grid grid-cols-5 gap-1.5">
              {CAMERA_SNAP_PRESETS.map((snap) => (
                <button
                  key={snap.id}
                  type="button"
                  onClick={() => onSnapCamera?.(snap.id)}
                  className="flex flex-col items-center justify-center p-1.5 rounded-xl bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-raised)] border border-white/[0.04] transition-colors text-center group"
                  title={snap.tip}
                >
                  <span className="text-[11px] font-medium text-foreground group-hover:text-primary transition-colors truncate w-full">
                    {snap.label}
                  </span>
                  <span className="text-[9px] font-mono text-muted-foreground truncate w-full">
                    {snap.subtitle}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search & Collapse Controls */}
        <div className="pt-3 pb-2 shrink-0 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search all settings & tips (e.g. mountain, fov, perlin, trails)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-[var(--dk-surface-ghost)] text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 border border-white/[0.04]"
              aria-label="Search Settings"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear Search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={toggleAllCategories}
            className="text-[11px] font-medium text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-xl bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] transition-colors whitespace-nowrap"
            title="Toggle Expand All / Collapse All"
          >
            {MESH_GRID_PARAM_CATEGORIES.some((c) => !collapsedCategories[c.id])
              ? 'Collapse All'
              : 'Expand All'}
          </button>
        </div>

        {searchQuery && (
          <div className="text-[11px] text-muted-foreground pb-1 px-1">
            Found{' '}
            <span className="font-semibold text-primary">
              {filteredCategories.reduce((acc, cat) => acc + cat.controls.length, 0)}
            </span>{' '}
            settings matching &ldquo;{searchQuery}&rdquo;
          </div>
        )}

        {/* Scrollable Category Accordions with Rich Visual Tips */}
        <div className="flex-1 overflow-y-auto space-y-3.5 py-2 pr-1 min-h-0 focus-visible:outline-none">
          {filteredCategories.map((category) => {
            const isCollapsed = Boolean(collapsedCategories[category.id]) && !searchQuery
            const Icon = CATEGORY_ICONS[category.iconName] || Sliders

            return (
              <div
                key={category.id}
                className="rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] p-3.5 space-y-3 transition-colors"
              >
                {/* Category Header */}
                <button
                  type="button"
                  onClick={() => toggleCategory(category.id)}
                  className="w-full flex items-center justify-between text-left group"
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <div>
                      <span className="text-xs font-semibold text-foreground tracking-wide block">
                        {category.title}
                      </span>
                      {category.description && (
                        <span className="text-[10px] text-muted-foreground block leading-tight">
                          {category.description}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded-md bg-[var(--dk-surface-raised)]">
                      {category.controls.length}
                    </span>
                    <div className="text-muted-foreground group-hover:text-foreground transition-colors">
                      {isCollapsed ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronUp className="h-4 w-4" />
                      )}
                    </div>
                  </div>
                </button>

                {/* Category Controls */}
                {!isCollapsed && (
                  <div className="space-y-3.5 pt-1">
                    {category.controls.map((control) => {
                      const value = params[control.key]
                      const isModified = isControlModifiedFromDefault(control.key, value)

                      // 1. SWITCH CONTROL
                      if (control.type === 'switch') {
                        return (
                          <div
                            key={String(control.key)}
                            className="rounded-xl bg-[var(--dk-surface-raised)]/35 p-2.5 space-y-1.5 border border-white/[0.03]"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-1.5 min-w-0 pr-2">
                                <span className="text-xs font-medium text-foreground">
                                  {control.label}
                                </span>
                                {isModified && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onParamChange(
                                        control.key,
                                        getDefaultControlValue(control.key),
                                      )
                                    }
                                    className="text-muted-foreground hover:text-primary transition-colors p-0.5 rounded"
                                    title="Reset to Preset 14 default"
                                    aria-label={`Reset ${control.label} to default`}
                                  >
                                    <Undo2 className="h-2.5 w-2.5" />
                                  </button>
                                )}
                              </div>
                              <DkSwitch
                                checked={Boolean(value)}
                                onCheckedChange={(checked) =>
                                  onParamChange(
                                    control.key,
                                    checked as MeshGridParams[typeof control.key],
                                  )
                                }
                                aria-label={control.label}
                              />
                            </div>

                            {/* Visual Tip */}
                            {control.tip && (
                              <div className="flex items-start gap-1.5 p-2 rounded-lg bg-[var(--dk-surface-base)]/60 border border-white/[0.03] mt-1">
                                <Info className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                                <span className="text-[10.5px] leading-relaxed text-muted-foreground">
                                  {control.tip}
                                </span>
                              </div>
                            )}
                          </div>
                        )
                      }

                      // 2. SELECT CONTROL
                      if (control.type === 'select') {
                        return (
                          <div
                            key={String(control.key)}
                            className="rounded-xl bg-[var(--dk-surface-raised)]/35 p-2.5 space-y-2 border border-white/[0.03]"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-foreground">{control.label}</span>
                                {isModified && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onParamChange(
                                        control.key,
                                        getDefaultControlValue(control.key),
                                      )
                                    }
                                    className="text-muted-foreground hover:text-primary transition-colors p-0.5 rounded"
                                    title="Reset to Preset 14 default"
                                    aria-label={`Reset ${control.label} to default`}
                                  >
                                    <Undo2 className="h-2.5 w-2.5" />
                                  </button>
                                )}
                              </div>
                              <span className="font-mono text-[11px] text-primary">
                                {formatMeshGridParamValue(control.key, value)}
                              </span>
                            </div>

                            <select
                              value={String(value ?? '')}
                              onChange={(e) => {
                                const selectedVal =
                                  control.key === 'fftSize'
                                    ? parseInt(e.target.value, 10)
                                    : e.target.value
                                onParamChange(
                                  control.key,
                                  selectedVal as MeshGridParams[typeof control.key],
                                )
                              }}
                              aria-label={control.label}
                              className="w-full text-xs bg-[var(--dk-surface-raised)] text-foreground border border-white/[0.06] rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/40"
                            >
                              {control.options?.map((opt) => (
                                <option key={String(opt.value)} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>

                            {/* Visual Tip */}
                            {control.tip && (
                              <div className="flex items-start gap-1.5 p-2 rounded-lg bg-[var(--dk-surface-base)]/60 border border-white/[0.03] mt-1">
                                <Info className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                                <span className="text-[10.5px] leading-relaxed text-muted-foreground">
                                  {control.tip}
                                </span>
                              </div>
                            )}
                          </div>
                        )
                      }

                      // 3. SLIDER CONTROL
                      const numVal = typeof value === 'number' ? value : 0

                      return (
                        <div
                          key={String(control.key)}
                          className="rounded-xl bg-[var(--dk-surface-raised)]/35 p-2.5 space-y-2 border border-white/[0.03]"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-foreground">{control.label}</span>
                              {isModified && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onParamChange(
                                      control.key,
                                      getDefaultControlValue(control.key),
                                    )
                                  }
                                  className="text-muted-foreground hover:text-primary transition-colors p-0.5 rounded"
                                  title="Reset to Preset 14 default"
                                  aria-label={`Reset ${control.label} to default`}
                                >
                                  <Undo2 className="h-2.5 w-2.5" />
                                </button>
                              )}
                            </div>
                            <span className="font-mono text-[11px] text-primary font-medium">
                              {formatMeshGridParamValue(control.key, numVal)}
                            </span>
                          </div>

                          <div className="space-y-1">
                            <input
                              type="range"
                              min={control.min}
                              max={control.max}
                              step={control.step}
                              value={numVal}
                              onChange={(e) =>
                                onParamChange(
                                  control.key,
                                  parseFloat(e.target.value) as MeshGridParams[typeof control.key],
                                )
                              }
                              aria-label={control.label}
                              className="w-full h-1.5 cursor-pointer rounded-full accent-primary bg-[var(--dk-surface-raised)]"
                            />

                            {/* Min / Max Range Spectrum End Labels */}
                            {(control.minLabel || control.maxLabel) && (
                              <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground px-0.5">
                                <span>{control.minLabel}</span>
                                <span>{control.maxLabel}</span>
                              </div>
                            )}
                          </div>

                          {/* Visual Tip */}
                          {control.tip && (
                            <div className="flex items-start gap-1.5 p-2 rounded-lg bg-[var(--dk-surface-base)]/60 border border-white/[0.03] mt-1">
                              <Info className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                              <span className="text-[10.5px] leading-relaxed text-muted-foreground">
                                {control.tip}
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer tip */}
        <div className="pt-2.5 border-t border-white/[0.06] shrink-0 text-center">
          <span className="text-[10px] text-muted-foreground">
            Drag to orbit • Scroll to zoom • Double-click canvas to reset camera
          </span>
        </div>
      </motion.aside>
    </AnimatePresence>
  )
}
