import { exec, execFile, execSync, spawn } from 'child_process';
import { openSync, readSync, closeSync, statSync } from 'fs';
import * as fs from 'fs/promises';
import * as https from 'https';
import * as path from 'path';
import { getConnection } from '../db';
import type Database from 'better-sqlite3';

let __installDb: Database.Database | null = null;
function installDb(): Database.Database {
  if (!__installDb) __installDb = getConnection('downloads');
  return __installDb;
}
import { tmpdir } from 'os';
import { createWriteStream, existsSync, readdirSync } from 'fs';
import { cleanGameTitle } from '../game/parser';

function execPromise(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve(stdout.trim());
    });
  });
}

/**
 * Mutes any Windows audio sessions belonging to `pid` and all its descendants.
 * Uses WASAPI (Windows Core Audio) via a temp PowerShell script file.
 * Fire-and-forget — failures are silently ignored.
 */
function muteProcessAudio(pid: number): void {
  const ps = `
$ErrorActionPreference = 'SilentlyContinue'

# Build full process tree from root PID
function Get-Tree([int]$root) {
  $tree = @($root)
  $changed = $true
  while ($changed) {
    $changed = $false
    $all = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue
    foreach ($p in $all) {
      if ($tree -contains $p.ParentProcessId -and $tree -notcontains $p.ProcessId) {
        $tree += $p.ProcessId
        $changed = $true
      }
    }
  }
  return $tree
}

$cs = @'
using System;
using System.Runtime.InteropServices;
[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int GetDefaultAudioEndpoint(int f, int r, out IMMDevice d); }
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid id, int ctx, IntPtr p, out object o); }
[ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISimpleAudioVolume { int SetMute(bool m, ref Guid g); int GetMute(out bool m); }
[ComImport, Guid("C8ADBD64-E71E-48a0-A4DE-D864F36B7414"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionManager2 { int GetSessionEnumerator(out IAudioSessionEnumerator e); }
[ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionEnumerator { int GetCount(out int n); int GetSession(int i, out IAudioSessionControl s); }
[ComImport, Guid("F4B1A599-7266-4319-A8CA-E70ACB10E3D5"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionControl { }
[ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionControl2 {
  int GetState(out int s); int GetDisplayName(out IntPtr n); int GetIconPath(out IntPtr p);
  int GetGroupingParam(out Guid g); int RegisterAudioSessionNotification(IntPtr c);
  int UnregisterAudioSessionNotification(IntPtr c); int GetSessionIdentifier(out IntPtr i);
  int GetSessionInstanceIdentifier(out IntPtr i); int GetProcessId(out uint pid);
}
public class OtixMuter {
  public static int MutePids(uint[] pids) {
    int muted = 0;
    try {
      var enType = Type.GetTypeFromCLSID(new Guid("BCDE0358-D378-4A37-82C3-40BD7D46F873"));
      var en = (IMMDeviceEnumerator)Activator.CreateInstance(enType);
      IMMDevice dev; en.GetDefaultAudioEndpoint(0, 1, out dev);
      var iid = new Guid("770D5002-8A09-486B-809C-C15C1338519E");
      object mgr; dev.Activate(ref iid, 23, IntPtr.Zero, out mgr);
      IAudioSessionEnumerator se; ((IAudioSessionManager2)mgr).GetSessionEnumerator(out se);
      int cnt; se.GetCount(out cnt);
      var set = new System.Collections.Generic.HashSet<uint>(pids);
      for (int i = 0; i < cnt; i++) {
        IAudioSessionControl sc; se.GetSession(i, out sc);
        uint pid; ((IAudioSessionControl2)sc).GetProcessId(out pid);
        if (set.Contains(pid)) {
          var g = Guid.Empty; ((ISimpleAudioVolume)sc).SetMute(true, ref g);
          muted++;
        }
      }
    } catch {}
    return muted;
  }
}
'@

Add-Type -TypeDefinition $cs -ErrorAction SilentlyContinue
$tree = Get-Tree ${pid}
$uintPids = $tree | ForEach-Object { [uint32]$_ }
$count = [OtixMuter]::MutePids($uintPids)
Write-Output "Muted $count session(s) for PID tree rooted at ${pid}"
`.trimStart()

  try {
    const tmpFile = path.join(tmpdir(), `otix-mute-${pid}.ps1`)
    require('fs').writeFileSync(tmpFile, ps, 'utf-8')
    exec(
      `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "${tmpFile}"`,
      { windowsHide: true },
      (err, stdout) => {
        try { require('fs').unlinkSync(tmpFile) } catch {}
        if (stdout?.trim()) console.log(`[muteProcessAudio] ${stdout.trim()}`)
        if (err) console.warn(`[muteProcessAudio] warn:`, err.message)
      }
    )
  } catch (e) {
    console.warn('[muteProcessAudio] setup error:', e)
  }
}

/**
 * Polls child processes of a given PID for a window title containing installer
 * progress info in the format emitted by Inno Setup / voices installers:
 *   "11.4%  Wait 45 min"  or  "Copying files... 73%"
 * Returns parsed { pct, waitMin, rawTitle } or null if nothing useful found.
 */
async function pollWindowTitleProgress(
  parentPid: number,
): Promise<{ pct: number; waitMin: number | null; rawTitle: string } | null> {
  try {
    // Walk full process tree under parentPid and collect all window titles
    const ps = [
      `$root = ${parentPid}`,
      `$all = @($root)`,
      `$q = [System.Collections.Queue]::new(); $q.Enqueue($root)`,
      `while ($q.Count) {`,
      `  $p = $q.Dequeue()`,
      `  $kids = Get-CimInstance Win32_Process -Filter "ParentProcessId=$p" -ErrorAction SilentlyContinue`,
      `  foreach ($k in $kids) { $all += $k.ProcessId; $q.Enqueue($k.ProcessId) }`,
      `}`,
      `$all | ForEach-Object {`,
      `  $proc = Get-Process -Id $_ -ErrorAction SilentlyContinue`,
      `  if ($proc -and $proc.MainWindowTitle) { Write-Output $proc.MainWindowTitle }`,
      `}`,
    ].join('; ')

    const out = execSync(
      `powershell -NoProfile -NonInteractive -Command "${ps}"`,
      { encoding: 'utf-8', windowsHide: true, timeout: 3000 },
    ).trim()

    if (!out) return null

    for (const line of out.split('\n').map(l => l.trim()).filter(Boolean)) {
      // Match "11.4%  Wait 45 min" or "73%" or "Copying files... 73%"
      const pctMatch = line.match(/(\d+(?:\.\d+)?)\s*%/)
      if (!pctMatch) continue
      const pct = parseFloat(pctMatch[1])
      const waitMatch = line.match(/Wait\s+(\d+)\s*min/i)
      const waitMin = waitMatch ? parseInt(waitMatch[1], 10) : null
      return { pct: Math.round(pct), waitMin, rawTitle: line }
    }
    return null
  } catch {
    return null
  }
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

// Resolve ISO path: normalize slashes, try search dirs, check dir contents.
/** Resolve ISO path: search scan roots for game folder, find .iso inside. */
function resolveIsoPath(raw: string, searchRoots?: string[]): string {
  let p = raw.replace(/\//g, '\\');

  // Already a full path with drive letter or UNC — let PowerShell handle it
  if (p.startsWith('\\\\') || /^[a-zA-Z]:\\/.test(p)) {
    return p;
  }

  // No drive letter — use game folder name (last path segment) + search roots
  const segments = p.replace(/^[/\\]+/, '').split(/[/\\]+/);
  const stem = segments[segments.length - 1];
  const isoName = stem + '.iso';
  const tried: string[] = [];

  for (const root of (searchRoots ?? [])) {
    const r = root.replace(/\//g, '\\');

    // 1. root\stem\stem.iso (common scene structure)
    const nested = path.join(r, stem, isoName);
    tried.push(nested);
    try { if (statSync(nested).isFile()) return nested; } catch {}

    // 2. root\stem.iso
    const flat = path.join(r, isoName);
    tried.push(flat);
    try { if (statSync(flat).isFile()) return flat; } catch {}

    // 3. Find any .iso in root\stem\
    const dir = path.join(r, stem);
    tried.push(dir + '\\ (scanning)');
    try {
      const entries: string[] = readdirSync(dir);
      const found = entries.find((e) => e.toLowerCase().endsWith('.iso'));
      if (found) return path.join(dir, found);
    } catch {}

    // 3b. Also try with full subpath (minus first segment = share name)
    if (segments.length > 1) {
      const sub = segments.slice(1).join('\\');
      const subNested = path.join(r, sub, isoName);
      tried.push(subNested);
      try { if (statSync(subNested).isFile()) return subNested; } catch {}
      const subFlat = path.join(r, sub) + '.iso';
      tried.push(subFlat);
      try { if (statSync(subFlat).isFile()) return subFlat; } catch {}
      const subDir = path.join(r, sub);
      tried.push(subDir + '\\ (scanning)');
      try {
        const entries: string[] = readdirSync(subDir);
        const found = entries.find((e) => e.toLowerCase().endsWith('.iso'));
        if (found) return path.join(subDir, found);
      } catch {}
    }

    // 4. root + full relative path
    const rel = p.replace(/^[/\\]+/, '');
    const full = path.join(r, rel);
    tried.push(full);
    try { if (statSync(full).isFile()) return full; } catch {}

    // 5. root + rel + .iso
    const fullIso = full + '.iso';
    tried.push(fullIso);
    try { if (statSync(fullIso).isFile()) return fullIso; } catch {}

    // 6. Find any .iso in root + rel\
    try {
      const entries: string[] = readdirSync(full);
      const found = entries.find((e) => e.toLowerCase().endsWith('.iso'));
      if (found) return path.join(full, found);
    } catch {}
  }

  // Fallback: current drive
  const cur = path.resolve(p);
  tried.push(cur);
  try { if (statSync(cur).isFile()) return cur; } catch {}
  const curIso = cur + '.iso';
  tried.push(curIso);
  try { if (statSync(curIso).isFile()) return curIso; } catch {}

  throw new Error(
    `ISO not found: "${raw}"\n` +
    `Scan roots: ${(searchRoots ?? ['(none)']).join(', ')}\n` +
    `Tried:\n${tried.map((t) => `  ${t}`).join('\n')}`
  );
}
// Mount the ISO using PowerShell and find drive letter, setup.exe, and crack folder
export async function mountIso(isoPath: string, searchRoots?: string[]): Promise<MountResult> {
  const resolved = resolveIsoPath(isoPath, searchRoots);

  let targetIsoPath = resolved;
  let mappedDrive: string | undefined;

  const effectivePath = resolved; // use resolved path for UNC detection, not the raw input
  if (effectivePath.startsWith('\\\\')) {
    const freeLetter = await getFreeDriveLetter();
    if (!freeLetter) {
      throw new Error('No free drive letters available to map the UNC network path.');
    }
    const isoDir = path.dirname(effectivePath);
    const isoName = path.basename(effectivePath);

    console.log(`[mountIso] Mapping UNC folder "${isoDir}" to drive letter ${freeLetter}:`);
    try {
      await execPromise(`net use ${freeLetter}: "${isoDir}"`);
      mappedDrive = `${freeLetter}:`;
      targetIsoPath = `${freeLetter}:\\${isoName}`;
      mappedDrivesRegistry.set(effectivePath, `${freeLetter}:`);
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
  updateTemplate: string,
  separator?: 'space' | 'dot' | 'underscore' | 'dash'
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
      // apply full cleanGameTitle to strip scene tags, version numbers, etc.
      interpolationData.title = cleanGameTitle(interpolationData.title);
      // apply user's separator preference
      if (separator && separator !== 'space') {
        const sepChar = separator === 'dot' ? '.' : separator === 'underscore' ? '_' : '-';
        interpolationData.title = interpolationData.title.replace(/\s+/g, sepChar);
      }
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

// ── Silent / Unattended install support ────────────────────────────────

export type InstallPhase =
  | 'mounting'
  | 'detecting'
  | 'installing'
  | 'cracking'
  | 'finishing'
  | 'done'
  | 'error';

export type InstallerType = 'innosetup' | 'innosetup-elamigos' | 'nsis' | 'installshield' | 'msi' | 'wise' | 'unknown';

export interface InstallProgress {
  phase: InstallPhase;
  progress: number;
  message: string;
}

export interface InstallResult {
  success: boolean;
  installDir: string;
  gameExe?: string;
  crackApplied?: boolean;
  error?: string;
}

/** Read first 64KB of setup.exe to detect installer type. Also checks for InnoSetup .bin files. */
export function detectInstallerType(setupPath: string): InstallerType {
  try {
    if (setupPath.toLowerCase().endsWith('.msi')) return 'msi';

    const buf = Buffer.alloc(65536);
    const fd = openSync(setupPath, 'r');
    const bytesRead = readSync(fd, buf, 0, 65536, 0);
    closeSync(fd);
    const header = buf.toString('utf-8', 0, bytesRead);

    // Inno Setup
    if (header.includes('Inno Setup') || header.includes('SetupForm') || header.includes('SetupLdr')) {
      if (header.includes('ElAmigos') || header.includes('elamigos')) return 'innosetup-elamigos';
      return 'innosetup';
    }

    // InstallShield
    if (header.includes('InstallShield') || header.includes('ishield') || header.includes('IKernel'))
      return 'installshield';

    // NSIS
    if (header.includes('Nullsoft') || header.includes('NSIS') || header.includes('nVisi'))
      return 'nsis';

    // Wise
    if (header.includes('Wise') || header.includes('WISE'))
      return 'wise';

    // Fallback: check for InnoSetup .bin data files (ElAmigos wrapper EXEs lack InnoSetup strings)
    try {
      const dir = path.dirname(setupPath);
      const entries = readdirSync(dir);
      const hasInnoBins = entries.some((e: string) => /^setup[-_]\d+\.bin$/i.test(e) || /\.bin$/i.test(e));
      if (hasInnoBins) {
        if (header.includes('ElAmigos') || header.includes('elamigos')) return 'innosetup-elamigos';
        return 'innosetup';
      }
    } catch {}

    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export function getSilentArgs(type: InstallerType, targetDir: string): string[] {
  switch (type) {
    case 'innosetup-elamigos':
    case 'innosetup':
      return [
        '/VERYSILENT',
        '/SUPPRESSMSGBOXES',
        '/NORESTART',
        `/DIR=${targetDir}`,
        '/LANG=english',
        '/NOICONS',
      ];
    case 'nsis':
      // NSIS /D=path must be the LAST argument and path without quotes
      return ['/S', `/D=${targetDir}`];
    case 'installshield':
      return ['-s', '-sms', '-f2"C:\\setup.log"'];
    case 'msi':
      return ['/quiet', '/qn', `TARGETDIR="${targetDir}"`, `INSTALLDIR="${targetDir}"`];
    case 'wise':
      return ['/s'];
    case 'unknown':
    default:
      return [
        '/VERYSILENT',
        '/SUPPRESSMSGBOXES',
        '/NORESTART',
        `/DIR=${targetDir}`,
        '/LANG=english',
      ];
  }
}

/** Run installer silently with given args. Returns true if exit code was 0. */
export async function runSilentInstall(
  setupPath: string,
  args: string[],
  onProgress?: (p: InstallProgress) => void,
): Promise<boolean> {
  // Start-Process with -ArgumentList array avoids quoting issues with /DIR="path"
  const escapedPath = setupPath.replace(/'/g, "''");
  const argStr = args.map((a) => `'${a.replace(/'/g, "''")}'`).join(', ');
  const cmd = `powershell -Command "Start-Process -FilePath '${escapedPath}' -ArgumentList @(${argStr}) -Wait"`;

  console.log(`[runSilentInstall] ${cmd}`);

  onProgress?.({
    phase: 'installing',
    progress: 40,
    message: 'Running silent installer...',
  });

  try {
    await execPromise(cmd);
    return true;
  } catch (err) {
    console.warn(`[runSilentInstall] Failed:`, err);
    return false;
  }
}

// Multi-instance install tracking — Map<installId, handle>
const _currentInstalls = new Map<string, { proc: import('child_process').ChildProcess | null; pid: number | null; killed: boolean }>();
// Metadata for active installs (survives proc cleanup for status queries)
const _installMeta = new Map<string, {
  isoPath: string;
  targetDir: string;
  gameTitle: string;
  startTime: number;
  lastPhase: string;
  lastProgress: number;
  lastMessage: string;
}>();

// ── Persistent install registry (survives Electron restarts) ────────────────

interface PersistedInstall {
  installId: string;
  pid: number;
  isoPath: string;
  targetDir: string;
  gameTitle: string;
  startTime: number;
}

function _addPersistedInstall(entry: PersistedInstall): void {
  try {
    installDb().prepare(
      `INSERT OR REPLACE INTO active_installs (install_id, pid, iso_path, target_dir, game_title, start_time)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(entry.installId, entry.pid, entry.isoPath, entry.targetDir, entry.gameTitle, entry.startTime);
  } catch (e) { console.warn('[install-persist] write error:', e); }
}

function _removePersistedInstall(installId: string): void {
  try {
    installDb().prepare('DELETE FROM active_installs WHERE install_id = ?').run(installId);
  } catch (e) { console.warn('[install-persist] remove error:', e); }
}

function _readPersistedInstalls(): PersistedInstall[] {
  try {
    return (installDb().prepare('SELECT * FROM active_installs').all() as any[]).map(r => ({
      installId: r.install_id,
      pid: r.pid,
      isoPath: r.iso_path,
      targetDir: r.target_dir,
      gameTitle: r.game_title,
      startTime: r.start_time,
    }));
  } catch { return []; }
}

function _isPidAlive(pid: number): boolean {
  try {
    const out = execSync(`tasklist /FI "PID eq ${pid}" /NH /FO CSV`, { encoding: 'utf-8', windowsHide: true });
    return out.includes(`"${pid}"`);
  } catch { return false; }
}

/**
 * Called once on Electron startup. Reads the persisted install registry, checks
 * which PIDs are still alive, and re-registers them so getActiveInstalls() returns
 * them and window-title progress polling resumes automatically.
 */
export function rehydrateActiveInstalls(): void {
  const persisted = _readPersistedInstalls();

  for (const entry of persisted) {
    if (!_isPidAlive(entry.pid)) {
      console.log(`[rehydrate] PID ${entry.pid} (${entry.gameTitle}) no longer running — removing`);
      _removePersistedInstall(entry.installId);  // clean stale row from DB
      continue;
    }
    console.log(`[rehydrate] Re-attaching to install PID ${entry.pid}: ${entry.gameTitle}`);

    // Restore metadata so getActiveInstalls() can report it
    _installMeta.set(entry.installId, {
      isoPath: entry.isoPath,
      targetDir: entry.targetDir,
      gameTitle: entry.gameTitle,
      startTime: entry.startTime,
      lastPhase: 'installing',
      lastProgress: 0,
      lastMessage: 'Resuming install tracking...',
    });

    // Synthetic handle — no ChildProcess reference, just PID
    _currentInstalls.set(entry.installId, { proc: null, pid: entry.pid, killed: false });

    // Re-mute the process (in case it was unmuted after restart)
    setTimeout(() => muteProcessAudio(entry.pid), 2000);

    // Poll window title for real progress; clean up when the process dies
    const interval = setInterval(async () => {
      const handle = _currentInstalls.get(entry.installId);
      if (!handle || handle.killed) { clearInterval(interval); return; }

      if (!_isPidAlive(entry.pid)) {
        console.log(`[rehydrate] PID ${entry.pid} finished. Cleaning up.`);
        clearInterval(interval);
        _currentInstalls.delete(entry.installId);
        _installMeta.delete(entry.installId);
        _removePersistedInstall(entry.installId);
        return;
      }

      const titleProgress = await pollWindowTitleProgress(entry.pid);
      const meta = _installMeta.get(entry.installId);
      if (meta && titleProgress) {
        const { pct, waitMin } = titleProgress;
        meta.lastPhase = 'installing';
        meta.lastProgress = Math.min(pct, 99);
        meta.lastMessage = waitMin != null
          ? `Installing... ${pct}% · ~${waitMin} min remaining`
          : `Installing... ${pct}%`;
      }
    }, 3000);
  }
}

export interface ActiveInstallInfo {
  installId: string;
  isoPath: string;
  targetDir: string;
  gameTitle: string;
  startTime: number;
  phase: string;
  progress: number;
  message: string;
}

/** Return info on all currently active installs. */
export function getActiveInstalls(): ActiveInstallInfo[] {
  const result: ActiveInstallInfo[] = [];
  for (const [id, meta] of _installMeta) {
    if (_currentInstalls.has(id)) {
      result.push({
        installId: id,
        isoPath: meta.isoPath,
        targetDir: meta.targetDir,
        gameTitle: meta.gameTitle,
        startTime: meta.startTime,
        phase: meta.lastPhase,
        progress: meta.lastProgress,
        message: meta.lastMessage,
      });
    }
  }
  return result;
}

/** Cancel a specific install by its ID. */
export function cancelInstall(installId: string): void {
  const handle = _currentInstalls.get(installId);
  if (handle && !handle.killed) {
    handle.killed = true;
    const pid = handle.pid ?? handle.proc?.pid;
    if (handle.proc) handle.proc.kill('SIGTERM');
    if (pid) {
      try { execSync(`taskkill /T /F /PID ${pid}`, { stdio: 'ignore', windowsHide: true }); } catch {}
    }
    _currentInstalls.delete(installId);
  }
  _installMeta.delete(installId);
  _removePersistedInstall(installId);
}

/** Cancel install by ISO path. */
export function cancelInstallByIsoPath(isoPath: string): void {
  for (const [id, meta] of _installMeta) {
    if (meta.isoPath === isoPath && _currentInstalls.has(id)) {
      cancelInstall(id);
      return;
    }
  }
}

/** Cancel all running installs (backwards-compat). */
export function cancelCurrentInstall(): void {
  for (const [id] of _currentInstalls) {
    cancelInstall(id);
  }
}

/** Register a process handle for a given install ID and persist PID to DB. */
function registerInstallProc(installId: string, proc: import('child_process').ChildProcess): void {
  const handle = { proc, pid: proc.pid ?? null, killed: false };
  _currentInstalls.set(installId, handle);

  // Persist PID to DB so we can re-attach if Electron restarts mid-install
  if (proc.pid) {
    const meta = _installMeta.get(installId);
    if (meta) {
      _addPersistedInstall({
        installId,
        pid: proc.pid,
        isoPath: meta.isoPath,
        targetDir: meta.targetDir,
        gameTitle: meta.gameTitle,
        startTime: meta.startTime,
      });
    }
  }

  const cleanup = () => {
    const h = _currentInstalls.get(installId);
    if (h === handle) _currentInstalls.delete(installId);
    _removePersistedInstall(installId);  // clean up DB on normal completion
  };
  proc.on('exit', cleanup);
  proc.on('close', cleanup);
}


/** Run a command and poll target dir for progress updates. */
async function runWithProgress(
  installId: string,
  exePath: string,
  exeArgs: string[],
  targetDir: string,
  onProgress?: (p: InstallProgress) => void,
): Promise<boolean> {
  let prevFileCount = 0;
  try { prevFileCount = (await fs.readdir(targetDir)).length; } catch {}

  return new Promise<boolean>((resolve) => {
    // Use execFile to bypass cmd.exe (preserves quotes in args like /DIR="path with spaces")
    const proc = execFile(exePath, exeArgs, { timeout: 3600000, windowsHide: true }, (error) => {
      if (error && !`${error.message}`.includes('maxBuffer') && !error.killed) {
        resolve(false);
        return;
      }
      resolve(true);
    });

    registerInstallProc(installId, proc);

    // Mute any audio the installer plays (e.g. background music / intro sounds)
    if (proc.pid) {
      setTimeout(() => { if (proc.pid) muteProcessAudio(proc.pid) }, 1500)
    }

    let pollCount = 0;
    const interval = setInterval(async () => {
      pollCount++;
      const pid = proc.pid

      // ── Priority 1: Parse real progress from installer window title ──
      // e.g. setup.tmp shows "11.4%  Wait 45 min" in its title
      if (pid) {
        const titleProgress = await pollWindowTitleProgress(pid)
        if (titleProgress) {
          const { pct, waitMin } = titleProgress
          const message = waitMin != null
            ? `~${waitMin} min remaining`
            : `Installing... ${pct}%`
          onProgress?.({
            phase: 'installing',
            progress: Math.min(pct, 99),
            message,
            pct,
            waitMin,
          } as any)
          return
        }
      }

      // ── Fallback: estimate from target dir file count ──
      try {
        const entries = await fs.readdir(targetDir);
        const fileCount = entries.length - prevFileCount;
        if (fileCount > 0) {
          const progress = Math.min(70, 40 + Math.min(fileCount, 300) / 300 * 30);
          onProgress?.({
            phase: 'installing',
            progress: Math.round(progress),
            message: `Installing... ${fileCount} files`,
          });
        } else if (pollCount % 4 === 0) {
          const waiting = Math.min(45, 40 + pollCount / 20);
          onProgress?.({
            phase: 'installing',
            progress: Math.round(waiting),
            message: `Waiting for installer...`,
          });
        }
      } catch {}
    }, 1500);

    proc.on('close', () => {
      clearInterval(interval);
      (async () => {
        try {
          const entries = await fs.readdir(targetDir);
          onProgress?.({
            phase: 'installing',
            progress: 70,
            message: `Install complete — ${entries.length} files`,
          });
        } catch {}
      })();
    });
  });
}

/** Scan install directory for the game's main executable. */
export async function findGameExe(installDir: string): Promise<string | undefined> {
  const IGNORE_PATTERNS = [
    'unins', 'uninst', 'setup', 'install', 'dxwebsetup',
    'vcredist', 'directx', 'oalinst', 'gfwlivesetup',
    'xnafx', 'dotnetfx', 'crash', 'helper', 'redist',
    'config', 'tool', 'cef', 'register', 'patch',
  ];

  let best: { path: string; score: number } | null = null;

  async function scan(dir: string, depth: number): Promise<void> {
    if (depth > 4) return;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        const fullPath = path.join(dir, e.name);
        if (e.isDirectory() && !e.name.startsWith('$')) {
          await scan(fullPath, depth + 1);
        } else if (e.isFile() && e.name.toLowerCase().endsWith('.exe')) {
          const exeName = path.basename(e.name, '.exe').toLowerCase();
          // Skip obvious utility and dependency files
          if (IGNORE_PATTERNS.some(p => exeName.includes(p))) continue;

          let score = 0;

          // Bonus for Unreal Engine "Shipping" executables (actual game binary)
          if (exeName.includes('shipping')) score += 80;

          // Bonus for deeper paths (game exe is often in a Binaries/ subfolder)
          const depth = fullPath.split(/[\\/]/).length - installDir.split(/[\\/]/).length;
          if (depth >= 2) score += 30; // depth param is from scan() — use it directly

          // Prefer exe that matches the folder name
          const folderName = path.basename(installDir).toLowerCase().replace(/[^a-z0-9]/g, '');
          if (exeName === folderName) score += 100;
          else if (exeName.includes(folderName) || folderName.includes(exeName)) score += 50;

          // Prefer larger files (main game exe is usually big)
          try {
            const stats = await fs.stat(fullPath);
            score += Math.min(30, Math.floor(stats.size / (1024 * 1024)));
          } catch {}

          if (!best || score > best.score) {
            best = { path: fullPath, score };
          }
        }
      }
    } catch {}
  }

  await scan(installDir, 1);
  return (best as { path: string; score: number } | null)?.path ?? undefined;
}

// ── innounp extraction (skip installer GUI — no dialogs, no sound, no usernames) ──

const INNOUNP_URLS = [
  'https://github.com/WhatTheBlock/innounp/releases/download/v0.50/innounp.exe',
];
const INNOUNP_EXE = 'innounp.exe';

/** Find innounp.exe on PATH or in common locations. */
async function findInnounp(): Promise<string | null> {
  try {
    const result = execSync(`where ${INNOUNP_EXE} 2>nul`, { encoding: 'utf-8', windowsHide: true });
    const p = result.trim().split('\n')[0]?.trim();
    if (p && existsSync(p)) return p;
  } catch {}
  const checkDirs = [
    path.join(tmpdir(), 'otix-innounp'),
    path.join(process.env.APPDATA || '', 'desktop'),
    path.join(process.env.LOCALAPPDATA || '', 'desktop'),
  ];
  for (const dir of checkDirs) {
    const p = path.join(dir, INNOUNP_EXE);
    if (existsSync(p)) return p;
  }
  return null;
}

/** Download innounp.zip, extract innounp.exe to a cache dir. */
/** Download innounp.exe to cache dir. Follows redirects. */
async function downloadInnounp(cacheDir: string): Promise<string | null> {
  const exePath = path.join(cacheDir, INNOUNP_EXE);
  if (existsSync(exePath)) return exePath;

  async function dl(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        const code = res.statusCode || 0;
        if (code >= 300 && code < 400 && res.headers.location) {
          res.resume();
          dl(res.headers.location, dest).then(resolve).catch(reject);
          return;
        }
        if (code !== 200) { reject(new Error(`HTTP ${code}`)); return; }
        const file = createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
      }).on('error', reject);
    });
  }

  try {
    await fs.mkdir(cacheDir, { recursive: true });
    for (const url of INNOUNP_URLS) {
      console.log(`[innounp] Downloading ${url}`);
      try {
        await dl(url, exePath);
        if (existsSync(exePath)) { console.log(`[innounp] Downloaded`); return exePath; }
      } catch (err) { console.warn(`[innounp] Failed:`, err); }
    }
    return null;
  } catch (err) { console.error('[innounp] Fatal:', err); return null; }
}

let _innounpPromise: Promise<string | null> | null = null;

export async function ensureInnounp(): Promise<string | null> {
  if (_innounpPromise) return _innounpPromise;
  _innounpPromise = (async () => {
    const found = await findInnounp();
    if (found) return found;
    return await downloadInnounp(path.join(tmpdir(), 'otix-innounp'));
  })();
  return _innounpPromise;
}

/** Extract with innounp, parse stdout for accurate per-file progress. */
async function extractWithProgress(
  installId: string,
  innounpPath: string,
  setupPath: string,
  targetDir: string,
  onProgress?: (p: InstallProgress) => void,
): Promise<boolean> {
  console.log(`[extractWithProgress] targetDir: ${targetDir}`);

  // Copy setup files to safe temp dir (no spaces in path)
  const safeTmp = path.join(tmpdir(), 'otix-extract');
  await fs.mkdir(safeTmp, { recursive: true }).catch(() => {});

  let totalFiles = 0;
  try {
    const listOut = execSync(`"${innounpPath}" -l -y "${setupPath}"`, { encoding: 'utf-8', windowsHide: true });
    console.log(`[extractWithProgress] Raw list (first 200): ${listOut.substring(0, 200)}`);
    totalFiles = listOut.trim().split('\n').filter((l) => l.includes('"')).length;
  } catch { totalFiles = 100; }

  console.log(`[extractWithProgress] ${totalFiles} files`);
  onProgress?.({ phase: 'installing', progress: 1, message: `${totalFiles} files...` });

  return new Promise<boolean>((resolve) => {
    // Extract to safe temp dir (no spaces path), then copy to target
    const proc = spawn(innounpPath, ['-x', '-y', '-v', `-d${safeTmp}`, setupPath], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    registerInstallProc(installId, proc as any);

    let extracted = 0;
    let buffer = '';
    proc.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.replace(/['"]+/g, '').trim();
        if (trimmed) {
          extracted++;
          if (extracted % 10 === 0 || extracted === totalFiles || extracted === 1) {
            const pct = Math.round((extracted / Math.max(totalFiles, 1)) * 100);
            onProgress?.({
              phase: 'installing',
              progress: Math.min(pct, 99),
              message: `${trimmed.substring(0, 30)} (${pct}%)`,
            });
          }
        }
      }
    });

    let stderrLog = '';
    proc.stderr?.on('data', (chunk: Buffer) => { stderrLog += chunk.toString(); });

    proc.on('close', async (code) => {
      console.log(`[extractWithProgress] Exit ${code}, extracted ${extracted}/${totalFiles}`);
      console.log(`[extractWithProgress] stderr: ${stderrLog || '(empty)'}`);
      if (code === 0) {
        try {
          const items = await fs.readdir(safeTmp);
          console.log(`[extractWithProgress] Temp has ${items.length} items, copying...`);
          await fs.mkdir(targetDir, { recursive: true });
          for (const item of items) {
            await fs.cp(path.join(safeTmp, item), path.join(targetDir, item), { recursive: true, force: true });
          }
          await fs.rm(safeTmp, { recursive: true, force: true }).catch(() => {});
          console.log(`[extractWithProgress] Copied to target OK`);
        } catch (e) { console.warn(`[extractWithProgress] Copy error:`, e); }
        onProgress?.({ phase: 'installing', progress: 100, message: `Extracted ${extracted} files` });
        resolve(true);
      } else { resolve(false); }
    });
  });
}

/** Try to extract with 7z (handles some InnoSetup installers too). */
async function extractWith7z(setupPath: string, targetDir: string): Promise<boolean> {
  try {
    const result = execSync(`where 7z 2>nul`, { encoding: 'utf-8', windowsHide: true });
    const sevenZipPath = result.trim().split('\n')[0]?.trim();
    if (!sevenZipPath || !existsSync(sevenZipPath)) return false;
    execSync(`"${sevenZipPath}" x "${setupPath}" -o"${targetDir}" -y`, { stdio: 'ignore', timeout: 120000 });
    return true;
  } catch { return false; }
}

/** Extract an InnoSetup installer — innounp preferred, 7z fallback. */
export async function extractInnoSetup(
  setupPath: string,
  targetDir: string,
): Promise<boolean> {
  // innounp — completely skips installer GUI (no dialogs, no sound, no usernames)
  const innounpPath = await ensureInnounp();
  if (innounpPath) {
    try {
      await execPromise(`"${innounpPath}" -x -d"${targetDir}" -y "${setupPath}"`);
      console.log(`[extractInnoSetup] Success`);
      return true;
    } catch (err) {
      console.warn('[extractInnoSetup] innounp failed:', err);
    }
  }

  // 7z fallback — handles some InnoSetup variants
  const sevenZipOk = await extractWith7z(setupPath, targetDir);
  if (sevenZipOk) { console.log(`[extractInnoSetup] 7z success`); return true; }

  return false;
}

/**
 * Full auto-install pipeline for an ISO game:
 * 1. Mount ISO
 * 2. Detect installer type
 * 3. Run silent install to target dir
 * 4. Apply crack if found
 * 5. Dismount ISO
 * 6. Find installed game exe
 */
export async function installGameIso(
  installId: string,
  isoPath: string,
  targetDir: string,
  gameTitle: string,
  onProgress?: (p: InstallProgress) => void,
  searchRoots?: string[],
): Promise<InstallResult> {
  let mappedDrive: string | undefined;

  const startTime = Date.now();
  // Track install metadata so getActiveInstalls() can report it
  _installMeta.set(installId, {
    isoPath, targetDir, gameTitle,
    startTime,
    lastPhase: 'mounting',
    lastProgress: 0,
    lastMessage: 'Starting...',
  });
  // Wrap onProgress to also update metadata
  const wrappedProgress = (p: InstallProgress) => {
    const meta = _installMeta.get(installId);
    if (meta) {
      meta.lastPhase = p.phase;
      meta.lastProgress = p.progress;
      meta.lastMessage = p.message;
    }
    onProgress?.(p);
  };

  try {
    // ── Step 1: Mount ISO ──
    wrappedProgress({ phase: 'mounting', progress: 10, message: 'Mounting ISO image...' });
    console.log(`[installGameIso] Mounting: ${isoPath}`);

    const mountResult = await mountIso(isoPath, searchRoots);
    if (!mountResult || !mountResult.driveLetter) {
      return { success: false, installDir: targetDir, error: 'Failed to mount ISO' };
    }

    wrappedProgress({ phase: 'mounting', progress: 20, message: `Mounted to ${mountResult.driveLetter}` });

    // Keep track for cleanup
    mappedDrive = mountResult.mappedDrive;

    // ── Step 2: Detect installer type ──
    wrappedProgress({ phase: 'detecting', progress: 25, message: 'Detecting installer type...' });

    if (!mountResult.setupPath) {
      // No setup.exe found — try to find any .exe installer on the ISO
      const driveRoot = `${mountResult.driveLetter}\\`;
      try {
        const entries = await fs.readdir(driveRoot);
        const setupCandidates = entries.filter(
          e => e.toLowerCase().endsWith('.exe') || e.toLowerCase().endsWith('.msi'),
        );
        if (setupCandidates.length > 0) {
          mountResult.setupPath = path.join(driveRoot, setupCandidates[0]);
        }
      } catch {}
    }

    if (!mountResult.setupPath) {
      await dismountIso(isoPath);
      // Ensure cleanup of mapped drive
      if (mappedDrive) {
        try { await execPromise(`net use ${mappedDrive} /delete /y`); } catch {}
      }
      return { success: false, installDir: targetDir, error: 'No installer executable found on ISO' };
    }

    const installerType = detectInstallerType(mountResult.setupPath);
    console.log(`[installGameIso] Detected installer type: ${installerType}`);
    wrappedProgress({
      phase: 'detecting',
      progress: 30,
      message: `Detected: ${installerType} installer`,
    });

    // ── Step 3: Create target directory (normalize path) ──
    targetDir = targetDir.replace(/\//g, '\\');
    await fs.mkdir(targetDir, { recursive: true });

    // ── Step 4: Silent install ──
    let installed = false;

    // Fallback: silent install
    if (!installed) {
      const silentArgs = getSilentArgs(installerType, targetDir);
      console.log(`[installGameIso] Silent: ${mountResult.setupPath} ${silentArgs.join(' ')}`);

      installed = await runWithProgress(
        installId,
        mountResult.setupPath,
        silentArgs,
        targetDir,
        wrappedProgress,
      );

      if (!installed) {
        console.warn(`[installGameIso] Silent install failed, launching installer manually...`);
        wrappedProgress({
          phase: 'installing',
          progress: 50,
          message: 'Installer needs manual input...',
        });

        try {
          await launchSetup(mountResult.setupPath);
          // Verify something was actually installed (user may have cancelled)
          let hasFiles = false;
          try {
            const entries = await fs.readdir(targetDir);
            hasFiles = entries.length > 0;
          } catch {}
          if (hasFiles) {
            installed = true;
          } else {
            console.warn(`[installGameIso] Target dir empty — user likely cancelled`);
            await dismountIso(isoPath);
            if (mappedDrive) {
              try { await execPromise(`net use ${mappedDrive} /delete /y`); } catch {}
            }
            return {
              success: false,
              installDir: targetDir,
              error: 'Installation cancelled or did not complete.',
            };
          }
        } catch (err: any) {
          await dismountIso(isoPath);
          if (mappedDrive) {
            try { await execPromise(`net use ${mappedDrive} /delete /y`); } catch {}
          }
          return {
            success: false,
            installDir: targetDir,
            error: `Installer failed: ${err.message || 'Unknown error'}`,
          };
        }
      }
    }

    wrappedProgress({ phase: 'installing', progress: 70, message: 'Installation complete' });

    // ── Step 5: Apply crack ──
    let crackApplied = false;
    if (mountResult.crackPath) {
      wrappedProgress({ phase: 'cracking', progress: 80, message: 'Applying crack...' });
      try {
        await applyCrack(mountResult.crackPath, targetDir);
        crackApplied = true;
        console.log(`[installGameIso] Crack applied from ${mountResult.crackPath}`);
      } catch (err) {
        console.warn(`[installGameIso] Failed to apply crack:`, err);
      }
    } else {
      // Check for common crack directory names on the ISO drive root
      const driveRoot = `${mountResult.driveLetter}\\`;
      const crackDirNames = ['crack', 'codex', 'plaza', 'hoodlum', 'skidrow', 'flt', 'rune', 'elamigos', 'goldberg', 'emu', 'razor1911', 'fairlight'];
      try {
        const entries = await fs.readdir(driveRoot, { withFileTypes: true });
        for (const e of entries) {
          if (e.isDirectory() && crackDirNames.includes(e.name.toLowerCase())) {
            const crackPath = path.join(driveRoot, e.name);
            await applyCrack(crackPath, targetDir);
            crackApplied = true;
            console.log(`[installGameIso] Crack applied from ${crackPath}`);
            break;
          }
        }
      } catch {}
    }

    wrappedProgress({ phase: 'cracking', progress: 90, message: crackApplied ? 'Crack applied' : 'No crack needed' });

    // ── Step 6: Dismount ISO ──
    wrappedProgress({ phase: 'finishing', progress: 95, message: 'Dismounting ISO...' });
    await dismountIso(isoPath);
    if (mappedDrive) {
      try { await execPromise(`net use ${mappedDrive} /delete /y`); } catch {}
    }

    // ── Step 7: Find game exe ──
    const gameExe = await findGameExe(targetDir);

    // ── Step 8: Cleanup ElAmigos filenames ──
    try {
      const entries = await fs.readdir(targetDir, { withFileTypes: true, recursive: true });
      for (const e of entries) {
        if (e.isFile() && /elamigos/i.test(e.name)) {
          const parent = e.parentPath || path.dirname(path.resolve(targetDir, e.name));
          const newName = e.name.replace(/[Ee][Ll][Aa][Mm][Ii][Gg][Oo][Ss]/g, '');
          if (newName && newName !== e.name) {
            await fs.rename(path.join(parent, e.name), path.join(parent, newName)).catch(() => {});
          }
        }
      }
    } catch {}

    wrappedProgress({ phase: 'done', progress: 100, message: 'Install complete!' });

    // Keep meta for 30s after completion so frontend can query it
    setTimeout(() => { _installMeta.delete(installId); }, 30_000);

    return {
      success: true,
      installDir: targetDir,
      gameExe,
      crackApplied,
    };
  } catch (err: any) {
    console.error(`[installGameIso] Fatal error:`, err);

    // Cleanup: try to dismount
    try { await dismountIso(isoPath); } catch {}
    if (mappedDrive) {
      try { await execPromise(`net use ${mappedDrive} /delete /y`); } catch {}
    }

    wrappedProgress({ phase: 'error', progress: 0, message: err.message || 'Install failed' });

    return {
      success: false,
      installDir: targetDir,
      error: err.message || 'Unknown error during installation',
    };
  }
}

