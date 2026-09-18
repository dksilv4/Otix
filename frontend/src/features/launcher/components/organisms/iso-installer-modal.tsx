import { useState, useCallback, useEffect } from "react";
import {
  X,
  Disc,
  HardDrive,
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Download,
  Gamepad2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { DkButton } from "@ui/atoms/button";
import { hasDesktopAPI, getScanPaths, markGameInstalled } from "@/features/launcher/data/storage";
import { usePickFolder } from "@/components/path-picker";
import { useInstallProgress } from "@/features/launcher/data/install-store";
import type {
  LocalGame,
  InstallResult,
  InstallPhase,
} from "@/features/launcher/types";

/** Clean a title string by removing scene group tags and normalizing. */
function cleanTitle(raw: string): string {
  return raw
    .replace(/\.iso$/i, '')
    .replace(/[._\-]/g, ' ')
    .replace(/\b(repack|elamigos|fitgirl|dodi|codex|flt|plaza|skidrow|rune|tenoke|goldberg|razor1911|fairlight|hoodlum|hbg|multi\d*|voices\d*)\b/gi, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\bv\d+(\.\d+)*\b/gi, '')
    .replace(/\bbuild\s*\d+\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const PHASE_LABELS: Record<InstallPhase, string> = {
  mounting: "Mounting ISO...",
  detecting: "Detecting installer...",
  installing: "Installing...",
  cracking: "Finishing...",
  finishing: "Finishing up...",
  done: "Complete!",
  error: "Install failed",
};

/** Suggest a default install directory — use first game library folder, fall back to ISO dir. */
function suggestInstallDir(isoPath: string, gameTitle: string): string {
  const dirs = getScanPaths();
  const base = dirs.length > 0 ? dirs[0] : isoPath.replace(/[/\\][^/\\]+$/, "");
  const clean = gameTitle.replace(/[<>:"|?*]/g, "").trim();
  return `${base}/${clean}`;
}

interface IsoInstallerModalProps {
  onClose: () => void;
  games: LocalGame[];
  initialIsoPath?: string;
  onInstallComplete?: (isoPath: string, installDir: string, gameExe: string | null) => void;
  isExiting?: boolean;
}

export function IsoInstallerModal({
  onClose,
  games,
  initialIsoPath,
  onInstallComplete,
  isExiting,
}: IsoInstallerModalProps) {
  const [isoPath, setIsoPath] = useState("");
  const [targetDir, setTargetDir] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { pick: pickFolder } = usePickFolder({ target: 'local' });

  const {
    installs,
    startInstall: storeStart,
    completeInstall: storeComplete,
    failInstall: storeFail,
    cancelInstall: storeCancel,
    dismissInstall: storeDismiss,
  } = useInstallProgress();

  // Find the store entry for this modal's isoPath
  const entry = isoPath ? installs.find((i) => i.isoPath === isoPath) : undefined;
  const isInstallingThis = entry?.active === true;

  const deriveGameTitle = useCallback((iso: string): string => {
    const game = games.find(
      (g) => g.exePath === iso || g.exePath.toLowerCase() === iso.toLowerCase(),
    );
    return game?.data?.title || game?.title || cleanTitle(iso.split(/[\\/]/).pop() || "");
  }, [games]);
  // Reset on mount — also dismiss any stale completed/errored entry so
  // the user gets the idle form immediately
  useEffect(() => {
    const iso = initialIsoPath || "";
    setIsoPath(iso);
    setTargetDir("");
    setError(null);
    // If there's a non-active leftover entry (canceled, errored, done), clear it
    if (iso) {
      const stale = installs.find((i) => i.isoPath === iso && !i.active)
      if (stale) storeDismiss(iso)
    }
  }, [initialIsoPath]);

  // Set default install dir when ISO changes
  useEffect(() => {
    if (isoPath) {
      const title = deriveGameTitle(isoPath);
      setTargetDir(suggestInstallDir(isoPath, title));
    }
  }, [isoPath, deriveGameTitle]);

  const handleSelectIso = useCallback(async () => {
    if (hasDesktopAPI()) {
      try {
        const selected = await window.desktopAPI!.selectIso();
        if (selected) setIsoPath(selected);
      } catch {
        setError("Failed to select ISO file");
      }
    }
  }, []);

  const handleSelectTargetDir = useCallback(async () => {
    try {
      const dir = await pickFolder();
      if (dir) {
        // Append game title so user picks the library root, not the game folder
        const title = deriveGameTitle(isoPath);
        const clean = title.replace(/[<>:"|?*]/g, "").trim();
        setTargetDir(clean ? `${dir}/${clean}` : dir);
      }
    } catch {
      setError("Failed to select install directory");
    }
  }, [isoPath, deriveGameTitle, pickFolder]);

  const handleInstall = useCallback(async () => {
    if (!isoPath || !targetDir) return;

    // If this ISO is already being installed, just close and show in sidebar
    if (isInstallingThis) {
      onClose();
      return;
    }

    setError(null);

    const gameTitle = deriveGameTitle(isoPath);

    // Write to global store before starting
    storeStart(isoPath, gameTitle, targetDir);

    try {
      const res = await window.desktopAPI!.installGame(isoPath, targetDir, gameTitle) as unknown as InstallResult;
      storeComplete(isoPath, res);
      // Update game in storage so main page sees it as installed (pc, not iso)
      if (res.success) {
        markGameInstalled(isoPath, res.gameExe ?? null, res.installDir)
        // Trigger local-files scan to pick up the newly installed game
        const pluginApi = window.desktopAPI?.plugin
        if (pluginApi?.callData) {
          pluginApi.callData('local-files', 'scan').catch(() => {})
        }
        // Direct callback to parent for immediate UI update
        onInstallComplete?.(isoPath, res.installDir, res.gameExe ?? null)
      }
      if (!res.success && res.error) {
        setError(res.error);
      }
    } catch (err: unknown) {
      storeFail(isoPath, err instanceof Error ? err.message : "Installation failed unexpectedly");
      setError(err instanceof Error ? err.message : "Installation failed unexpectedly");
    }
  }, [isoPath, targetDir, isInstallingThis, games, onClose, storeStart, storeComplete, storeFail]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const progress = entry?.progress;
  const currentPhase = progress?.phase;
  const isDone = entry?.result?.success === true || (progress?.phase === 'done' && !entry?.active);
  const isError = error && !entry?.active && !isDone;
  const isIdle = !entry?.active && !error && !entry?.result;

  return (
    <AnimatePresence>
      {!isExiting && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={handleClose}
        />

        {/* Dialog */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="relative max-h-[90vh] w-full max-w-lg overflow-hidden rounded-[2rem] bg-[var(--dk-surface-overlay)] shadow-[var(--dk-shadow-dialog)] backdrop-blur-xl ring-1 ring-white/[0.04] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/[0.04] px-6 py-4 flex-none">
            <div className="flex items-center gap-3">
              <Disc className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">
                {isInstallingThis ? 'Installing...' : 'Install Game'}
              </h2>
            </div>
            <button
              onClick={handleClose}
              className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-[var(--dk-surface-glass)] hover:text-foreground active:scale-90"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0 space-y-5">
            {/* ISO selection */}
            {isIdle && (
              <div className="space-y-4">
                <button
                  onClick={handleSelectIso}
                  className="flex w-full items-center gap-4 rounded-2xl bg-[var(--dk-surface-glass)] p-4 text-left transition-all hover:bg-[var(--dk-surface-glass-hover)] active:scale-[0.99]"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                    <Disc className="h-6 w-6 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      {isoPath
                        ? isoPath.split(/[\\/]/).pop()
                        : "Select ISO file"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {isoPath || "Choose a disk image to install from"}
                    </p>
                  </div>
                  <FolderOpen className="h-5 w-5 text-muted-foreground shrink-0" />
                </button>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Install to
                  </p>
                  <button
                    onClick={handleSelectTargetDir}
                    disabled={!isoPath}
                    className="flex w-full items-center gap-4 rounded-2xl bg-[var(--dk-surface-glass)] p-4 text-left transition-all hover:bg-[var(--dk-surface-glass-hover)] active:scale-[0.99] disabled:opacity-40"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10">
                      <HardDrive className="h-6 w-6 text-emerald-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {targetDir
                          ? targetDir.split(/[\\/]/).pop()
                          : "Select install folder"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate font-mono">
                        {targetDir || "Where to install the game"}
                      </p>
                    </div>
                    <FolderOpen className="h-5 w-5 text-muted-foreground shrink-0" />
                  </button>
                </div>
              </div>
            )}

            {/* Progress */}
            {isInstallingThis && (
              <div className="space-y-5">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-foreground font-medium">
                      {progress ? PHASE_LABELS[progress.phase] : "Starting..."}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--dk-surface-glass)] overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-500 animate-pulse"
                      initial={{ width: "100%" }}
                      animate={{ width: "100%" }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                    />
                  </div>
                  {progress && (
                    <p className="text-xs text-muted-foreground">
                      {progress.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  {(["mounting","detecting","installing","finishing"] as InstallPhase[]).map((phase) => {
                    const phaseOrder: InstallPhase[] = ["mounting","detecting","installing","finishing","done"];
                    const currentIdx = phaseOrder.indexOf(currentPhase ?? 'mounting');
                    const phaseIdx = phaseOrder.indexOf(phase);
                    const isActive = phase === currentPhase;
                    const isPast = phaseIdx < currentIdx;

                    return (
                      <div
                        key={phase}
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-4 py-2.5 transition-all",
                          isActive && "bg-primary/10",
                          isPast && "opacity-60",
                          !isActive && !isPast && "opacity-30",
                        )}
                      >
                        {isActive ? (
                          <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                        ) : isPast ? (
                          <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                        ) : (
                          <div className="h-4 w-4 shrink-0 rounded-full border-2 border-muted-foreground/30" />
                        )}
                        <span className="text-sm font-medium">{PHASE_LABELS[phase]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Error */}
            {isError && (
              <div className="space-y-4">
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
                    <AlertCircle className="h-8 w-8 text-destructive" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-foreground">Installation Failed</p>
                    <p className="mt-1 text-sm text-muted-foreground max-w-sm">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Success */}
            {isDone && entry?.result && (
              <div className="space-y-4">
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-500/10">
                    <Gamepad2 className="h-8 w-8 text-green-400" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-foreground">Installation Complete</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {entry.result.gameExe ? "Game is ready to play!" : "Game has been installed."}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-[var(--dk-surface-glass)] p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Installed To</p>
                    <p className="mt-0.5 text-xs font-mono truncate">{entry.result.installDir}</p>
                  </div>
                  {entry.result.gameExe && (
                    <div className="rounded-xl bg-[var(--dk-surface-glass)] p-3">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Executable</p>
                      <p className="mt-0.5 text-xs font-mono truncate">{entry.result.gameExe.split(/[\\/]/).pop()}</p>
                    </div>
                  )}
                  <div className="rounded-xl bg-[var(--dk-surface-glass)] p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Crack</p>
                    <p className="mt-0.5 text-xs">{entry.result.crackApplied ? "Applied" : "Pre-applied or not needed"}</p>
                  </div>
                  <div className="rounded-xl bg-[var(--dk-surface-glass)] p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</p>
                    <p className="mt-0.5 text-xs text-green-400 font-semibold">Installed</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex-none border-t border-white/[0.04] bg-[var(--dk-surface-overlay)]/60 backdrop-blur-md px-6 py-4 flex items-center justify-end gap-3">
            {isIdle && (
              <DkButton onClick={handleInstall} disabled={!isoPath || !targetDir} className="w-full gap-2">
                <Download className="h-4 w-4" />
                Install
              </DkButton>
            )}

            {(isDone || isError) && (
              <div className="flex w-full gap-3">
                {isError && (
                  <DkButton
                    variant="ghost"
                    onClick={() => {
                      storeDismiss(isoPath)
                      setError(null)
                    }}
                    className="flex-1"
                  >
                    Try Again
                  </DkButton>
                )}
                <DkButton onClick={handleClose} className="flex-1">
                  {isDone ? "Done" : "Close"}
                </DkButton>
              </div>
            )}

            {isInstallingThis && (
              <div className="flex w-full items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Installing... (you may close)
                </div>
                <button
                  onClick={() => storeCancel(isoPath)}
                  className="rounded-lg bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/20 transition-colors active:scale-95"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
