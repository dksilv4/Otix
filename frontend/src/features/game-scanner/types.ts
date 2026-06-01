// frontend/src/features/game-scanner/types.ts

export interface UpdateFile {
  name: string;
  path: string;
}

export interface DetectedGame {
  id: string;
  title: string;
  exePath: string;
  localExePath?: string;
  installDir: string;
  platform: 'steam' | 'pc' | 'iso' | 'epic' | 'gog' | 'battlenet' | 'ubisoft' | 'ea' | 'riot' | 'xbox' | 'itch';
  sources?: string[];
  iconUrl?: string;
  updateFiles?: UpdateFile[];
  otixMediaId?: string;
  otixMediaTitle?: string;
  otixMediaSlug?: string;
  otixConfidence?: number;
  otixPosterUrl?: string | null;
  otixTextlessPosterUrl?: string | null;
  otixLogoUrl?: string | null;
  otixMatchSuggestion?: {
    mediaId: string;
    title: string;
    slug: string;
  };
}

export interface MountResult {
  driveLetter: string;
  setupPath?: string;
  crackPath?: string;
  crackName?: string;
}

export interface OrganizationPreviewItem {
  sourcePath: string;
  sourceFilename: string;
  type: "iso" | "update";
  matched: boolean;
  extracted: Record<string, string>;
  targetPath: string;
}

export interface OrgExecutionResult {
  sourcePath: string;
  targetPath: string;
  success: boolean;
  error?: string;
}

export interface AnalyzedUpdate {
  file: UpdateFile;
  from?: string;
  to: string;
  cleanName: string;
  isDuplicate: boolean;
  isGapBefore: boolean;
  gapVersion?: string;
}

export type Platform = "all" | "steam" | "pc" | "iso" | "epic" | "gog" | "battlenet" | "ubisoft" | "ea" | "riot" | "xbox" | "itch";

export type InstallerStep = 1 | 2 | 3 | 4;

export type OrgPreset = "scene" | "simple" | "custom";

export const ORG_PRESETS: Record<
  OrgPreset,
  {
    label: string;
    regex: string;
    isoTemplate: string;
    updateTemplate: string;
  }
> = {
  scene: {
    label: "Scene Standard",
    regex:
      "^(?<title>.+?)\\.v(?<version>\\d+(?:\\.\\d+)*)[.-](?<group>\\w+)\\.(?<ext>.+)$",
    isoTemplate: "{title}/{title}.v{version}-{group}.{ext}",
    updateTemplate: "{title}/Updates/{title} update v{version}.{ext}",
  },
  simple: {
    label: "Simple Naming",
    regex: "^(?<title>.+?)\\s+v?(?<version>\\d+(?:\\.\\d+)*)\\.(?<ext>.+)$",
    isoTemplate: "{title}/{title} v{version}.{ext}",
    updateTemplate: "{title}/Updates/{title} update v{version}.{ext}",
  },
  custom: {
    label: "Custom Regex",
    regex: "(?<title>.+)",
    isoTemplate: "{title}/{filename}",
    updateTemplate: "Updates/{filename}",
  },
};

export const STORAGE_KEYS = {
  PATHS: "otix_scanner_paths",
  ISO_PATHS: "otix_scanner_iso_paths",
  GAMES: "otix_scanned_games",
  LOCAL_MAP: "otix_local_games_map",
} as const;
