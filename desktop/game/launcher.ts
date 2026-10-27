import { spawn, ChildProcess, SpawnOptions } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import type { LocalGame } from '../preload-api';

export interface GameLaunchTarget {
  id: string;
  title: string;
  exePath: string;
  workingDirectory?: string;
  launchArguments?: string | string[];
  platform?: string;
  [key: string]: any;
}

export interface SessionTracker {
  startTracking?: (game: any, pid?: number) => void;
  stopTracking?: (gameId: string) => void;
}

export interface LaunchOptions {
  args?: string[];
  workingDir?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  detached?: boolean;
  windowsHide?: boolean;
  platform?: NodeJS.Platform;
  useOpenCommand?: boolean;
  unref?: boolean;
  sessionTracker?: SessionTracker;
  onExit?: (exitInfo: ProcessExitInfo) => void;
  onError?: (error: Error) => void;
}

export interface ProcessExitInfo {
  gameId?: string;
  title?: string;
  pid?: number;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  error?: Error;
  startTime: number;
  endTime: number;
  durationMs: number;
}

export interface LaunchedProcess {
  pid?: number;
  child: ChildProcess;
  gameId?: string;
  title?: string;
  executablePath: string;
  workingDir: string;
  args: string[];
  platform: NodeJS.Platform;
  startTime: number;
  waitForExit: () => Promise<ProcessExitInfo>;
  kill: (signal?: NodeJS.Signals) => boolean;
}

export type ProcessExitHook = (exitInfo: ProcessExitInfo) => void;

/**
 * Normalizes launch arguments from a string or string array into an argument list.
 */
export function parseLaunchArgs(args?: string | string[]): string[] {
  if (!args) return [];
  if (Array.isArray(args)) return [...args];
  const trimmed = args.trim();
  if (!trimmed) return [];

  // Match arguments preserving quotes
  const matches = trimmed.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g);
  if (!matches) return trimmed.split(/\s+/);

  return matches.map((arg) => {
    if (
      (arg.startsWith('"') && arg.endsWith('"')) ||
      (arg.startsWith("'") && arg.endsWith("'"))
    ) {
      return arg.slice(1, -1);
    }
    return arg;
  });
}

/**
 * Cross-platform directory helper handling Windows backslash paths even when running on POSIX.
 */
export function getExecutableDir(filePath: string, platform?: NodeJS.Platform): string {
  const isWindows =
    platform === 'win32' || (!platform && process.platform === 'win32') || filePath.includes('\\');
  if (isWindows) {
    return path.win32.dirname(filePath);
  }
  return path.posix.dirname(filePath);
}

/**
 * Resolves the underlying binary inside a macOS `.app` bundle.
 * Checks Info.plist CFBundleExecutable, then scans Contents/MacOS directory.
 */
export function resolveMacAppExecutable(appPath: string): string | null {
  const cleanPath = appPath.replace(/\/+$/, '');
  if (!cleanPath.endsWith('.app')) {
    return null;
  }

  const contentsPath = path.join(cleanPath, 'Contents');
  const macOsDir = path.join(contentsPath, 'MacOS');
  const infoPlistPath = path.join(contentsPath, 'Info.plist');

  // 1. Try reading CFBundleExecutable from Info.plist
  if (fs.existsSync(infoPlistPath)) {
    try {
      const plistContent = fs.readFileSync(infoPlistPath, 'utf-8');
      const match = plistContent.match(
        /<key>CFBundleExecutable<\/key>\s*<string>([^<]+)<\/string>/i,
      );
      if (match && match[1]) {
        const candidate = path.join(macOsDir, match[1].trim());
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }
    } catch {
      // Fall through to directory scanning
    }
  }

  // 2. Scan Contents/MacOS directory for executable
  if (fs.existsSync(macOsDir)) {
    try {
      const files = fs.readdirSync(macOsDir);
      if (files.length > 0) {
        const appBaseName = path.basename(cleanPath, '.app');
        const exactMatch = files.find(
          (f) => f.toLowerCase() === appBaseName.toLowerCase(),
        );
        if (exactMatch) {
          return path.join(macOsDir, exactMatch);
        }
        return path.join(macOsDir, files[0]);
      }
    } catch {
      // Fall through
    }
  }

  return null;
}

/**
 * Modular ProcessLauncher for executing game processes on Windows and macOS.
 * Supports argument passing, working directory configuration, exit code trapping,
 * and session tracking notifications upon process termination.
 */
export class ProcessLauncher extends EventEmitter {
  private exitHooks: Set<ProcessExitHook> = new Set();
  private attachedTrackers: Set<SessionTracker> = new Set();
  private activeProcesses: Map<number, LaunchedProcess> = new Map();
  private defaultPlatform: NodeJS.Platform;

  constructor(options?: { platform?: NodeJS.Platform }) {
    super();
    this.defaultPlatform = options?.platform ?? process.platform;
  }

  /**
   * Register a callback hook invoked when any launched process terminates or errors.
   * Returns an unregister function.
   */
  public onProcessExit(hook: ProcessExitHook): () => void {
    this.exitHooks.add(hook);
    return () => {
      this.exitHooks.delete(hook);
    };
  }

  /**
   * Attach a session tracker (e.g. GameDetector) that receives start and stop tracking notifications.
   * Returns an unregister function.
   */
  public attachSessionTracker(tracker: SessionTracker): () => void {
    this.attachedTrackers.add(tracker);
    return () => {
      this.attachedTrackers.delete(tracker);
    };
  }

  /**
   * Returns all active processes currently tracked by this launcher.
   */
  public getActiveProcesses(): LaunchedProcess[] {
    return Array.from(this.activeProcesses.values());
  }

  /**
   * Returns the active process for a given PID.
   */
  public getActiveProcess(pid: number): LaunchedProcess | undefined {
    return this.activeProcesses.get(pid);
  }

  /**
   * Resolves a macOS .app bundle to its inner executable.
   */
  public resolveAppBundle(appPath: string): string | null {
    return resolveMacAppExecutable(appPath);
  }

  /**
   * Launches a game executable or application package.
   */
  public async launchGameProcess(
    game: GameLaunchTarget | LocalGame,
    options?: LaunchOptions,
  ): Promise<LaunchedProcess> {
    if (!game || !game.exePath) {
      throw new Error('Executable path is required to launch game');
    }

    const targetPlatform = options?.platform ?? this.defaultPlatform;

    // Combine and normalize launch arguments
    const gameArgs = parseLaunchArgs((game as any).launchArguments);
    const optionArgs = options?.args ? [...options.args] : [];
    const allArgs = [...gameArgs, ...optionArgs];

    let spawnCommand = game.exePath;
    let spawnArgs = allArgs;
    let effectiveWorkingDir =
      options?.workingDir || options?.cwd || (game as any).workingDirectory;

    const isMacApp =
      targetPlatform === 'darwin' &&
      (game.exePath.endsWith('.app') || game.exePath.endsWith('.app/'));

    if (isMacApp) {
      const cleanAppPath = game.exePath.replace(/\/+$/, '');

      if (options?.useOpenCommand) {
        // macOS execution via `open -W -a` (waits for app exit)
        spawnCommand = 'open';
        spawnArgs = ['-W', '-a', cleanAppPath];
        if (allArgs.length > 0) {
          spawnArgs.push('--args', ...allArgs);
        }
        if (!effectiveWorkingDir) {
          effectiveWorkingDir = path.dirname(cleanAppPath);
        }
      } else {
        // Direct resolution of executable inside .app/Contents/MacOS/
        const resolvedBinary = resolveMacAppExecutable(cleanAppPath);
        if (resolvedBinary) {
          spawnCommand = resolvedBinary;
          spawnArgs = allArgs;
          if (!effectiveWorkingDir) {
            effectiveWorkingDir = path.dirname(resolvedBinary);
          }
        } else {
          // Fall back to `open -W -a` if binary not found inside bundle
          spawnCommand = 'open';
          spawnArgs = ['-W', '-a', cleanAppPath];
          if (allArgs.length > 0) {
            spawnArgs.push('--args', ...allArgs);
          }
          if (!effectiveWorkingDir) {
            effectiveWorkingDir = path.dirname(cleanAppPath);
          }
        }
      }
    } else {
      // Standard executable (.exe on Windows, binary on macOS/Linux)
      if (!effectiveWorkingDir) {
        effectiveWorkingDir = getExecutableDir(game.exePath, targetPlatform);
      }
    }

    // Configure spawn options
    const spawnOptions: SpawnOptions = {
      cwd: effectiveWorkingDir,
      detached: options?.detached ?? true,
      stdio: 'ignore',
      env: options?.env ? { ...process.env, ...options.env } : process.env,
    };

    // On Windows, game processes must be visible (windowsHide: false)
    if (targetPlatform === 'win32') {
      (spawnOptions as any).windowsHide = options?.windowsHide ?? false;
    }

    const child = spawn(spawnCommand, spawnArgs, spawnOptions);
    const startTime = Date.now();

    let exitHandled = false;
    let exitPromiseResolve!: (info: ProcessExitInfo) => void;
    const exitPromise = new Promise<ProcessExitInfo>((resolve) => {
      exitPromiseResolve = resolve;
    });

    const handleExit = (
      code: number | null,
      signal: NodeJS.Signals | null,
      error?: Error,
    ) => {
      if (exitHandled) return;
      exitHandled = true;

      if (child.pid != null) {
        this.activeProcesses.delete(child.pid);
      }

      const endTime = Date.now();
      const exitInfo: ProcessExitInfo = {
        gameId: game.id,
        title: game.title,
        pid: child.pid,
        exitCode: code,
        signal,
        error,
        startTime,
        endTime,
        durationMs: Math.max(0, endTime - startTime),
      };

      // Call per-launch callbacks
      if (error && options?.onError) {
        try {
          options.onError(error);
        } catch {
          // ignore callback error
        }
      }
      if (options?.onExit) {
        try {
          options.onExit(exitInfo);
        } catch {
          // ignore callback error
        }
      }

      // Notify per-launch session tracker
      if (options?.sessionTracker?.stopTracking && game.id) {
        try {
          options.sessionTracker.stopTracking(game.id);
        } catch {
          // ignore callback error
        }
      }

      // Notify globally attached session trackers
      for (const tracker of this.attachedTrackers) {
        if (tracker.stopTracking && game.id) {
          try {
            tracker.stopTracking(game.id);
          } catch {
            // ignore callback error
          }
        }
      }

      // Dispatch process exit event
      this.emit('process:exit', exitInfo);

      // Invoke registered process exit hooks
      for (const hook of this.exitHooks) {
        try {
          hook(exitInfo);
        } catch (hookErr) {
          console.error('[ProcessLauncher] Exit hook error:', hookErr);
        }
      }

      exitPromiseResolve(exitInfo);
    };

    // Exit code trapping
    child.on('exit', (code, signal) => {
      handleExit(code, signal);
    });

    child.on('error', (err) => {
      handleExit(null, null, err);
    });

    if (options?.unref && typeof child.unref === 'function') {
      child.unref();
    }

    const launched: LaunchedProcess = {
      pid: child.pid,
      child,
      gameId: game.id,
      title: game.title,
      executablePath: spawnCommand,
      workingDir: effectiveWorkingDir,
      args: spawnArgs,
      platform: targetPlatform,
      startTime,
      waitForExit: () => exitPromise,
      kill: (signal?: NodeJS.Signals) => child.kill(signal),
    };

    if (child.pid != null) {
      this.activeProcesses.set(child.pid, launched);
    }

    // Notify session trackers of process start
    if (options?.sessionTracker?.startTracking) {
      try {
        options.sessionTracker.startTracking(game, child.pid);
      } catch {
        // ignore callback error
      }
    }
    for (const tracker of this.attachedTrackers) {
      if (tracker.startTracking) {
        try {
          tracker.startTracking(game, child.pid);
        } catch {
          // ignore callback error
        }
      }
    }

    return launched;
  }
}

/** Default singleton instance of ProcessLauncher. */
export const defaultLauncher = new ProcessLauncher();

/**
 * Top-level convenience function matching the Project contract:
 * `launchGameProcess(game: GameLaunchTarget): Promise<LaunchedProcess>`
 */
export async function launchGameProcess(
  game: GameLaunchTarget | LocalGame,
  options?: LaunchOptions,
): Promise<LaunchedProcess> {
  return defaultLauncher.launchGameProcess(game, options);
}
