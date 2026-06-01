import { exec } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

function execPromise(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve(stdout.trim());
    });
  });
}

export interface MountResult {
  driveLetter: string;
  setupPath?: string;
  crackPath?: string;
  crackName?: string;
  mappedDrive?: string;
}

// Global registry for mapped network drives to ensure cleanup on dismount
const mappedDrivesRegistry = new Map<string, string>();

async function getFreeDriveLetter(): Promise<string | null> {
  const letters = 'ZYXWVUTSRQPONMLKJIHGFED'.split('');
  for (const letter of letters) {
    try {
      await fs.access(`${letter}:\\`);
    } catch {
      // Access failed, drive letter is likely available
      return letter;
    }
  }
  return null;
}

// Mount the ISO using PowerShell and find drive letter, setup.exe, and crack folder
export async function mountIso(isoPath: string): Promise<MountResult> {
  let targetIsoPath = isoPath;
  let mappedDrive: string | undefined;

  if (isoPath.startsWith('\\\\')) {
    const freeLetter = await getFreeDriveLetter();
    if (!freeLetter) {
      throw new Error('No free drive letters available to map the UNC network path.');
    }
    const isoDir = path.dirname(isoPath);
    const isoName = path.basename(isoPath);
    
    console.log(`[mountIso] Mapping UNC folder "${isoDir}" to drive letter ${freeLetter}:`);
    try {
      await execPromise(`net use ${freeLetter}: "${isoDir}"`);
      mappedDrive = `${freeLetter}:`;
      targetIsoPath = `${freeLetter}:\\${isoName}`;
      mappedDrivesRegistry.set(isoPath, `${freeLetter}:`);
    } catch (err: any) {
      console.error(`[mountIso] Failed to map UNC folder to ${freeLetter}:`, err);
      throw new Error(`Failed to map network folder: ${err.message || err}`);
    }
  }

  const escapedPath = targetIsoPath.replace(/'/g, "''");
  console.log(`[mountIso] Mounting disk image from: "${targetIsoPath}"`);
  
  // Mount ISO and return volume drive letter
  const mountCmd = `powershell -Command "Mount-DiskImage -ImagePath '${escapedPath}' -PassThru | Get-Volume | Select-Object -ExpandProperty DriveLetter"`;
  
  let driveLetter = '';
  try {
    driveLetter = await execPromise(mountCmd);
  } catch (err: any) {
    console.error(`[mountIso] PowerShell Mount-DiskImage failed:`, err);
    // Cleanup mapped drive if mount fails
    if (mappedDrive) {
      try {
        await execPromise(`net use ${mappedDrive} /delete /y`);
      } catch {}
      mappedDrivesRegistry.delete(isoPath);
    }
    throw new Error(`PowerShell Mount-DiskImage failed: ${err.message || err}`);
  }
  
  if (!driveLetter) {
    if (mappedDrive) {
      try {
        await execPromise(`net use ${mappedDrive} /delete /y`);
      } catch {}
      mappedDrivesRegistry.delete(isoPath);
    }
    throw new Error('Failed to mount ISO or obtain drive letter. Make sure the ISO file is not corrupted.');
  }

  const driveRoot = `${driveLetter}:\\`;
  console.log(`[mountIso] ISO successfully mounted on virtual drive: "${driveRoot}"`);
  
  let setupPath: string | undefined;
  let crackPath: string | undefined;
  let crackName: string | undefined;
  
  try {
    const entries = await fs.readdir(driveRoot, { withFileTypes: true });
    
    // Common installer executable names
    const setupNames = new Set(['setup.exe', 'install.exe', 'autorun.exe', 'setup-1.exe']);
    
    // Common crack group folder names
    const crackFolders = new Set(['codex', 'plaza', 'hoodlum', 'skidrow', 'flt', 'rune', 'crack', 'goldberg', 'emu', 'razor1911', 'fairlight']);
    
    for (const entry of entries) {
      const nameLower = entry.name.toLowerCase();
      if (entry.isFile() && setupNames.has(nameLower)) {
        setupPath = path.join(driveRoot, entry.name);
      } else if (entry.isDirectory() && (crackFolders.has(nameLower) || nameLower.includes('crack'))) {
        crackPath = path.join(driveRoot, entry.name);
        crackName = entry.name;
      }
    }
  } catch (err) {
    console.error('Error reading mounted ISO drive:', err);
  }

  return {
    driveLetter: `${driveLetter}:`,
    setupPath,
    crackPath,
    crackName,
    mappedDrive,
  };
}

// Dismount the ISO image using PowerShell and cleanup any mapped drives
export async function dismountIso(isoPath: string): Promise<boolean> {
  let targetIsoPath = isoPath;
  const mappedDrive = mappedDrivesRegistry.get(isoPath);

  if (mappedDrive) {
    const isoName = path.basename(isoPath);
    targetIsoPath = `${mappedDrive}\\${isoName}`;
  }

  const escapedPath = targetIsoPath.replace(/'/g, "''");
  console.log(`[dismountIso] Dismounting disk image from: "${targetIsoPath}"`);
  const cmd = `powershell -Command "Dismount-DiskImage -ImagePath '${escapedPath}'"`;
  
  try {
    await execPromise(cmd);
  } catch (err) {
    console.error('[dismountIso] PowerShell Dismount-DiskImage failed:', err);
  }

  if (mappedDrive) {
    console.log(`[dismountIso] Unmapping drive letter: ${mappedDrive}`);
    try {
      await execPromise(`net use ${mappedDrive} /delete /y`);
    } catch (err) {
      console.error(`[dismountIso] Failed to delete mapped drive ${mappedDrive}:`, err);
    }
    mappedDrivesRegistry.delete(isoPath);
  }

  return true;
}

// Helper to copy directory recursively
async function copyDir(src: string, dest: string) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

// Copy crack files from mounted directory to game target install folder
export async function applyCrack(crackPath: string, targetDir: string): Promise<boolean> {
  try {
    await copyDir(crackPath, targetDir);
    return true;
  } catch (err) {
    console.error('Failed to copy crack files:', err);
    throw err;
  }
}

export interface OrganizationPreviewItem {
  sourcePath: string;
  sourceFilename: string;
  type: 'iso' | 'update';
  matched: boolean;
  extracted: Record<string, string>;
  targetPath: string;
}

const ORG_IGNORED_DIRS = new Set([
  'node_modules', 'bower_components', '.git', '.github', '.svn', '.hg',
  'system32', 'syswow64', 'windows', 'microsoft.net', 'appdata',
  'obj', 'bin', '__pycache__', '.venv', 'venv', 'env', 'windowsapps'
]);

// Helper to scan directory recursively (depth up to 5) for iso and update files
async function collectFilesToOrganize(currentDir: string, maxDepth = 5): Promise<{ path: string; name: string; type: 'iso' | 'update' }[]> {
  const files: { path: string; name: string; type: 'iso' | 'update' }[] = [];

  async function traverse(dir: string, depth: number) {
    if (depth > maxDepth) return;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const nameLower = entry.name.toLowerCase();
          if (nameLower.startsWith('$') || ORG_IGNORED_DIRS.has(nameLower)) continue;
          await traverse(fullPath, depth + 1);
        } else if (entry.isFile() || entry.isSymbolicLink()) {
          const nameLower = entry.name.toLowerCase();
          if (nameLower.endsWith('.iso')) {
            files.push({ path: fullPath, name: entry.name, type: 'iso' });
          } else if (
            nameLower.endsWith('.exe') &&
            (nameLower.includes('update') || nameLower.includes('patch')) &&
            !nameLower.includes('setup') &&
            !nameLower.includes('uninst') &&
            !nameLower.includes('crash') &&
            !nameLower.includes('helper')
          ) {
            files.push({ path: fullPath, name: entry.name, type: 'update' });
          }
        }
      }
    } catch (err) {
      console.error(`Error reading directory for organization: ${dir}`, err);
    }
  }

  await traverse(currentDir, 1);
  return files;
}

// Generate a preview of organized files
export async function previewOrganization(
  directory: string,
  regexPattern: string,
  isoTemplate: string,
  updateTemplate: string
): Promise<OrganizationPreviewItem[]> {
  const files = await collectFilesToOrganize(directory);
  let regex: RegExp;
  try {
    regex = new RegExp(regexPattern, 'i');
  } catch (err: any) {
    throw new Error(`Invalid Regular Expression: ${err.message}`);
  }

  const items: OrganizationPreviewItem[] = [];

  for (const file of files) {
    const filename = file.name;
    const match = filename.match(regex);
    let matched = !!match;
    const groups = match?.groups || {};

    const interpolationData: Record<string, string> = {
      filename: filename,
      ext: path.extname(filename).substring(1),
      type: file.type,
      ...groups,
    };

    if (interpolationData.title) {
      // clean title dots/underscores to spaces
      interpolationData.title = interpolationData.title
        .replace(/[\._]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    const template = file.type === 'iso' ? isoTemplate : updateTemplate;

    // If template requires title and title is empty, treat as unmatched
    if (matched && template.includes('{title}') && !interpolationData.title) {
      matched = false;
    }

    let relativeTarget = template;
    for (const [key, value] of Object.entries(interpolationData)) {
      const safeValue = value || '';
      relativeTarget = relativeTarget.replace(new RegExp(`\\{${key}\\}`, 'g'), safeValue);
    }

    // Clean up paths: change slashes to system-specific path separator
    relativeTarget = relativeTarget
      .replace(/[\\/]+/g, '/')
      .replace(/^\//, '')
      .replace(/\/$/, '');

    const targetPath = path.join(directory, relativeTarget);

    items.push({
      sourcePath: file.path,
      sourceFilename: filename,
      type: file.type,
      matched,
      extracted: Object.fromEntries(
        Object.entries(interpolationData).filter(([k]) => k !== 'filename' && k !== 'ext' && k !== 'type')
      ),
      targetPath,
    });
  }

  return items;
}

// Clean empty directories recursively
async function cleanEmptyDirs(dir: string, rootDir: string) {
  if (dir === rootDir) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          await cleanEmptyDirs(path.join(dir, entry.name), rootDir);
        }
      }
    } catch {}
    return;
  }

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await cleanEmptyDirs(path.join(dir, entry.name), rootDir);
      }
    }

    const remaining = await fs.readdir(dir);
    if (remaining.length === 0) {
      await fs.rmdir(dir);
    }
  } catch {}
}

// Execute the movements
export async function executeOrganization(
  items: { sourcePath: string; targetPath: string }[]
): Promise<{ sourcePath: string; targetPath: string; success: boolean; error?: string }[]> {
  const results: { sourcePath: string; targetPath: string; success: boolean; error?: string }[] = [];

  for (const item of items) {
    if (item.sourcePath === item.targetPath) {
      results.push({
        sourcePath: item.sourcePath,
        targetPath: item.targetPath,
        success: true,
      });
      continue;
    }

    try {
      const targetDir = path.dirname(item.targetPath);
      await fs.mkdir(targetDir, { recursive: true });
      await fs.rename(item.sourcePath, item.targetPath);
      results.push({
        sourcePath: item.sourcePath,
        targetPath: item.targetPath,
        success: true,
      });
    } catch (err: any) {
      console.error(`Failed to move file from ${item.sourcePath} to ${item.targetPath}`, err);
      results.push({
        sourcePath: item.sourcePath,
        targetPath: item.targetPath,
        success: false,
        error: err.message || String(err),
      });
    }
  }

  // Clean empty folders recursively inside root parent directories of moved files
  const roots = new Set<string>();
  for (const item of items) {
    const parent = path.dirname(item.sourcePath);
    roots.add(parent);
  }

  for (const root of roots) {
    try {
      await cleanEmptyDirs(root, root);
    } catch (cleanErr) {
      console.warn(`Failed to clean empty directories under ${root}:`, cleanErr);
    }
  }

  return results;
}

export async function launchSetup(setupPath: string): Promise<boolean> {
  const escapedPath = setupPath.replace(/'/g, "''");
  const cmd = `powershell -Command "Start-Process -FilePath '${escapedPath}' -Wait"`;
  console.log(`[launchSetup] Running installer and waiting for exit: ${cmd}`);
  try {
    await execPromise(cmd);
    return true;
  } catch (err: any) {
    console.error(`[launchSetup] Installer execution failed or was cancelled:`, err);
    throw err;
  }
}

