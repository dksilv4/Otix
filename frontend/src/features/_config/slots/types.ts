// frontend/src/features/_config/slots/types.ts

export interface SlotWidget {
  type: string
  key?: string
  props: Record<string, unknown>
  children?: SlotWidget[]
  conditions?: {
    feature?: string
    permission?: string
  }
}

export interface SlotRenderResult {
  widgets: SlotWidget[]
}

export interface SlotContribution {
  pluginId: string
  label: string
  data: SlotRenderResult
}

export interface PluginSettingsTab {
  id: string
  label: string
  icon: string
  path: string
  sections: PluginSettingsSection[]
}

export interface PluginSettingsSection {
  id: string
  label: string
  slot: string
}

export interface SlotError {
  pluginId: string
  label: string
  location: string
  error: string
  suspended: boolean
}
