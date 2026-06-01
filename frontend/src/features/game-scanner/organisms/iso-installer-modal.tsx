// frontend/src/features/game-scanner/organisms/iso-installer-modal.tsx
import { useState, useCallback, useEffect } from "react";
import {
  X,
  Disc,
  HardDrive,
  Play,
  CheckCircle2,
  Lock,
  FolderOpen,
  SkipForward,
  ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { DkBadge } from "@/features/dk-ui/atoms/badge";
import { DkButton } from "@/features/dk-ui/atoms/button";
import { hasElectronAPI } from "../storage";
import type {
  DetectedGame,
  MountResult,
  InstallerStep,
  UpdateFile,
  AnalyzedUpdate,
} from "../types";

function parseUpdateVersion(filename: string): {
  from?: string;
  to: string;
  cleanName: string;
} {
  const name = filename.replace(/\.exe$/i, "").trim();
  const rangeMatch = name.match(
    /(?:update|patch)\s+([vV]?\d+(?:\.\d+)*)\s*[- →toTo]+\s*([vV]?\d+(?:\.\d+)*)/i,
  );
  if (rangeMatch) {
    const from = rangeMatch[1];
    const to = rangeMatch[2];
    const matchIdx = name.indexOf(rangeMatch[0]);
    let clean = name
      .substring(0, matchIdx)
      .trim()
      .replace(/[-_\s]+$/, "")
      .trim();
    return { from, to, cleanName: clean || "Update" };
  }

  const singleMatch = name.match(
    /(?:update|patch)\s+([vV]?\d+(?:\.\d+)*)/i,
  );
  if (singleMatch) {
    const to = singleMatch[1];
    const matchIdx = name.indexOf(singleMatch[0]);
    let clean = name
      .substring(0, matchIdx)
      .trim()
      .replace(/[-_\s]+$/, "")
      .trim();
    return { to, cleanName: clean || "Update" };
  }

  return { to: name, cleanName: "Update" };
}

function analyzeUpdates(updateFiles: UpdateFile[]): AnalyzedUpdate[] {
  const seenTargets = new Set<string>();
  const parsed = updateFiles
    .map((file) => {
      const p = parseUpdateVersion(file.name);
      return {
        file,
        ...p,
        isDuplicate: false,
        isGapBefore: false,
        gapVersion: undefined as string | undefined,
      };
    })
    .sort((a, b) =>
      a.to.localeCompare(b.to, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );

  for (let i = 0; i < parsed.length; i++) {
    const current = parsed[i];
    if (seenTargets.has(current.to.toLowerCase())) {
      current.isDuplicate = true;
    } else {
      seenTargets.add(current.to.toLowerCase());
    }

    if (i > 0 && current.from) {
      let prev = null;
      for (let j = i - 1; j >= 0; j--) {
        if (!parsed[j].isDuplicate) {
          prev = parsed[j];
          break;
        }
      }
      if (prev && prev.to.toLowerCase() !== current.from.toLowerCase()) {
        current.isGapBefore = true;
        current.gapVersion = `${prev.to} to ${current.from}`;
      }
    }
  }

  return parsed;
}

interface IsoInstallerModalProps {
  open: boolean;
  onClose: () => void;
  games: DetectedGame[];
}

const STEP_LABELS: { step: InstallerStep; label: string }[] = [
  { step: 1, label: "Select & Mount" },
  { step: 2, label: "Run Setup" },
  { step: 3, label: "Apply Crack" },
  { step: 4, label: "Finish" },
];

export function IsoInstallerModal({
  open,
  onClose,
  games,
}: IsoInstallerModalProps) {
  const [step, setStep] = useState<InstallerStep>(1);
  const [isoPath, setIsoPath] = useState("");
  const [targetDir, setTargetDir] = useState("");
  const [mountResult, setMountResult] = useState<MountResult | null>(null);
  const [mounting, setMounting] = useState(false);
  const [runningSetup, setRunningSetup] = useState(false);
  const [copyingCrack, setCopyingCrack] = useState(false);
  const [dismounting, setDismounting] = useState(false);
  const [currentUpdates, setCurrentUpdates] = useState<UpdateFile[]>([]);
  const [completedUpdates, setCompletedUpdates] = useState<
    Record<string, boolean>
  >({});
  const [installQueue, setInstallQueue] = useState<string[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const isoGames = games.filter((g) => g.platform === "iso");

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep(1);
      setIsoPath("");
      setTargetDir("");
      setMountResult(null);
      setError(null);
      setCurrentUpdates([]);
      setCompletedUpdates({});
    }
  }, [open]);

  // Load updates when ISO is selected
  useEffect(() => {
    setCompletedUpdates({});
    setCurrentUpdates([]);
    if (isoPath && hasElectronAPI()) {
      const scannedGame = games.find((g) => g.exePath === isoPath);
      if (scannedGame?.updateFiles) {
        setCurrentUpdates(scannedGame.updateFiles);
      } else {
        (window as any).electronAPI
          .getUpdatesForIso(isoPath)
          .then((files: UpdateFile[]) => setCurrentUpdates(files))
          .catch(() => {});
      }
    }
  }, [isoPath, games]);

  const handleSelectIso = useCallback(async () => {
    if (hasElectronAPI()) {
      try {
        const selected = await (window as any).electronAPI.selectIso();
        if (selected) setIsoPath(selected);
      } catch {
        setError("Failed to select ISO file");
      }
    }
  }, []);

  const handleMount = useCallback(async () => {
    if (!isoPath) return;
    setMounting(true);
    setError(null);
    try {
      if (hasElectronAPI()) {
        const result = await (window as any).electronAPI.mountIso(isoPath);
        setMountResult(result);
        setStep(2);

        if (result.setupPath) {
          setTimeout(async () => {
            try {
              await (window as any).electronAPI.launchSetup(result.setupPath!);
            } catch {
              // setup auto-launch is best-effort
            }
          }, 600);
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to mount ISO");
    } finally {
      setMounting(false);
    }
  }, [isoPath]);

  const handleRunSetup = useCallback(async () => {
    if (!mountResult?.setupPath) return;
    setRunningSetup(true);
    try {
      await (window as any).electronAPI.launchSetup(mountResult.setupPath);
    } catch {
      setError("Failed to launch setup");
    } finally {
      setRunningSetup(false);
    }
  }, [mountResult]);

  const handleSelectTargetDir = useCallback(async () => {
    if (hasElectronAPI()) {
      try {
        const dir = await (window as any).electronAPI.selectDirectory();
        if (dir) setTargetDir(dir);
      } catch {
        setError("Failed to select install directory");
      }
    }
  }, []);

  const handleApplyCrack = useCallback(async () => {
    if (!mountResult?.crackPath || !targetDir) return;
    setCopyingCrack(true);
    setError(null);
    try {
      await (window as any).electronAPI.applyCrack(
        mountResult.crackPath,
        targetDir,
      );
      setStep(4);
    } catch {
      setError("Failed to apply crack");
    } finally {
      setCopyingCrack(false);
    }
  }, [mountResult, targetDir]);

  const handleDismount = useCallback(async () => {
    setDismounting(true);
    try {
      if (hasElectronAPI()) {
        await (window as any).electronAPI.dismountIso(isoPath);
      }
      const nextIdx = queueIndex + 1;
      if (nextIdx < installQueue.length) {
        setQueueIndex(nextIdx);
        setIsoPath(installQueue[nextIdx]);
        setTargetDir("");
        setMountResult(null);
        setStep(1);
        setCompletedUpdates({});
      } else {
        onClose();
      }
    } catch {
      setError("Failed to dismount ISO");
    } finally {
      setDismounting(false);
    }
  }, [isoPath, queueIndex, installQueue, onClose]);

  const updates =
    currentUpdates.length > 0 ? analyzeUpdates(currentUpdates) : [];

  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Dialog */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="relative max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-[2rem] bg-[var(--dk-surface-overlay)] shadow-[var(--dk-shadow-dialog)] backdrop-blur-xl ring-1 ring-white/[0.04]"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/[0.04] px-6 py-4">
            <div className="flex items-center gap-3">
              <Disc className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">
                Install from ISO
              </h2>
              {installQueue.length > 0 && (
                <DkBadge variant="muted" size="sm">
                  {installQueue.length - queueIndex} remaining
                </DkBadge>
              )}
            </div>
            <button
              onClick={onClose}
              className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-[var(--dk-surface-glass)] hover:text-foreground active:scale-90"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Step indicators */}
          <div className="flex items-center gap-1 px-6 py-4">
            {STEP_LABELS.map((s, i) => (
              <div key={s.step} className="flex items-center gap-1">
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                    step === s.step &&
                      "bg-primary/15 text-primary",
                    step > s.step &&
                      "bg-green-500/10 text-green-400",
                    step < s.step &&
                      "text-muted-foreground/40",
                  )}
                >
                  {step > s.step ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-current text-[10px] font-bold text-white">
                      {s.step}
                    </span>
                  )}
                  {s.label}
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
                )}
              </div>
            ))}
          </div>

          {/* Step content */}
          <div className="max-h-[50vh] overflow-y-auto px-6 py-4">
            {/* Error */}
            {error && (
              <div className="mb-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
                <button
                  onClick={() => setError(null)}
                  className="ml-2 underline hover:no-underline"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Step 1: Select & Mount */}
            {step === 1 && (
              <div className="space-y-6">
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
                    <p className="text-xs text-muted-foreground">
                      {isoPath || "Choose a disk image to install from"}
                    </p>
                  </div>
                  <FolderOpen className="h-5 w-5 text-muted-foreground" />
                </button>

                {/* Scanned ISO quick-select */}
                {isoGames.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Scanned ISOs
                    </p>
                    <div className="space-y-1.5">
                      {isoGames.map((g) => (
                        <button
                          key={g.id}
                          onClick={() => setIsoPath(g.exePath)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left transition-all active:scale-[0.99]",
                            isoPath === g.exePath
                              ? "bg-primary/10 text-primary"
                              : "bg-[var(--dk-surface-glass)] text-foreground hover:bg-[var(--dk-surface-glass-hover)]",
                          )}
                        >
                          <Disc className="h-4 w-4 flex-shrink-0" />
                          <span className="truncate text-sm font-medium">
                            {g.title}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <DkButton
                  onClick={handleMount}
                  disabled={!isoPath || mounting}
                  isLoading={mounting}
                  className="w-full"
                >
                  Mount ISO Image
                </DkButton>
              </div>
            )}

            {/* Step 2: Run Setup */}
            {step === 2 && mountResult && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-[var(--dk-surface-glass)] p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Drive
                    </p>
                    <p className="text-sm font-semibold font-mono">
                      {mountResult.driveLetter}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[var(--dk-surface-glass)] p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Setup
                    </p>
                    <p className="truncate text-sm font-semibold font-mono">
                      {mountResult.setupPath?.split(/[\\/]/).pop() ??
                        "Not found"}
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <DkButton
                    onClick={handleRunSetup}
                    disabled={!mountResult.setupPath || runningSetup}
                    isLoading={runningSetup}
                  >
                    <Play className="h-4 w-4" />
                    Run Setup
                  </DkButton>
                  <DkButton variant="ghost" onClick={() => setStep(3)}>
                    Next Step
                  </DkButton>
                </div>
              </div>
            )}

            {/* Step 3: Apply Crack */}
            {step === 3 && mountResult && (
              <div className="space-y-6">
                {mountResult.crackPath ? (
                  <>
                    <div className="rounded-xl bg-[var(--dk-surface-glass)] p-4">
                      <p className="text-xs text-muted-foreground">
                        Crack source
                      </p>
                      <p className="text-sm font-mono">
                        {mountResult.crackPath}
                      </p>
                      {mountResult.crackName && (
                        <DkBadge variant="warning" size="sm" className="mt-1">
                          {mountResult.crackName}
                        </DkBadge>
                      )}
                    </div>

                    <button
                      onClick={handleSelectTargetDir}
                      className="flex w-full items-center gap-4 rounded-2xl bg-[var(--dk-surface-glass)] p-4 text-left transition-all hover:bg-[var(--dk-surface-glass-hover)] active:scale-[0.99]"
                    >
                      <HardDrive className="h-5 w-5 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">
                          {targetDir || "Select install folder"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground font-mono">
                          {targetDir ||
                            "Link the game install directory"}
                        </p>
                      </div>
                      <FolderOpen className="h-5 w-5 text-muted-foreground" />
                    </button>

                    <DkButton
                      onClick={handleApplyCrack}
                      disabled={!targetDir || copyingCrack}
                      isLoading={copyingCrack}
                      className="w-full"
                    >
                      Apply Crack
                    </DkButton>
                  </>
                ) : (
                  <div className="space-y-4 text-center">
                    <p className="text-sm text-muted-foreground">
                      No crack directory detected on this ISO.
                    </p>
                    <DkButton variant="ghost" onClick={() => setStep(4)}>
                      <SkipForward className="h-4 w-4" />
                      Skip to Finish
                    </DkButton>
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Finish */}
            {step === 4 && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-[var(--dk-surface-glass)] p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      ISO
                    </p>
                    <p className="truncate text-sm font-semibold font-mono">
                      {isoPath.split(/[\\/]/).pop()}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[var(--dk-surface-glass)] p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Installed To
                    </p>
                    <p className="truncate text-sm font-semibold font-mono">
                      {targetDir || "—"}
                    </p>
                  </div>
                </div>

                {/* Updates */}
                {updates.length > 0 && (
                  <div>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Update Sequence
                    </p>
                    <div className="space-y-2">
                      {updates.map((u, i) => {
                        const isComplete = completedUpdates[u.file.path];
                        const isUnlocked =
                          i === 0 ||
                          completedUpdates[updates[i - 1].file.path];
                        return (
                          <div
                            key={u.file.path}
                            className={cn(
                              "flex items-center gap-3 rounded-xl px-4 py-2.5",
                              u.isDuplicate
                                ? "bg-amber-500/5"
                                : "bg-[var(--dk-surface-glass)]",
                            )}
                          >
                            {isComplete ? (
                              <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />
                            ) : !isUnlocked ? (
                              <Lock className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
                            ) : (
                              <div className="h-4 w-4 flex-shrink-0 rounded-full border-2 border-muted-foreground/30" />
                            )}

                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium">
                                {u.cleanName}{" "}
                                <span className="font-mono text-xs text-muted-foreground">
                                  {u.from ? `${u.from} → ` : ""}
                                  {u.to}
                                </span>
                              </p>
                              {u.isDuplicate && (
                                <DkBadge variant="warning" size="sm">
                                  Duplicate
                                </DkBadge>
                              )}
                              {u.isGapBefore && u.gapVersion && (
                                <DkBadge variant="warning" size="sm">
                                  Gap: {u.gapVersion}
                                </DkBadge>
                              )}
                            </div>

                            {isUnlocked &&
                              !isComplete &&
                              !u.isDuplicate && (
                                <button
                                  onClick={async () => {
                                    try {
                                      await (
                                        window as any
                                      ).electronAPI.launchSetup(
                                        u.file.path,
                                      );
                                      setCompletedUpdates((prev) => ({
                                        ...prev,
                                        [u.file.path]: true,
                                      }));
                                    } catch {
                                      // update run is best-effort
                                    }
                                  }}
                                  className="flex-shrink-0 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 active:scale-95"
                                >
                                  Run
                                </button>
                              )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <DkButton
                  onClick={handleDismount}
                  isLoading={dismounting}
                  className="w-full"
                  variant="glass"
                >
                  <Disc className="h-4 w-4" />
                  Dismount ISO & Finish
                </DkButton>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
