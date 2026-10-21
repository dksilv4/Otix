import type { ComponentType } from 'react'

export type DocCategoryId =
  | 'getting-started'
  | 'architecture'
  | 'guides'
  | 'plugins'
  | 'shortcuts'
  | 'troubleshooting'

export type DocSectionId =
  | 'overview'
  | 'installation'
  | 'setup-wizard'
  | 'architecture'
  | 'byos-streaming'
  | 'node-daemon'
  | 'library-management'
  | 'game-launcher'
  | 'media-streaming'
  | 'arr-suite'
  | 'progression-xp'
  | 'session-privacy'
  | 'plugin-architecture'
  | 'plugin-development'
  | 'command-palette'
  | 'hotkeys'
  | 'troubleshooting-node'
  | 'troubleshooting-codecs'
  | 'diagnostics-logs'

export interface DocSubheading {
  id: string
  title: string
}

export type DocCalloutKind = 'note' | 'tip' | 'important' | 'warning'

export interface DocCallout {
  kind: DocCalloutKind
  title?: string
  text: string
}

export interface DocCodeSnippet {
  language: string
  label?: string
  code: string
}

export interface DocStepItem {
  step: number
  title: string
  description: string
  code?: DocCodeSnippet
}

export interface DocTableData {
  headers: string[]
  rows: string[][]
}

export interface DocContentBlock {
  type:
    | 'paragraph'
    | 'callout'
    | 'code'
    | 'steps'
    | 'table'
    | 'subheading'
    | 'bullet-list'
    | 'action-button'
  text?: string
  items?: string[]
  subheading?: DocSubheading
  callout?: DocCallout
  code?: DocCodeSnippet
  steps?: DocStepItem[]
  table?: DocTableData
  action?: {
    label: string
    type: 'setup-wizard' | 'settings' | 'external'
    target?: string
  }
}

export interface DocArticle {
  id: DocSectionId
  categoryId: DocCategoryId
  title: string
  shortTitle?: string
  tagline: string
  badge?: string
  subheadings: DocSubheading[]
  blocks: DocContentBlock[]
  keywords: string[]
}

export interface DocCategory {
  id: DocCategoryId
  title: string
  icon: ComponentType<{ className?: string }>
  description: string
  articles: DocArticle[]
}

export interface DocSearchResult {
  article: DocArticle
  matchedSnippet: string
  matchType: 'title' | 'subheading' | 'content' | 'keyword'
}
