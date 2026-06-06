// TODO: Review this file
import './organizer-section.scss'
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
  const isDesktop = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('electron')
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
      if (!isDesktop || !window.desktopAPI?.downloadsPreviewNamingTemplate) {
        setPreviewResult(namingTemplate.replace(/\{(\w+)\}/g, 'sample'))
        return
      }
      try {
        const res = await window.desktopAPI.downloadsPreviewNamingTemplate(namingTemplate, 'Stellar.Blade.REPACK-DELUSION')
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
  }, [namingTemplate, isDesktop])

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

  if (!isDesktop) return null

  return (
    <div className="dk-settings-organizer">
      <div>
        <h2 className="dk-settings-organizer__title">Game Organizer</h2>
        <p className="dk-settings-organizer__description">
          Auto-rename and organize downloaded games into structured library folders (like Radarr/Sonarr).
        </p>
      </div>

      {/* Enable toggle */}
      <div className="dk-settings-organizer__card">
        <div className="dk-settings-organizer__row">
          <div>
            <p className="dk-settings-organizer__label">Auto-organize downloads</p>
            <p className="dk-settings-organizer__hint">
              Automatically rename and move completed downloads to your library
            </p>
          </div>
          <DkSwitch checked={autoOrganizeEnabled} onCheckedChange={setAutoOrganizeEnabled} />
        </div>
      </div>

      {/* Presets */}
      <div className="dk-settings-organizer__card">
        <h3 className="dk-settings-organizer__section-title">Naming Template</h3>
        <p className="dk-settings-organizer__section-hint">
          How organized files and folders should be named.
        </p>

        {/* Preset pills */}
        <div className="dk-settings-organizer__preset-group">
          {NAMING_PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => handlePresetChange(p.id)}
              className={cn(
                'dk-settings-organizer__preset-pill',
                activePreset === p.id
                  ? 'dk-settings-organizer__preset-pill--active'
                  : 'dk-settings-organizer__preset-pill--inactive',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Template editor */}
        <div>
          <label className="dk-settings-organizer__template-label">Template</label>
          <textarea
            value={namingTemplate}
            onChange={e => handleTemplateChange(e.target.value)}
            rows={3}
            className={cn(
              'dk-settings-organizer__template-input',
              validTemplate
                ? 'dk-settings-organizer__template-input--valid'
                : 'dk-settings-organizer__template-input--invalid',
            )}
            placeholder="{Title} ({Year}) [{Platform}]/{Title} ({Year}) [{Platform}].{ext}"
          />
          {!validTemplate && (
            <p className="dk-settings-organizer__error">Template contains unknown tokens or missing {`{Title}`}</p>
          )}
        </div>

        {/* Token reference */}
        <div>
          <button
            onClick={() => setShowTokens(!showTokens)}
            className="dk-settings-organizer__token-toggle"
          >
            {showTokens ? 'Hide' : 'Show'} available tokens &rarr;
          </button>
          {showTokens && (
            <div className="dk-settings-organizer__token-list">
              {TOKEN_DOCS.map((doc, i) => (
                <p key={i} className="dk-settings-organizer__token-item">{doc}</p>
              ))}
            </div>
          )}
        </div>

        {/* Preview */}
        {previewResult && (
          <div>
            <p className="dk-settings-organizer__preview-label">Preview</p>
            <p className="dk-settings-organizer__preview-result">
              {previewResult}
            </p>
            <p className="dk-settings-organizer__preview-hint">
              Sample: <code>Stellar.Blade.REPACK-DELUSION</code>
            </p>
          </div>
        )}
      </div>

      {/* Save */}
      <div className="dk-settings-organizer__save-bar">
        {saved && (
          <span className="dk-settings-organizer__saved-indicator">
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
