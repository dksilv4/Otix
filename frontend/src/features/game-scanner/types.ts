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
  posterUrl?: string; // SGDB grid (cover/poster) URL
  updateFiles?: UpdateFile[];
  otixMediaId?: string;
  otixMediaTitle?: string;
  otixMediaSlug?: string;
  otixConfidence?: number;
  otixPosterUrl?: string | null;
  otixTextlessPosterUrl?: string | null;
  otixBackdropUrl?: string | null;
  otixIconUrl?: string | null;
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

export type InstallPhase = 'mounting' | 'detecting' | 'installing' | 'cracking' | 'finishing' | 'done' | 'error';

export interface InstallProgress {
  phase: InstallPhase;
  progress: number;     // 0-100, used for the progress bar
  message: string;      // human-readable status line
  pct?: number;         // parsed percentage from installer window title (0-100)
  waitMin?: number | null; // parsed "Wait N min" from window title, null if not available
}

export interface InstallResult {
  success: boolean;
  installDir: string;
  gameExe?: string;
  crackApplied?: boolean;
  error?: string;
}

export type OrgPreset = "scene" | "simple" | "clean" | "custom";

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
  clean: {
    label: "Clean Title",
    regex: "^(?<title>.+)\\.(?<ext>[^.]+)$",
    isoTemplate: "{title}/{title}.{ext}",
    updateTemplate: "{title}/Updates/{title} update.{ext}",
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
