import { SAMPLE_RELEASES, formatTemplateSample, ISO_FOLDER_PRESETS } from './naming-template'

export const SCAN_ON_LAUNCH_KEY = 'otix:scan-on-launch'

export const readScanOnLaunch = (): boolean => {
  try {
    return localStorage.getItem(SCAN_ON_LAUNCH_KEY) === 'true'
  } catch {
    return false
  }
}

export function getPresetSamplePreview(template: string): string {
  if (!template) return ''
  return formatTemplateSample(template, SAMPLE_RELEASES[0])
}

export interface DirectoryOrganizeRule {
  namingTemplate?: string
  presetId?: string
  autoOrganizeEnabled?: boolean
}

export type DirectoryRulesMap = Record<string, DirectoryOrganizeRule>

export const DIRECTORY_RULES_STORAGE_KEY_PREFIX = 'otix:organize-directory-rules'

export function getDirectoryRulesKey(nodeId?: number | null): string {
  return `${DIRECTORY_RULES_STORAGE_KEY_PREFIX}:${nodeId ?? 'global'}`
}

export function loadStoredDirectoryRules(nodeId?: number | null): DirectoryRulesMap {
  try {
    const raw = localStorage.getItem(getDirectoryRulesKey(nodeId))
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function saveStoredDirectoryRules(rules: DirectoryRulesMap, nodeId?: number | null): void {
  try {
    localStorage.setItem(getDirectoryRulesKey(nodeId), JSON.stringify(rules))
  } catch {
    // ignore
  }
}

export function canonicalPath(p: string | null | undefined): string {
  if (!p) return ''
  return p.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

export interface AvailableDirectoryOption {
  value: string
  label: string
  isDefault?: boolean
}

export function buildDirectoryOptions(
  scanPaths: Array<{ path: string; type?: string }>,
  isoDownloadPath?: string,
): AvailableDirectoryOption[] {
  const options: AvailableDirectoryOption[] = [
    { value: 'all', label: 'All Directories (Default)', isDefault: true },
  ]

  const seenCanonical = new Set<string>()

  // Register designated ISO download path first if non-empty
  if (isoDownloadPath && isoDownloadPath.trim()) {
    const trimmed = isoDownloadPath.trim()
    const canon = canonicalPath(trimmed)
    if (canon) {
      seenCanonical.add(canon)
      options.push({
        value: trimmed,
        label: `ISO Library: ${trimmed}`,
      })
    }
  }

  for (const item of scanPaths) {
    if (!item?.path) continue
    const trimmed = item.path.trim()
    if (!trimmed) continue
    const canon = canonicalPath(trimmed)
    if (!canon || seenCanonical.has(canon)) continue
    seenCanonical.add(canon)
    options.push({
      value: trimmed,
      label: `${item.type === 'iso' ? 'ISO Library' : 'Game Library'}: ${trimmed}`,
    })
  }

  return options
}

export function resolveDirectoryTemplate(
  selectedDirectory: string,
  baseTemplate: string,
  directoryRules: DirectoryRulesMap,
): { template: string; presetId: string; isCustomRule: boolean } {
  if (selectedDirectory === 'all') {
    const match = ISO_FOLDER_PRESETS.find((p) => p.template === baseTemplate)
    return {
      template: baseTemplate,
      presetId: match?.id ?? 'custom',
      isCustomRule: false,
    }
  }

  let rule = directoryRules[selectedDirectory]
  if (!rule) {
    const canonTarget = canonicalPath(selectedDirectory)
    for (const [key, val] of Object.entries(directoryRules)) {
      if (canonicalPath(key) === canonTarget) {
        rule = val
        break
      }
    }
  }

  if (!rule) {
    const match = ISO_FOLDER_PRESETS.find((p) => p.template === baseTemplate)
    return {
      template: baseTemplate,
      presetId: match?.id ?? 'custom',
      isCustomRule: false,
    }
  }

  const template = rule.namingTemplate || baseTemplate
  const match = ISO_FOLDER_PRESETS.find((p) => p.template === template)

  return {
    template,
    presetId: rule.presetId || (match?.id ?? 'custom'),
    isCustomRule: true,
  }
}
