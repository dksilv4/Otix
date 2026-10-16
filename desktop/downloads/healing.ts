import * as fs from 'fs/promises';
import * as path from 'path';

export interface ArchiveAnomaly {
  file?: string;
  type:
    | 'INCOMPLETE_DOWNLOAD'
    | 'DUPLICATE_NAME_COLLISION'
    | 'NAMING_VARIATION'
    | 'MISSING_ELAMIGOS_PREFIX'
    | 'MISSING_FITGIRL_PREFIX'
    | 'MISSING_SEQUENCE_CHUNK';
  suggested?: string;
  missing?: string;
  message: string;
}

export interface ArchiveDiagnosis {
  isRepack: boolean;
  archiveType: string;
  health: 'HEALTHY' | 'CORRECTABLE_ANOMALY' | 'INCOMPLETE_DOWNLOAD' | 'GENERIC';
  anomalies: ArchiveAnomaly[];
  suggestedRenames: Record<string, string>;
}

export interface ArchiveHealingResult {
  directory: string;
  isRepack: boolean;
  archiveType: string;
  health: string;
  renamed: { from: string; to: string; success: boolean; error?: string }[];
  anomalies: ArchiveAnomaly[];
}

/**
 * Pure analyzer for repack archive integrity (ElAmigos, FitGirl, DODI, InnoSetup).
 * Identifies missing prefixes, duplicate collisions from browser downloads,
 * non-canonical naming variations, incomplete .part/.tmp downloads, and sequence gaps.
 */
export function analyzeRepackArchiveIntegrity(
  childFiles: string[],
  folderName = '',
  archiveTypeHint?: string,
): ArchiveDiagnosis {
  const anomalies: ArchiveAnomaly[] = [];
  const suggestedRenames: Record<string, string> = {};

  const nameContext = `${folderName} ${childFiles.join(' ')}`.toLowerCase();
  const isElAmigos = archiveTypeHint === 'ElAmigos' || nameContext.includes('elamigos') ||
    childFiles.some((f) => f.toLowerCase().startsWith('elamigos'));
  const isFitGirl = archiveTypeHint === 'FitGirl' || nameContext.includes('fitgirl') ||
    childFiles.some((f) => f.toLowerCase().startsWith('fg-') || f.toLowerCase().startsWith('setup-fitgirl'));
  const isDodi = archiveTypeHint === 'DODI' || nameContext.includes('dodi') ||
    childFiles.some((f) => f.toLowerCase().includes('dodi'));

  // Collect all bin/archive candidates in the package
  const archiveFiles = childFiles.filter((f) => {
    const l = f.toLowerCase();
    return (
      l.endsWith('.bin') ||
      l.endsWith('.cab') ||
      l.endsWith('.doi') ||
      /\.bin(?:\.part|\.tmp|\.crdownload|\.downloading|\.bak|\.orig|\s*\(\d+\))$/i.test(l) ||
      /\b(?:setup|elamigos|data|game|archive)[-_0-9]+.*(?:\.bin|\.cab|\.doi)/i.test(l)
    );
  });

  if (archiveFiles.length === 0) {
    return { isRepack: false, archiveType: 'Generic', anomalies, suggestedRenames, health: 'GENERIC' };
  }

  // 1. ElAmigos Archive Integrity
  // InnoSetup expects: elamigos-1.bin, elamigos-2.bin, elamigos-3.bin...
  if (isElAmigos) {
    archiveFiles.forEach((f, idx) => {
      const lower = f.toLowerCase();

      // Incomplete download check (.part, .tmp, .crdownload, .downloading)
      if (/\.(part|crdownload|tmp|downloading)$/i.test(lower)) {
        anomalies.push({
          file: f,
          type: 'INCOMPLETE_DOWNLOAD',
          message: `Incomplete download part detected: '${f}'. The ElAmigos installer will fail until downloaded completely.`,
        });
        return;
      }

      // Windows duplicate download collision: elamigos-2 (1).bin, elamigos-2 - Copy.bin
      const dupMatch =
        lower.match(/^(el[-_]?amigos[-_]?\d+)\s*\(\d+\)\.bin$/) ||
        lower.match(/^(el[-_]?amigos[-_]?\d+)\s*-\s*copy\.bin$/);
      if (dupMatch) {
        const canonical = `${dupMatch[1].replace(/[-_]+/g, '-')}.bin`;
        suggestedRenames[f] = canonical;
        anomalies.push({
          file: f,
          type: 'DUPLICATE_NAME_COLLISION',
          suggested: canonical,
          message: `Improperly named duplicate: '${f}'. ElAmigos setup.exe will fail ('File not found: ${canonical}'). Renaming to '${canonical}' required.`,
        });
        return;
      }

      // Hyphen/underscore variations: el-amigos-1.bin, el_amigos_1.bin, elamigos_1.bin
      const varMatch = lower.match(/^el[-_]amigos[-_](\d+)\.bin$/) || lower.match(/^elamigos_(\d+)\.bin$/);
      if (varMatch) {
        const canonical = `elamigos-${varMatch[1]}.bin`;
        if (f !== canonical) {
          suggestedRenames[f] = canonical;
          anomalies.push({
            file: f,
            type: 'NAMING_VARIATION',
            suggested: canonical,
            message: `Non-canonical separator: '${f}'. ElAmigos installer expects '${canonical}'.`,
          });
        }
        return;
      }

      // Missing 'elamigos-' prefix completely: e.g. data-2.bin, 2.bin, setup-1.bin, part2.bin
      if (!lower.startsWith('elamigos-') && !lower.startsWith('elamigos.')) {
        const numMatch = lower.match(/(?:^|[-_.a-z])(\d+)\.bin$/i);
        const chunkNum = numMatch ? numMatch[1] : (archiveFiles.length === 1 ? '1' : String(idx + 1));
        const canonical = `elamigos-${chunkNum}.bin`;

        suggestedRenames[f] = canonical;
        anomalies.push({
          file: f,
          type: 'MISSING_ELAMIGOS_PREFIX',
          suggested: canonical,
          message: `ElAmigos bin file missing prefix: '${f}' does not have 'elamigos-' in its name. The installer will fail to find it ('File not found: ${canonical}'). Renaming to '${canonical}' fixes the installer.`,
        });
      }
    });

    // Sequence completeness check: e.g. 1 and 3 present, 2 missing
    const foundIndices = new Set<number>();
    archiveFiles.forEach((f) => {
      const targetName = suggestedRenames[f] || f;
      const m = targetName.toLowerCase().match(/^elamigos-(\d+)\.bin$/);
      if (m) foundIndices.add(parseInt(m[1], 10));
    });

    if (foundIndices.size > 0) {
      const maxIndex = Math.max(...Array.from(foundIndices));
      for (let i = 1; i <= maxIndex; i++) {
        if (!foundIndices.has(i)) {
          anomalies.push({
            type: 'MISSING_SEQUENCE_CHUNK',
            missing: `elamigos-${i}.bin`,
            message: `Missing archive chunk: 'elamigos-${i}.bin' is missing from the package sequence (found up to chunk ${maxIndex}). The installer will stop midway.`,
          });
        }
      }
    }
  } else if (isFitGirl) {
    // FitGirl expects: fg-01.bin / setup-fitgirl-1.bin, fg-optional-*.bin
    archiveFiles.forEach((f, idx) => {
      const lower = f.toLowerCase();
      if (!lower.startsWith('setup-fitgirl-') && !lower.startsWith('fg-') && lower.endsWith('.bin')) {
        const numMatch = lower.match(/(\d+)\.bin$/);
        const chunk = numMatch ? numMatch[1] : String(idx + 1);
        const canonical = `setup-fitgirl-${chunk}.bin`;
        suggestedRenames[f] = canonical;
        anomalies.push({
          file: f,
          type: 'MISSING_FITGIRL_PREFIX',
          suggested: canonical,
          message: `FitGirl bin file missing prefix: '${f}'. Installer expects '${canonical}'.`,
        });
      }
    });
  } else {
    // Generic InnoSetup / repack packages (setup-1.bin, setup-2.bin, ...)
    archiveFiles.forEach((f) => {
      const lower = f.toLowerCase();
      const dupMatch = lower.match(/^(setup[-_]?\d+)\s*\(\d+\)\.bin$/);
      if (dupMatch) {
        const canonical = `${dupMatch[1].replace(/[-_]+/g, '-')}.bin`;
        suggestedRenames[f] = canonical;
        anomalies.push({
          file: f,
          type: 'DUPLICATE_NAME_COLLISION',
          suggested: canonical,
          message: `Improperly named duplicate: '${f}'. Installer expects '${canonical}'.`,
        });
      }
    });
  }

  const hasIncomplete = anomalies.some((a) => a.type === 'INCOMPLETE_DOWNLOAD');
  const hasRenames = Object.keys(suggestedRenames).length > 0;
  const health = hasIncomplete ? 'INCOMPLETE_DOWNLOAD' : hasRenames ? 'CORRECTABLE_ANOMALY' : 'HEALTHY';

  return {
    isRepack: true,
    archiveType: isElAmigos ? 'ElAmigos' : isFitGirl ? 'FitGirl' : isDodi ? 'DODI' : 'InnoSetup',
    health,
    anomalies,
    suggestedRenames,
  };
}

/**
 * Diagnoses an archive folder on disk without modifying any files.
 */
export async function diagnoseArchiveIntegrity(dirPath: string): Promise<ArchiveDiagnosis> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const childFiles = entries.filter((e) => e.isFile()).map((e) => e.name);
    return analyzeRepackArchiveIntegrity(childFiles, path.basename(dirPath));
  } catch {
    return {
      isRepack: false,
      archiveType: 'Unknown',
      health: 'GENERIC',
      anomalies: [],
      suggestedRenames: {},
    };
  }
}

/**
 * Automatically heals malformed archive files in a repack directory by renaming them
 * to their expected canonical filenames.
 */
export async function healRepackArchive(dirPath: string): Promise<ArchiveHealingResult> {
  const diagnosis = await diagnoseArchiveIntegrity(dirPath);
  const result: ArchiveHealingResult = {
    directory: dirPath,
    isRepack: diagnosis.isRepack,
    archiveType: diagnosis.archiveType,
    health: diagnosis.health,
    renamed: [],
    anomalies: diagnosis.anomalies,
  };

  const renames = Object.entries(diagnosis.suggestedRenames);
  if (renames.length === 0) {
    return result;
  }

  for (const [from, to] of renames) {
    if (from === to) continue;
    const srcPath = path.join(dirPath, from);
    const dstPath = path.join(dirPath, to);

    try {
      // Check if target already exists and isn't the same file
      let targetExists = false;
      try {
        await fs.access(dstPath);
        targetExists = true;
      } catch {
        targetExists = false;
      }

      if (targetExists) {
        result.renamed.push({
          from,
          to,
          success: false,
          error: `Target file '${to}' already exists in folder; skipped to prevent overwrite`,
        });
        continue;
      }

      await fs.rename(srcPath, dstPath);
      result.renamed.push({ from, to, success: true });
    } catch (err: any) {
      result.renamed.push({
        from,
        to,
        success: false,
        error: err.message || String(err),
      });
    }
  }

  return result;
}
