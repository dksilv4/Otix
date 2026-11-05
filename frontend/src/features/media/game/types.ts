export interface BlueprintPluginAPI {
  callData: (pluginId: string, method: string, payload?: Record<string, unknown>) => Promise<any>
}

export interface ParsedBlueprint {
  type: string
  label: string
  description: string
  icons: string[]
  entities: Record<string, number>
  entityCount: number
  tiles: Record<string, number>
  tileCount: number
  dimensions: { width: number; height: number }
  version: string
  raw: string
  id?: string
  tags?: string[]
  created_at?: string
}

export interface CommunityBlueprint {
  id: string
  author_name: string
  title: string
  description: string
  parsed_data: any
  tags: string[]
  downloads: number
  likes_count: number
  user_has_liked: boolean
  created_at: string
}

export interface GameTab {
  tabId: string
  label: string
  pluginId: string
}
