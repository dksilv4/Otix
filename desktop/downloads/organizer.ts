/**
 * Auto game organizer — arr-style (Radarr/Sonarr/Lidarr) for game.
 *
 * Triggered after SABnzbd download completes:
 *   1. Find downloaded content (ISOs, PC game folders, update files)
 *   2. Parse release name to extract {title, year, edition, group, version}
 *   3. Apply naming template to produce clean target paths
 *   4. Execute moves via installer.ts:executeOrganization()
 *   5. Update DB with organized paths
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { cleanGameTitle, extractGroup, parseVersion, type ParsedRelease, type FileInfo } from '../game/parser';
import { executeOrganization, OrganizationPreviewItem } from '../installer';
import { getConnection } from '../db';
const __db = getConnection('downloads');

// ── Types ───────────────────────────────────────────────────────────────────

export interface DownloadedContent {
  /** Absolute path to the file or folder */
  path: string;
  /** Base name */
  name: string;
  /** Content type */
  type: 'iso' | 'pc_game' | 'update' | 'unknown';
  /** Size in bytes (for details) */
  size?: number;
}

export interface AutoOrganizeResult {
  success: boolean;
  organized: { from: string; to: string; type: string }[];
  errors: string[];
}

// ── Naming presets ──────────────────────────────────────────────────────────

export interface NamingPreset {
  label: string;
  template: string;
}

export const NAMING_PRESETS: Record<string, NamingPreset> = {
  standard: {
    label: 'Standard (arr-style)',
    template: '{Title} ({Year}) [{Platform}]/{OriginalName}.{ext}',
  },
  scene: {
    label: 'Scene Standard',
    template: '{Title}/{Title}.v{Version}-{ReleaseGroup}.{ext}',
  },
  simple: {
    label: 'Simple',
    template: '{Title}/{Title}.{ext}',
  },
  yearFlat: {
    label: 'Flat by Year',
    template: '{Title} ({Year})/{Title}.{ext}',
  },
  folderOnly: {
    label: 'Smart Folder',
    template: '{Title} ({Year}) [{Platform}]/{OriginalName}.{ext}',
  },
};

// ── Ignored dirs (copy of IGNORED_DIRS from scanner.ts / ORG_IGNORED_DIRS from installer.ts) ──

const SKIP_DIRS = new Set([
  'node_modules', 'bower_components', '.git', '.github', '.svn', '.hg',
  'system32', 'syswow64', 'windows', 'microsoft.net', 'appdata',
  'obj', 'bin', '__pycache__', '.venv', 'venv', 'env', 'windowsapps',
]);

// ── Release name parsing ─────────────────────────────────────────────────────

/**
 * Parse a release name (folder or NZB title) into structured metadata.
 *
 * Strategy cascade:
 *   1. Scene format:    Game.Name.REPACK-GROUP
 *   2. Elamigos format: Game Name V##### Group Password=...
 *   3. Year in title:   Game Name (2024) [...]
 *   4. Generic:         cleanGameTitle() + extractGroup() fallback
 */
export function parseReleaseName(rawName: string): ParsedRelease {
  const base: ParsedRelease = {
    title: '',
    cleanTitle: cleanGameTitle(rawName),
    rawName,
    isScene: false,
  };

  // Strategy 1: Scene format — dots as separators, dash-delimited group
  //   "Stellar.Blade.REPACK-DELUSION"
  //   "The.Witcher.3.GOTY.Edition-GOG"
  let m: RegExpMatchArray | null;

  // EDITION keywords for detection
  const EDITION_RE = /(?<edition>goty|game\s*of\s*the\s*year|definitive|enhanced|remastered|ultimate|complete|deluxe|collectors|special|legendary|anniversary)\s*edition/gi;

  // Attempt scene parse: dotted name, optional version, edition, group suffix
  m = rawName.match(
    /^(?<title>[A-Za-z0-9._+\-]+?)\.?(?:v?(?<version>\d+(?:\.\d+)*))?[._-]?(?<extra>REPACK|PROPER|UPDATE|MULTI\d*|GOTY|DEF|ENHANCED)?[._-](?<group>[A-Za-z0-9]{2,20})$/,
  );
  if (m?.groups) {
    const g = m.groups;
    let title = g.title.replace(/[._]/g, ' ').trim();
    // Detect and strip edition from title
    const edMatch = title.match(EDITION_RE);
    const edition = edMatch ? edMatch[0].trim() : undefined;
    if (edition) title = title.replace(edition, '').trim();

    // Detect year in remaining title
    const yearMatch = title.match(/\b(?<year>(?:19|20)\d{2})\b/);
    const year = yearMatch?.groups?.year;

    return {
      title: title.replace(/\s+/g, ' ').trim(),
      cleanTitle: cleanGameTitle(rawName),
      year,
      edition,
      platform: undefined,
      group: g.group || undefined,
      version: g.version || undefined,
      rawName,
      isScene: true,
    };
  }

  // Strategy 2: Elamigos / repack format — spaces, V#####, trailing group
  //   "Clair Obscur Expedition 33 V61339 ElAmigos Password=..."
  m = rawName.match(
    /^(?<title>.+?)\s+(?:v?(?<version>\d{3,}))?\s*(?<group>[A-Za-z0-9]+?)(?:\s+password=.*)?$/i,
  );
  if (m?.groups) {
    let title = m.groups.title.trim();
    const edMatch = title.match(EDITION_RE);
    const edition = edMatch ? edMatch[0].trim() : undefined;
    if (edition) title = title.replace(edition, '').trim();
    const yearMatch = title.match(/\b(?<year>(?:19|20)\d{2})\b/);
    return {
      title: title.replace(/\s+/g, ' ').trim(),
      cleanTitle: cleanGameTitle(rawName),
      year: yearMatch?.groups?.year,
      edition,
      group: m.groups.group || undefined,
      version: m.groups.version || undefined,
      rawName,
      isScene: false,
    };
  }

  // Strategy 3: Generic with year/edition — parentheses or brackets
  //   "Game Name (2024) [Multi] [RUS]"
  m = rawName.match(
    /^(?<title>.+?)\s*[\[\(](?<year>(?:19|20)\d{2})[\]\)]/,
  );
  if (m?.groups) {
    let title = m.groups.title.replace(/[._]/g, ' ').trim();
    const edMatch = title.match(EDITION_RE);
    const edition = edMatch ? edMatch[0].trim() : undefined;
    if (edition) title = title.replace(edition, '').trim();
    // Detect platform mention
    const platMatch = rawName.match(/\[(?<platform>Multi|PC|PS\d|Xbox|Switch|Steam|GOG|Android|iOS)\]/i);
    return {
      title: title.replace(/\s+/g, ' ').trim(),
      cleanTitle: cleanGameTitle(rawName),
      year: m.groups.year,
      edition,
      platform: platMatch?.groups?.platform,
      group: extractGroup(rawName) ?? undefined,
      version: parseVersion(rawName)?.toString(),
      rawName,
      isScene: false,
    };
  }

  // Strategy 4: Fallback — cleanGameTitle + extractGroup
  //   "Game_Name_REPACK"  →  cleanGameTitle()
  let title = cleanGameTitle(rawName);
  const edMatch = rawName.match(EDITION_RE);
  const edition = edMatch ? edMatch[0].trim() : undefined;
  if (edition) title = title.replace(new RegExp(edition.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '').trim();

  // Year: only match in brackets or as last word before extension (not mid-title like Cyberpunk 2077)
  const yearBracket = rawName.match(/[\[\(](?<year>(?:19|20)\d{2})[\]\)]/);
  const yearEnd = rawName.match(/(?:\s|\.)(?<year>(?:19|20)\d{2})(?:\s*\.\w+)?$/);
  const year = yearBracket?.groups?.year || yearEnd?.groups?.year;
  const platMatch = rawName.match(/\[(?<platform>Multi|PC|PS\d|Xbox|Switch|Steam|GOG|Android|iOS)\]/i);

  return {
    title: title.replace(/\s+/g, ' ').trim(),
    cleanTitle: title,
    year,
    edition,
    platform: platMatch?.groups?.platform,
    group: extractGroup(rawName) ?? undefined,
    version: parseVersion(rawName)?.toString(),
    rawName,
    isScene: false,
  };
}

// ── Content discovery ────────────────────────────────────────────────────────

/**
 * Recursively walk a download directory and find all downloadable content.
 *
 * Returns ISO files, PC game folders (directories containing .exe files),
 * and update/patch executable files.
 */
export async function findDownloadedContent(
  dirPath: string,
  maxDepth = 3,
): Promise<DownloadedContent[]> {
  const results: DownloadedContent[] = [];
  const seen = new Set<string>();

  async function traverse(currentDir: string, depth: number) {
    if (depth > maxDepth) return;
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      let hasExe = false;
      const childDirs: string[] = [];

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (seen.has(fullPath)) continue;
        seen.add(fullPath);

        if (entry.isDirectory()) {
          const nameLower = entry.name.toLowerCase();
          if (nameLower.startsWith('$') || SKIP_DIRS.has(nameLower)) continue;

          if (depth < maxDepth) {
            childDirs.push(fullPath);
          }
        } else if (entry.isFile()) {
          const nameLower = entry.name.toLowerCase();

          if (nameLower.endsWith('.iso')) {
            results.push({ path: fullPath, name: entry.name, type: 'iso' });
          } else if (
            nameLower.endsWith('.exe') &&
            (nameLower.includes('update') || nameLower.includes('patch')) &&
            !nameLower.includes('setup') &&
            !nameLower.includes('uninst') &&
            !nameLower.includes('crash') &&
            !nameLower.includes('helper')
          ) {
            results.push({ path: fullPath, name: entry.name, type: 'update' });
          } else if (nameLower.endsWith('.exe') && !nameLower.includes('setup') && !nameLower.includes('uninst') && !nameLower.includes('crash') && !nameLower.includes('helper') && !nameLower.includes('check') && !nameLower.includes('hash') && !nameLower.includes('redist')) {
            hasExe = true;
          }
        }
      }

      // If this directory contains executables, mark as PC game folder.
      // Depth 1 IS the download folder, so any depth is valid.
      if (hasExe) {
        results.push({ path: currentDir, name: path.basename(currentDir), type: 'pc_game' });
      }

      // Recurse into child dirs
      for (const childDir of childDirs) {
        await traverse(childDir, depth + 1);
      }
    } catch {
      // Permission errors, etc. — skip silently
    }
  }

  await traverse(dirPath, 1);
  return results;
}

// ── Template application ────────────────────────────────────────────────────

const VALID_TOKENS = new Set([
  'Title', 'CleanTitle', 'Year', 'Edition', 'Platform',
  'ReleaseGroup', 'Version', 'OriginalName', 'MediaType', 'ext',
]);

/**
 * Apply a naming template to a parsed release + file info.
 *
 * Template format follows arr-style:
 *   "{Title} ({Year}) [{Platform}]/{Title} ({Year}) [{Platform}].{ext}"
 * Everything before the last / is the folder path, the rest is the filename.
 *
 * Returns the absolute target path.
 */
export function applyNamingTemplate(
  release: ParsedRelease,
  template: string,
  fileInfo: FileInfo,
  baseDir?: string,
): string {
  const tokens: Record<string, string> = {
    Title: release.title,
    CleanTitle: release.cleanTitle,
    Year: release.year ?? '',
    Edition: release.edition ?? '',
    Platform: release.platform ?? 'PC',
    ReleaseGroup: release.group ?? '',
    Version: release.version ?? '',
    OriginalName: release.rawName,
    MediaType: fileInfo.type === 'iso' ? 'ISO' : fileInfo.type === 'pc_game' ? 'PC' : 'Update',
    ext: fileInfo.ext,
  };

  let result = template;
  for (const [key, value] of Object.entries(tokens)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '');
  }

  // Clean up empty bracket pairs left by missing tokens (arr-style)
  result = result.replace(/\(\s*\)/g, '').replace(/\[\s*\]/g, '').replace(/\{\s*\}/g, '');
  // Clean double slashes, trailing slashes, double spaces, trailing spaces before /
  result = result
    .replace(/[\\/]+/g, '/')
    .replace(/\/$/, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+\//g, '/')
    .replace(/\/\s+/g, '/')
    // Strip trailing dot when ext is empty (folders)
    .replace(/\.$/, '')
    .trim();

  // If a base directory is provided, resolve relative to it
  if (baseDir) {
    return path.join(baseDir, result);
  }
  return result;
}

/**
 * Validate a naming template string — ensures all tokens are known.
 */
export function validateNamingTemplate(template: string): { valid: boolean; error?: string } {
  const foundTokens = template.match(/\{(\w+)\}/g) || [];
  for (const tok of foundTokens) {
    const name = tok.slice(1, -1);
    if (!VALID_TOKENS.has(name)) {
      return { valid: false, error: `Unknown token: {${name}}` };
    }
  }
  if (!template.includes('{Title}') && !template.includes('{CleanTitle}')) {
    return { valid: false, error: 'Template must include {Title} or {CleanTitle}' };
  }
  return { valid: true };
}

/**
 * Smart-preview a directory using parseReleaseName + naming template.
 * Returns OrganizationPreviewItem[] compatible with executeOrganization.
 */
export async function smartOrganizePreview(
  directory: string,
  namingTemplate: string,
  separator?: 'space' | 'dot' | 'underscore' | 'dash',
): Promise<OrganizationPreviewItem[]> {
  const content = await findDownloadedContent(directory, 5);
  const items: OrganizationPreviewItem[] = [];

  for (const item of content) {
    const release = parseReleaseName(item.name);
    let title = release.title;

    // For update files, strip update/patch noise and version digits from title
    if (item.type === 'update') {
      title = title
        .replace(/\b(update|patch|hotfix)\b\s*\d*\.?\d*/gi, '')
        .replace(/\b\d+(?:[\s.]\d+)+\b/g, '')  // version-like digit clusters
        .replace(/\s{2,}/g, ' ')
        .trim();
    }

    // Apply separator to title
    if (separator && separator !== 'space') {
      const sepChar = separator === 'dot' ? '.' : separator === 'underscore' ? '_' : '-';
      title = title.replace(/\s+/g, sepChar);
    }

    const fileInfo: FileInfo = {
      name: item.name,
      ext: path.extname(item.name).substring(1),
      type: item.type,
    };

    const targetRaw = applyNamingTemplate(
      { ...release, title },
      namingTemplate,
      fileInfo,
      directory,
    );

    const mappedType: 'iso' | 'update' = item.type === 'pc_game' || item.type === 'unknown' ? 'iso' : item.type;
    items.push({
      sourcePath: item.path,
      sourceFilename: item.name,
      type: mappedType,
      matched: true,
      extracted: {
        title: release.title,
        year: release.year ?? '',
        edition: release.edition ?? '',
        group: release.group ?? '',
        version: release.version ?? '',
      },
      targetPath: targetRaw,
    });
  }

  return items;
}

/**
 * Preview what a template would produce for a sample release name.
 */
export function previewNamingTemplate(
  template: string,
  sampleName: string,
): { valid: boolean; result?: string; error?: string } {
  const validation = validateNamingTemplate(template);
  if (!validation.valid) return validation;

  const release = parseReleaseName(sampleName);
  const ext = sampleName.includes('.iso') ? 'iso' : 'exe';
  const fileInfo: FileInfo = { name: sampleName, ext, type: 'iso' };
  const target = applyNamingTemplate(release, template, fileInfo, '/');
  return { valid: true, result: target.replace(/^\//, '') };
}

/**
 * Batch-organize all game files in a directory using configured naming template.
 *
 * Scans for ISOs + update files, parses each name, applies the template,
 * and moves files. Unlike autoOrganizeDownload, this takes a raw directory
 * path (not a download ID) — for manually organizing existing libraries.
 */
export async function batchOrganizeDirectory(
  directory: string,
  namingTemplate?: string,
): Promise<AutoOrganizeResult> {
  const result: AutoOrganizeResult = { success: false, organized: [], errors: [] };

  // Load template from config if not provided
  let template: string = namingTemplate ?? '';
  if (!template) {
    const cfg = __db.prepare('SELECT naming_template FROM download_configs ORDER BY updated_at DESC LIMIT 1').get() as any;
    template = cfg?.naming_template || NAMING_PRESETS.standard.template;
  }

  const validation = validateNamingTemplate(template);
  if (!validation.valid) {
    result.errors.push(validation.error || 'Invalid naming template');
    return result;
  }

  try {
    await fs.access(directory);
  } catch {
    result.errors.push('Directory not accessible');
    return result;
  }

  // Find all content
  const content = await findDownloadedContent(directory, 5);
  if (content.length === 0) {
    result.errors.push('No game files found in directory');
    return result;
  }

  // Build organize items
  const organizeItems: { sourcePath: string; targetPath: string }[] = [];

  for (const item of content) {
    const release = parseReleaseName(item.name);
    let fileInfo: FileInfo;
    let target: string;

    if (item.type === 'pc_game') {
      fileInfo = { name: item.name, ext: '', type: 'pc_game' };
      const folderTemplate = template.split('/').slice(0, -1).join('/') || template;
      target = applyNamingTemplate(release, folderTemplate, fileInfo, directory);
      organizeItems.push({ sourcePath: item.path, targetPath: target });
    } else {
      fileInfo = {
        name: item.name,
        ext: path.extname(item.name).substring(1),
        type: item.type,
      };
      target = applyNamingTemplate(release, template, fileInfo, directory);
      organizeItems.push({ sourcePath: item.path, targetPath: target });
    }
  }

  // Execute
  const execResults = await executeOrganization(organizeItems);

  for (const r of execResults) {
    if (r.success) {
      result.organized.push({ from: r.sourcePath, to: r.targetPath, type: 'game' });
    } else {
      result.errors.push(r.error || `Failed to move ${r.sourcePath}`);
    }
  }

  result.success = result.errors.length === 0;
  return result;
}

/**
 * Preview what batchOrganizeDirectory would do (no file moves).

// ── Organizer ────────────────────────────────────────────────────────────────

/**
 * Main entry point: organize a completed download.
 *
 * Called from postProcessDownload() when autoOrganizeEnabled.
 */
export async function autoOrganizeDownload(
  downloadId: string,
  configId: string,
  fallbackSource?: string,
  fallbackDest?: string,
): Promise<AutoOrganizeResult> {
  const result: AutoOrganizeResult = { success: false, organized: [], errors: [] };

  const dl = __db.prepare('SELECT * FROM downloads WHERE id = ? AND status = ?').get(downloadId, 'completed') as any;
  if (!dl) {
    result.errors.push('Download not found or not completed');
    return result;
  }

  // Get config for template settings
  const config = __db.prepare('SELECT * FROM download_configs WHERE id = ?').get(configId) as any;
  const namingTemplate: string = config?.naming_template || NAMING_PRESETS.standard.template;

  // Build path translation pairs (same logic as postProcessDownload)
  const mappings = __db.prepare(
    'SELECT source_path, dest_path FROM download_path_mappings WHERE config_id = ?'
  ).all(configId) as { source_path: string; dest_path: string }[];
  const pairs: { source: string; dest: string }[] = mappings.map(m => ({
    source: m.source_path,
    dest: m.dest_path,
  }));
  if (pairs.length === 0 && fallbackSource && fallbackDest) {
    pairs.push({ source: fallbackSource, dest: fallbackDest });
  }

  if (pairs.length === 0) {
    result.errors.push('No path mappings configured');
    return result;
  }

  const nzbName: string = dl.nzb_name ?? '';
  const baseName = path.basename(nzbName, path.extname(nzbName));

  // Translate source path (same as postProcessDownload translatePath)
  function translatePath(originalPath: string, pair: { source: string; dest: string }): string | null {
    const normPath = originalPath.replace(/[/\\]/g, path.sep);
    const normSource = pair.source.replace(/[/\\]/g, path.sep);
    const normDest = pair.dest.replace(/[/\\]/g, path.sep);
    if (normPath.startsWith(normSource)) {
      return normDest + normPath.substring(normSource.length);
    }
    return null;
  }

  // Find content in download location
  const sourceCandidates: string[] = [];
  for (const pair of pairs) {
    sourceCandidates.push(
      path.join(pair.source, baseName),
      path.join(pair.source, `_UNPACK_${baseName}`),
      path.join(pair.source, nzbName),
    );
    if (dl.iso_path) sourceCandidates.unshift(dl.iso_path);
  }

  let allContent: DownloadedContent[] = [];
  let effectiveDest = fallbackDest || pairs[0]?.dest || '';

  for (const candidate of sourceCandidates) {
    for (const pair of pairs) {
      const translated = translatePath(candidate, pair);
      const dirToScan = translated || candidate;
      try {
        await fs.access(dirToScan);
        const contents = await findDownloadedContent(dirToScan);
        allContent.push(...contents);
        effectiveDest = pair.dest;
      } catch {
        // dir not accessible, try next candidate
      }
    }
  }

  // Deduplicate content by path
  const seenPaths = new Set<string>();
  allContent = allContent.filter(c => {
    if (seenPaths.has(c.path)) return false;
    seenPaths.add(c.path);
    return true;
  });

  if (allContent.length === 0) {
    result.errors.push('No downloadable content found in download directory');
    return result;
  }

  // Parse release name
  const release = parseReleaseName(baseName);

  // For each content item, generate target path and organize
  const organizeItems: { sourcePath: string; targetPath: string }[] = [];

  for (const content of allContent) {
    let fileInfo: FileInfo;
    let targetDir: string;

    if (content.type === 'pc_game') {
      // PC game folder: move entire folder
      fileInfo = { name: content.name, ext: '', type: 'pc_game' };
      const folderTarget = applyNamingTemplate(
        { ...release, title: release.title || content.name },
        namingTemplate.split('/').slice(0, -1).join('/') || namingTemplate,
        fileInfo,
        effectiveDest,
      );
      // For folder moves, target is the folder itself, not a file inside it
      targetDir = folderTarget;
      organizeItems.push({ sourcePath: content.path, targetPath: targetDir });
    } else {
      // File-based (ISO, update)
      fileInfo = {
        name: content.name,
        ext: path.extname(content.name).substring(1),
        type: content.type,
      };
      const target = applyNamingTemplate(release, namingTemplate, fileInfo, effectiveDest);
      organizeItems.push({ sourcePath: content.path, targetPath: target });
    }
  }

  // Execute organization
  const execResults = await executeOrganization(organizeItems);

  // Collect results
  for (const r of execResults) {
    if (r.success) {
      result.organized.push({ from: r.sourcePath, to: r.targetPath, type: 'game' });
    } else {
      result.errors.push(r.error || `Failed to move ${r.sourcePath}`);
    }
  }

  // Update DB with organized paths
  if (result.organized.length > 0) {
    const movedPaths = result.organized.map(m => m.to).join(';');
    __db.prepare("UPDATE downloads SET iso_path = ?, updated_at = datetime('now') WHERE id = ?").run(movedPaths, downloadId);
  }

  result.success = result.errors.length === 0;
  return result;
}
