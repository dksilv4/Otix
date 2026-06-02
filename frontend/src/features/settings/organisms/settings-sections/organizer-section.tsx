import { useState, useEffect } from 'react'
import { useAuth } from '@/features/auth/auth-provider'
import { DkButton } from '@/features/dk-ui/atoms/button'
import { DkSwitch } from '@/features/dk-ui/atoms/switch'
import { useDownloadConfig } from '@/features/downloads/use-downloads'
import { cn } from '@/lib/utils'
import { FolderKanban, CheckCircle2 } from 'lucide-react'

const NAMING_PRESETS = [
  { id: 'standard', label: 'Standard', template: '{Title} ({Year}) [{Platform}]/{OriginalName}.{ext}' },
  { id: 'simple',   label: 'Simple',   template: '{Title}/{OriginalName}.{ext}' },
]

const TOKEN_DOCS = [
  '{Title}        — Clean game title (e.g. "Stellar Blade")',
  '{CleanTitle}   — cleanGameTitle() fallback',
  '{Year}        — Release year (e.g. "2024")',
  '{Edition}     — Edition tag (e.g. "GOTY Edition")',
  '{Platform}    — Platform hint (e.g. "PC", "Multi")',
  '{ReleaseGroup}— Scene release group (e.g. "ElAmigos")',
  '{Version}     — Version number (e.g. "1.03")',
  '{OriginalName}— Raw download folder name',
  '{MediaType}   — "ISO", "PC", or "Update"',
  '{ext}         — File extension (auto-filled)',
]

export function OrganizerSection() {
  const isElectron = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('electron')
  const { user } = useAuth()
  const { config: dlConfig, saveConfig } = useDownloadConfig(user?.id)

  const [autoOrganizeEnabled, setAutoOrganizeEnabled] = useState(false)
  const [namingTemplate, setNamingTemplate] = useState(NAMING_PRESETS[0].template)
  const [activePreset, setActivePreset] = useState('standard')
  const [showTokens, setShowTokens] = useState(false)
  const [previewResult, setPreviewResult] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [validTemplate, setValidTemplate] = useState(true)

  useEffect(() => {
    if (dlConfig) {
      setAutoOrganizeEnabled(dlConfig.autoOrganizeEnabled ?? false)
      if (dlConfig.namingTemplate) {
        setNamingTemplate(dlConfig.namingTemplate)
        // Find matching preset
        const match = NAMING_PRESETS.find(p => p.template === dlConfig.namingTemplate)
        if (match) setActivePreset(match.id)
        else setActivePreset('custom')
      }
    }
  }, [dlConfig])

  // Preview template on change
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!isElectron || !window.electronAPI?.downloadsPreviewNamingTemplate) {
        setPreviewResult(namingTemplate.replace(/\{(\w+)\}/g, 'sample'))
        return
      }
      try {
        const res = await window.electronAPI.downloadsPreviewNamingTemplate(namingTemplate, 'Stellar.Blade.REPACK-DELUSION')
        if (res.valid) {
          setPreviewResult(res.result ?? namingTemplate)
          setValidTemplate(true)
        } else {
          setPreviewResult(null)
          setValidTemplate(false)
        }
      } catch {
        setPreviewResult(null)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [namingTemplate, isElectron])

  const handlePresetChange = (presetId: string) => {
    const preset = NAMING_PRESETS.find(p => p.id === presetId)
    if (preset) {
      setActivePreset(preset.id)
      setNamingTemplate(preset.template)
    }
  }

  const handleTemplateChange = (value: string) => {
    setNamingTemplate(value)
    setActivePreset('custom')
  }

  const handleSave = async () => {
    if (!user || !dlConfig) return
    await saveConfig({
      ...dlConfig,
      autoOrganizeEnabled,
      namingTemplate: namingTemplate || null,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!isElectron) return null

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-[-0.01em]">Game Organizer</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Auto-rename and organize downloaded games into structured library folders (like Radarr/Sonarr).
        </p>
      </div>

      {/* Enable toggle */}
      <div className="rounded-2xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-md)] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Auto-organize downloads</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Automatically rename and move completed downloads to your library
            </p>
          </div>
          <DkSwitch checked={autoOrganizeEnabled} onCheckedChange={setAutoOrganizeEnabled} />
        </div>
      </div>

      {/* Presets */}
      <div className="rounded-2xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-md)] p-5 space-y-4">
        <h3 className="text-sm font-semibold">Naming Template</h3>
        <p className="text-xs text-muted-foreground -mt-2">
          How organized files and folders should be named.
        </p>

        {/* Preset pills */}
        <div className="flex flex-wrap gap-1.5">
          {NAMING_PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => handlePresetChange(p.id)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                activePreset === p.id
                  ? 'bg-primary/20 text-primary ring-1 ring-primary/30'
                  : 'bg-[var(--dk-surface-raised)] text-muted-foreground hover:bg-[var(--dk-surface-glass)] ring-1 ring-border/20',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Template editor */}
        <div>
          <label className="text-xs font-medium text-muted-foreground">Template</label>
          <textarea
            value={namingTemplate}
            onChange={e => handleTemplateChange(e.target.value)}
            rows={3}
            className={cn(
              'mt-1 w-full rounded-lg bg-[var(--dk-surface-raised)] px-3 py-2 text-xs font-mono outline-none ring-1 transition-all',
              validTemplate ? 'ring-border/30 focus:ring-primary/40' : 'ring-red-500/50 focus:ring-red-500/70',
            )}
            placeholder="{Title} ({Year}) [{Platform}]/{Title} ({Year}) [{Platform}].{ext}"
          />
          {!validTemplate && (
            <p className="text-xs text-red-400 mt-1">Template contains unknown tokens or missing {`{Title}`}</p>
          )}
        </div>

        {/* Token reference */}
        <div>
          <button
            onClick={() => setShowTokens(!showTokens)}
            className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {showTokens ? 'Hide' : 'Show'} available tokens &rarr;
          </button>
          {showTokens && (
            <div className="mt-2 space-y-0.5 bg-[var(--dk-surface-raised)] rounded-lg p-3">
              {TOKEN_DOCS.map((doc, i) => (
                <p key={i} className="text-[11px] font-mono text-muted-foreground">{doc}</p>
              ))}
            </div>
          )}
        </div>

        {/* Preview */}
        {previewResult && (
          <div>
            <p className="text-xs font-medium text-muted-foreground">Preview</p>
            <p className="mt-1 text-xs font-mono bg-[var(--dk-surface-raised)] rounded-lg p-2.5 break-all text-foreground/80">
              {previewResult}
            </p>
            <p className="text-[11px] text-muted-foreground/60 mt-1">
              Sample: <code>Stellar.Blade.REPACK-DELUSION</code>
            </p>
          </div>
        )}
      </div>

      {/* Save */}
      <div className="flex items-center justify-end gap-2">
        {saved && (
          <span className="flex items-center gap-1 text-xs text-green-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Saved
          </span>
        )}
        <DkButton size="sm" variant="primary" onClick={handleSave} className="shadow-none">
          Save Configuration
        </DkButton>
      </div>
    </div>
  )
}
