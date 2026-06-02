import { useState, useCallback, useMemo } from "react";
import { X, FolderOpen, Play, CheckCircle2, XCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { DkButton } from "@/features/dk-ui/atoms/button";
import { DkBadge } from "@/features/dk-ui/atoms/badge";
import { hasElectronAPI } from "../storage";
import type {
  OrganizationPreviewItem,
  OrgExecutionResult,
  DetectedGame,
} from "../types";

interface IsoOrganizerModalProps {
  open: boolean;
  onClose: () => void;
  isoPaths: string[];
  games: DetectedGame[];
}

// Simple arr-style presets — keeps original filenames, moves into folders
const NAMING_PRESETS = [
  { key: "standard", label: "Standard", template: "{Title} ({Year}) [{Platform}]/{OriginalName}.{ext}" },
  { key: "simple",   label: "Simple",   template: "{Title}/{OriginalName}.{ext}" },
];

const SEPARATORS = [
  { key: "space", label: "Space", char: " " },
  { key: "dot", label: "Dot", char: "." },
  { key: "underscore", label: "Underscore", char: "_" },
  { key: "dash", label: "Dash", char: "-" },
] as const;

export function IsoOrganizerModal({
  open,
  onClose,
  isoPaths,
  games,
}: IsoOrganizerModalProps) {
  const [directory, setDirectory] = useState("");
  const [presetKey, setPresetKey] = useState("standard");
  const [namingTemplate, setNamingTemplate] = useState(NAMING_PRESETS[0].template);
  const [separator, setSeparator] = useState<"space" | "dot" | "underscore" | "dash">("space");
  const [previewItems, setPreviewItems] = useState<OrganizationPreviewItem[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<OrgExecutionResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectPreset = useCallback((key: string) => {
    const p = NAMING_PRESETS.find(n => n.key === key);
    if (!p) return;
    setPresetKey(p.key);
    setNamingTemplate(p.template);
  }, []);

  const handlePreview = useCallback(async () => {
    if (!directory) return;
    setPreviewLoading(true);
    setError(null);
    try {
      if (hasElectronAPI()) {
        const items = await (window as any).electronAPI.smartOrganizePreview(
          directory,
          namingTemplate,
          separator,
        );
        // All items are matched (smart parser handles everything)
        setPreviewItems(items.map(i => ({ ...i, matched: true })));
      }
    } catch (e: any) {
      setError(e?.message || "Failed to preview");
    } finally {
      setPreviewLoading(false);
    }
  }, [directory, namingTemplate, separator]);

  const handleExecute = useCallback(async () => {
    if (previewItems.length === 0) return;
    setExecuting(true);
    setError(null);
    try {
      if (hasElectronAPI()) {
        const items = await (window as any).electronAPI.executeOrganization(
          previewItems.map((p) => ({
            sourcePath: p.sourcePath,
            targetPath: p.targetPath,
          })),
        );
        setResult(items);
        setTimeout(() => onClose(), 1500);
      }
    } catch {
      setError("Failed to execute organization");
    } finally {
      setExecuting(false);
    }
  }, [previewItems, onClose]);

  const handleSelectDir = useCallback(async () => {
    if (hasElectronAPI()) {
      try {
        const dir = await (window as any).electronAPI.selectDirectory();
        if (dir) setDirectory(dir);
      } catch {
        setError("Failed to select directory");
      }
    }
  }, []);

  if (!open) return null;

  // Show extracted info on each preview item when available
  const extractedSnippet = (item: OrganizationPreviewItem) => {
    if (!item.extracted) return null;
    const parts: string[] = [];
    if (item.extracted.year) parts.push(item.extracted.year);
    if (item.extracted.edition) parts.push(item.extracted.edition);
    if (item.extracted.group) parts.push(`[${item.extracted.group}]`);
    if (item.extracted.version) parts.push(`v${item.extracted.version}`);
    return parts.length > 0 ? parts.join(" ") : null;
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="relative max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-[2rem] bg-[var(--dk-surface-overlay)] shadow-[var(--dk-shadow-dialog)] backdrop-blur-xl ring-1 ring-white/[0.04]"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/[0.04] px-6 py-4">
            <h2 className="text-lg font-semibold text-foreground">
              Organize ISO Files
            </h2>
            <button
              onClick={onClose}
              className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-[var(--dk-surface-glass)] hover:text-foreground active:scale-90"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto space-y-6 px-6 py-4">
            {error && (
              <div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Directory */}
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                Target Directory
              </label>
              <div className="flex gap-2">
                <select
                  value={directory}
                  onChange={(e) => setDirectory(e.target.value)}
                  className="h-12 flex-1 rounded-xl bg-[var(--dk-surface-glass)] px-4 text-sm text-foreground backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-[var(--dk-ring-color)]"
                >
                  <option value="">Select a folder...</option>
                  {isoPaths.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <DkButton variant="ghost" onClick={handleSelectDir}>
                  <FolderOpen className="h-4 w-4" />
                </DkButton>
              </div>
            </div>

            {/* Presets */}
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                Naming Preset
              </label>
              <div className="flex flex-wrap gap-2">
                {NAMING_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => selectPreset(p.key)}
                    className={cn(
                      "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                      presetKey === p.key
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-glass)]",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Naming template */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Naming Template — <span className="text-muted-foreground/50">tokens: `{'{Title}'}`, `{'{Year}'}`, `{'{Edition}'}`, `{'{Platform}'}`, `{'{ReleaseGroup}'}`, `{'{Version}'}`, `{'{OriginalName}'}`, `{'{ext}'}`</span>
              </label>
              <input
                type="text"
                value={namingTemplate}
                onChange={(e) => {
                  setNamingTemplate(e.target.value);
                  setPresetKey("");
                }}
                className="h-10 w-full rounded-xl bg-[var(--dk-surface-glass)] px-3 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-[var(--dk-ring-color)]"
              />
            </div>

            {/* Separator toggle */}
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                Word Separator
              </label>
              <p className="mb-2 text-xs text-muted-foreground">
                Replaces spaces in title with chosen character. Missing metadata (year, edition, etc.) is omitted automatically.
              </p>
              <div className="flex gap-2">
                {SEPARATORS.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setSeparator(s.key)}
                    className={cn(
                      "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ring-1",
                      separator === s.key
                        ? "bg-primary/15 text-primary ring-primary/30"
                        : "text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-glass)] ring-border/20",
                    )}
                  >
                    <span className="w-5 h-5 flex items-center justify-center rounded-md bg-[var(--dk-surface-glass)] text-xs font-mono">
                      {s.char}
                    </span>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Preview results */}
            {previewItems.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Preview ({previewItems.length} files)
                </p>
                <div className="max-h-64 overflow-y-auto space-y-1.5 rounded-2xl bg-[var(--dk-surface-base)] p-2">
                  {previewItems.map((item) => {
                    const parsed = extractedSnippet(item);
                    return (
                      <div key={item.sourcePath} className="rounded-xl px-4 py-3 bg-[var(--dk-surface-glass)]">
                        <div className="flex items-start gap-3">
                          <CheckCircle2 className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <p className="text-[11px] text-muted-foreground/50 font-mono truncate leading-relaxed">
                              {item.sourcePath}
                            </p>
                            <p className="text-sm font-mono font-medium text-foreground/95 leading-relaxed break-words">
                              {item.targetPath}
                            </p>
                            {parsed && (
                              <p className="text-[11px] text-muted-foreground/40 font-mono">
                                Parsed: <span className="text-muted-foreground/60">{item.extracted?.title || "?"}</span>
                                {parsed && <span className="text-muted-foreground/30"> · {parsed}</span>}
                              </p>
                            )}
                          </div>
                          <DkBadge variant="success" size="sm">
                            {item.type.toUpperCase()}
                          </DkBadge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Result */}
            {result && (
              <div className="rounded-xl bg-green-500/10 px-4 py-3 text-sm text-green-400">
                {result.filter((r) => r.success).length} files organized
                successfully.
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-white/[0.04] px-6 py-4">
            <DkButton
              variant="ghost"
              onClick={handlePreview}
              disabled={!directory || previewLoading}
              loading={previewLoading}
            >
              Preview Changes
            </DkButton>
            <div className="flex gap-2">
              <DkButton variant="ghost" onClick={onClose}>
                Cancel
              </DkButton>
              <DkButton
                onClick={handleExecute}
                disabled={previewItems.length === 0 || executing}
                loading={executing}
              >
                <Play className="h-4 w-4" />
                Run Organization
              </DkButton>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
