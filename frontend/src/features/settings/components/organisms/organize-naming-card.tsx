import { type RefObject, useMemo, useState } from 'react'
import {
  Play,
  Sparkles,
  FolderTree,
  RotateCcw,
  SlidersHorizontal,
  ChevronDown,
  Check,
  Folder,
  Disc,
  Wrench,
  RefreshCw,
  Package as PackageIcon,
  Gamepad2,
  Music,
  Shield,
} from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { DkSwitch } from '@ui/atoms/switch'
import { DkDropdown } from '@ui/atoms/dropdown'
import { SectionHeader } from '../molecules/settings-section-header'
import { SettingsCard } from '../molecules/settings-card'
import { SettingsRow } from '../molecules/settings-row'
import { TokenizedTemplateDisplay } from '../molecules/tokenized-template-display'
import {
  ISO_FOLDER_PRESETS,
  TOKEN_COLOR_MAP,
  CATEGORY_EXPLANATIONS,
  getPresetStructureBreakdown,
  generateLibraryTreePreview,
  type LibraryTreeNode,
  type SampleCategoryFilter,
} from '../../utils/naming-template'
import { cn } from '@/lib/utils'
import type { AvailableDirectoryOption } from '../../utils/organize'

export interface OrganizeNamingCardProps {
  activeTemplate: string
  activePresetId: string
  isCustomRuleActive: boolean
  liveSamplePreview: string
  selectedDirectory: string
  directoryDropdownOptions: AvailableDirectoryOption[]
  customRulesCount: number
  isoDownloadPath: string
  autoOrganizeEnabled: boolean
  nodeId?: number | null
  templateInputRef: RefObject<HTMLInputElement | null>
  onSelectDirectory: (dir: string) => void
  onResetDirectoryToDefault: () => void
  onUpdateTemplate: (template: string, presetId?: string) => void
  onInsertToken: (token: string) => void
  onSetIsoDownloadPath: (path: string) => void
  onSetAutoOrganizeEnabled: (enabled: boolean) => void
  onOpenTestRun: () => void
}

const CATEGORY_TABS: Array<{ id: SampleCategoryFilter; label: string }> = [
  { id: 'all', label: 'All Content Types' },
  { id: 'iso', label: 'Base Games' },
  { id: 'update', label: 'Updates' },
  { id: 'dlc', label: 'DLCs' },
  { id: 'mod', label: 'Mods' },
  { id: 'crack', label: 'Cracks' },
  { id: 'bonus', label: 'Bonus / OST' },
  { id: 'package', label: 'Packages' },
  { id: 'rom', label: 'ROMs' },
]

const LibraryTreeItem = ({ node, level = 0 }: { node: LibraryTreeNode; level?: number }) => {
  const isFile = node.type === 'file'
  const isRoot = node.type === 'root'

  const renderIcon = () => {
    if (isRoot) return <FolderTree className="h-3.5 w-3.5 text-primary shrink-0" />
    if (!isFile) return <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

    switch (node.category) {
      case 'mod':
        return <Wrench className="h-3.5 w-3.5 text-primary shrink-0" />
      case 'update':
        return <RefreshCw className="h-3.5 w-3.5 text-primary shrink-0" />
      case 'dlc':
        return <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
      case 'crack':
        return <Shield className="h-3.5 w-3.5 text-primary shrink-0" />
      case 'bonus':
        return <Music className="h-3.5 w-3.5 text-primary shrink-0" />
      case 'rom':
        return <Gamepad2 className="h-3.5 w-3.5 text-primary shrink-0" />
      case 'folder_package':
        return <PackageIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      case 'iso':
      default:
        return <Disc className="h-3.5 w-3.5 text-primary/80 shrink-0" />
    }
  }

  return (
    <div className="space-y-0.5">
      <div
        className={cn(
          'flex items-center justify-between gap-2 py-0.5 px-1.5 rounded-md text-xs font-mono transition-colors group',
          isRoot
            ? 'text-foreground font-semibold bg-white/[0.04]'
            : isFile
              ? 'text-foreground/90 hover:bg-white/[0.03]'
              : 'text-foreground/80 font-medium hover:bg-white/[0.03]',
        )}
        style={{ paddingLeft: `${level * 14 + 6}px` }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {renderIcon()}
          <span className="truncate">{node.name}</span>
        </div>

        {node.badge && (
          <span className="text-[9px] font-semibold px-1 py-0.2 rounded bg-white/[0.06] text-muted-foreground shrink-0 tracking-wider">
            {node.badge}
          </span>
        )}
      </div>

      {node.children && node.children.length > 0 && (
        <div className="border-l border-white/[0.06] ml-2.5">
          {node.children.map((child) => (
            <LibraryTreeItem key={child.id} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

export const OrganizeNamingCard = ({
  activeTemplate,
  activePresetId,
  isCustomRuleActive,
  liveSamplePreview,
  selectedDirectory,
  directoryDropdownOptions,
  customRulesCount,
  isoDownloadPath,
  autoOrganizeEnabled,
  nodeId: _nodeId,
  templateInputRef,
  onSelectDirectory,
  onResetDirectoryToDefault,
  onUpdateTemplate,
  onInsertToken,
  onSetIsoDownloadPath: _onSetIsoDownloadPath,
  onSetAutoOrganizeEnabled,
  onOpenTestRun,
}: OrganizeNamingCardProps) => {
  const [categoryFilter, setCategoryFilter] = useState<SampleCategoryFilter>('all')

  const libraryRootPath =
    selectedDirectory !== 'all' ? selectedDirectory : isoDownloadPath || 'D:\\Games\\ISOs'

  const treeData = useMemo(() => {
    return generateLibraryTreePreview(activeTemplate, libraryRootPath, categoryFilter)
  }, [activeTemplate, libraryRootPath, categoryFilter])

  const activeExplanation = CATEGORY_EXPLANATIONS[categoryFilter] || CATEGORY_EXPLANATIONS.all

  return (
    <SettingsCard className="space-y-4">
      <SectionHeader
        title="Folder Structure & Naming Rules"
        description="Configure directory structures, naming templates, and automated sorting."
        action={
          <DkButton
            size="sm"
            variant="ghost"
            onClick={onOpenTestRun}
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <Play size={12} className="fill-current" />
            <span>Test Run</span>
          </DkButton>
        }
      />

      {/* Directory Dropdown Selector with Custom Rules Counter */}
      <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
            <FolderTree className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">Target Directory</span>
              {isCustomRuleActive ? (
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-primary/15 text-primary font-medium">
                  Custom Rule Active
                </span>
              ) : customRulesCount > 0 ? (
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/[0.06] text-muted-foreground font-medium">
                  {customRulesCount} custom {customRulesCount === 1 ? 'rule' : 'rules'} set
                </span>
              ) : null}
            </div>
            <p className="text-[11px] text-muted-foreground truncate">
              {selectedDirectory === 'all'
                ? 'Base naming rule applied across all directories on this node.'
                : `Customizing organization rule for ${selectedDirectory}.`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
          <div className="w-full sm:w-64">
            <DkDropdown
              options={directoryDropdownOptions}
              value={selectedDirectory}
              onChange={onSelectDirectory}
              placeholder="Select directory..."
              className="w-full"
            />
          </div>

          {isCustomRuleActive && (
            <DkButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={onResetDirectoryToDefault}
              title="Reset this directory to use default node template"
              className="text-xs text-muted-foreground hover:text-foreground h-8 px-2 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </DkButton>
          )}
        </div>
      </div>

      {/* Directory Scope Override Context */}
      {selectedDirectory !== 'all' && (
        <div className="p-3 rounded-xl bg-primary/5 border border-primary/15 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <Folder className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              <span className="font-semibold text-foreground">Rule Scope: </span>
              <span className="font-mono text-primary truncate">{selectedDirectory}</span>
            </div>
          </div>
          <DkButton
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onSelectDirectory('all')}
            className="text-xs text-muted-foreground hover:text-foreground h-7 px-2 cursor-pointer shrink-0"
          >
            Back to All Directories
          </DkButton>
        </div>
      )}

      {/* Side-by-Side: Format Presets Selection (Left) & Full Library Tree Preview (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start pt-1">
        {/* Left Column: Preset Formats List */}
        <div className="lg:col-span-5 space-y-2">
          <div className="flex items-center justify-between pb-1">
            <label className="text-xs font-semibold text-foreground block">
              Folder Structure Presets
            </label>
            {selectedDirectory !== 'all' && (
              <span className="text-[10px] text-muted-foreground font-mono">
                Applies to: {selectedDirectory.split(/[\\/]/).pop()}
              </span>
            )}
          </div>

          <div className="space-y-1.5">
            {ISO_FOLDER_PRESETS.map((preset) => {
              const isSelected = activePresetId === preset.id
              const breakdown = getPresetStructureBreakdown(preset.template)
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onUpdateTemplate(preset.template, preset.id)}
                  className={cn(
                    'w-full p-2.5 rounded-xl text-left transition-all cursor-pointer flex flex-col gap-1.5 border',
                    isSelected
                      ? 'bg-primary/10 border-primary/30 ring-1 ring-primary/20 text-foreground shadow-xs'
                      : 'bg-white/[0.02] hover:bg-white/[0.04] border-white/[0.04] text-muted-foreground',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-foreground truncate">{preset.label}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={cn(
                          'text-[9px] px-1.5 py-0.5 rounded font-semibold tracking-wider uppercase',
                          isSelected ? 'bg-primary/20 text-primary' : 'bg-white/[0.04] text-muted-foreground',
                        )}
                      >
                        {preset.badge}
                      </span>
                      {isSelected && (
                        <div className="p-0.5 rounded-full bg-primary/20 text-primary">
                          <Check className="h-3 w-3" />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground/90 overflow-hidden">
                    {breakdown.folderPattern && (
                      <span className="truncate">📁 {breakdown.folderPattern} /</span>
                    )}
                    <span className="truncate">📄 {breakdown.filePattern}</span>
                  </div>

                  <p className="text-[11px] text-muted-foreground line-clamp-1">
                    {preset.description}
                  </p>
                </button>
              )
            })}

            {/* Custom Pattern Option */}
            <button
              type="button"
              onClick={() => onUpdateTemplate(activeTemplate, 'custom')}
              className={cn(
                'w-full p-2.5 rounded-xl text-left transition-all cursor-pointer flex flex-col gap-1 border',
                activePresetId === 'custom'
                  ? 'bg-primary/10 border-primary/30 ring-1 ring-primary/20 text-foreground shadow-xs'
                  : 'bg-white/[0.02] hover:bg-white/[0.04] border-white/[0.04] text-muted-foreground',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground">Custom Syntax</span>
                <span
                  className={cn(
                    'text-[9px] px-1.5 py-0.5 rounded font-semibold tracking-wider uppercase',
                    activePresetId === 'custom' ? 'bg-primary/20 text-primary' : 'bg-white/[0.04] text-muted-foreground',
                  )}
                >
                  Custom
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Define a customized naming pattern using variables.
              </p>
            </button>
          </div>
        </div>

        {/* Right Column: Full Library Structure Preview with Category Breakdown */}
        <div className="lg:col-span-7 space-y-2.5 flex flex-col">
          <div className="flex items-center justify-between pb-0.5">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>Live Sample Previews</span>
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              Full Library Tree Preview
            </span>
          </div>

          {/* Category Filter Chips: All, Base Games, Updates, DLCs, Mods, Cracks, Bonus, Packages, ROMs */}
          <div className="flex flex-wrap items-center gap-1.5">
            {CATEGORY_TABS.map((tab) => {
              const isActive = categoryFilter === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCategoryFilter(tab.id)}
                  className={cn(
                    'px-2 py-0.5 rounded-lg text-[10px] font-medium transition-all cursor-pointer border',
                    isActive
                      ? 'bg-primary/15 border-primary/30 text-primary font-semibold'
                      : 'bg-white/[0.02] hover:bg-white/[0.04] border-white/[0.04] text-muted-foreground',
                  )}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* Tree Structure Box */}
          <div className="p-3 rounded-xl bg-black/25 border border-white/[0.04] flex flex-col justify-between gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1 pb-1">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  Projected Library Hierarchy
                </span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/[0.04] text-muted-foreground font-mono">
                  {activeExplanation.badge}
                </span>
              </div>
              <div className="space-y-0.5 max-h-[290px] overflow-y-auto pr-1">
                <LibraryTreeItem node={treeData} />
              </div>
            </div>

            {/* Category Explanation Banner */}
            <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04] space-y-1 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-foreground text-[11px]">
                  {activeExplanation.title}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-normal">
                {activeExplanation.description}
              </p>
              <p className="text-[10px] text-primary/80 font-mono pt-0.5">
                Tip: {activeExplanation.ruleNote}
              </p>
            </div>

            {/* Tokenized display and formatted single sample */}
            <div className="pt-2 border-t border-white/[0.04] space-y-1.5">
              <div className="flex items-center justify-between text-[11px] gap-2">
                <span className="text-muted-foreground shrink-0 font-medium">Selected Pattern:</span>
                <div className="truncate text-right">
                  <TokenizedTemplateDisplay template={activeTemplate} size="xs" />
                </div>
              </div>
              <div className="text-[11px] font-mono text-primary truncate bg-white/[0.02] px-2.5 py-1.5 rounded-lg border border-white/[0.04]">
                &rarr; {liveSamplePreview}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Collapsible Custom Template & Token Editor */}
      <details
        className="group rounded-xl bg-white/[0.02] border border-white/[0.04] overflow-hidden transition-all"
        open={activePresetId === 'custom' ? true : undefined}
      >
        <summary className="p-3 cursor-pointer list-none flex items-center justify-between hover:bg-white/[0.02] transition-colors">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold text-foreground">
              Custom Template &amp; Tokens
            </span>
            {activePresetId === 'custom' && (
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-primary/15 text-primary font-medium">
                Custom Syntax
              </span>
            )}
          </div>
          <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 text-muted-foreground group-open:rotate-180" />
        </summary>

        <div className="p-3 pt-0 space-y-3 border-t border-white/[0.04]">
          <div className="space-y-1.5 pt-2.5">
            <div className="flex items-center justify-between">
              <label htmlFor="organize-template-input" className="text-xs font-medium text-foreground block">
                Pattern String {selectedDirectory !== 'all' ? `(${selectedDirectory})` : ''}
              </label>
              <span className="text-[10px] text-muted-foreground font-mono">
                Use / for subfolders
              </span>
            </div>
            <input
              id="organize-template-input"
              ref={templateInputRef}
              type="text"
              value={activeTemplate}
              onChange={(e) => onUpdateTemplate(e.target.value, 'custom')}
              placeholder="{Title} ({Year})/{Title}.{ext}"
              className="w-full text-xs font-mono text-foreground outline-none h-9 rounded-xl bg-white/[0.03] border border-white/[0.04] px-3 focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground"
            />
          </div>

          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground">Click tokens to insert at cursor:</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {Object.entries(TOKEN_COLOR_MAP).map(([key, def]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onInsertToken(def.token)}
                  title={`${def.description} (e.g. "${def.example}")`}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-mono font-medium transition-all cursor-pointer bg-white/[0.04] hover:bg-primary/15 hover:text-primary text-muted-foreground border border-white/[0.04]"
                >
                  <span>{def.token}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </details>

      {/* Auto-Organize Switch */}
      <div className="pt-1">
        <SettingsRow
          icon={<Sparkles className="h-4 w-4 text-primary" />}
          label="Auto-organize"
          description="Automatically rename and sort downloaded games into organized folders according to the template above."
          action={<DkSwitch checked={autoOrganizeEnabled} onCheckedChange={onSetAutoOrganizeEnabled} />}
        />
      </div>
    </SettingsCard>
  )
}
