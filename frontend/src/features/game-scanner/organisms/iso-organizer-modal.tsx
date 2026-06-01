import { useState, useCallback } from "react";
import { X, FolderOpen, Play, CheckCircle2, XCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { DkButton } from "@/features/dk-ui/atoms/button";
import { DkBadge } from "@/features/dk-ui/atoms/badge";
import { hasElectronAPI } from "../storage";
import type {
  OrgPreset,
  OrganizationPreviewItem,
  OrgExecutionResult,
} from "../types";
import { ORG_PRESETS } from "../types";

interface IsoOrganizerModalProps {
  open: boolean;
  onClose: () => void;
  isoPaths: string[];
}

const PRESETS: Array<{ key: OrgPreset } & (typeof ORG_PRESETS)[OrgPreset]> = [
  { key: "scene", ...ORG_PRESETS.scene },
  { key: "simple", ...ORG_PRESETS.simple },
  { key: "custom", ...ORG_PRESETS.custom },
];

export function IsoOrganizerModal({
  open,
  onClose,
  isoPaths,
}: IsoOrganizerModalProps) {
  const [directory, setDirectory] = useState("");
  const [preset, setPreset] = useState<OrgPreset>("scene");
  const [regex, setRegex] = useState(ORG_PRESETS.scene.regex);
  const [isoTemplate, setIsoTemplate] = useState(
    ORG_PRESETS.scene.isoTemplate,
  );
  const [updateTemplate, setUpdateTemplate] = useState(
    ORG_PRESETS.scene.updateTemplate,
  );
  const [previewItems, setPreviewItems] = useState<
    OrganizationPreviewItem[]
  >([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<OrgExecutionResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectPreset = useCallback((p: OrgPreset) => {
    setPreset(p);
    const config = ORG_PRESETS[p];
    setRegex(config.regex);
    setIsoTemplate(config.isoTemplate);
    setUpdateTemplate(config.updateTemplate);
  }, []);

  const handlePreview = useCallback(async () => {
    if (!directory) return;
    setPreviewLoading(true);
    setError(null);
    try {
      if (hasElectronAPI()) {
        const items = await (
          window as any
        ).electronAPI.previewOrganization(
          directory,
          regex,
          isoTemplate,
          updateTemplate,
        );
        setPreviewItems(items);
      }
    } catch {
      setError("Failed to preview organization");
    } finally {
      setPreviewLoading(false);
    }
  }, [directory, regex, isoTemplate, updateTemplate]);

  const handleExecute = useCallback(async () => {
    if (previewItems.length === 0) return;
    setExecuting(true);
    setError(null);
    try {
      if (hasElectronAPI()) {
        const items = await (
          window as any
        ).electronAPI.executeOrganization(
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
          className="relative max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-[2rem] bg-[var(--dk-surface-overlay)] shadow-[var(--dk-shadow-dialog)] backdrop-blur-xl ring-1 ring-white/[0.04]"
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
              <div className="flex gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => selectPreset(p.key)}
                    className={cn(
                      "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                      preset === p.key
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-glass)]",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Regex & Templates */}
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Regex Pattern
                </label>
                <input
                  type="text"
                  value={regex}
                  onChange={(e) => {
                    setRegex(e.target.value);
                    setPreset("custom");
                  }}
                  className="h-10 w-full rounded-xl bg-[var(--dk-surface-glass)] px-3 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-[var(--dk-ring-color)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  ISO Template
                </label>
                <input
                  type="text"
                  value={isoTemplate}
                  onChange={(e) => {
                    setIsoTemplate(e.target.value);
                    setPreset("custom");
                  }}
                  className="h-10 w-full rounded-xl bg-[var(--dk-surface-glass)] px-3 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-[var(--dk-ring-color)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Update Template
                </label>
                <input
                  type="text"
                  value={updateTemplate}
                  onChange={(e) => {
                    setUpdateTemplate(e.target.value);
                    setPreset("custom");
                  }}
                  className="h-10 w-full rounded-xl bg-[var(--dk-surface-glass)] px-3 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-[var(--dk-ring-color)]"
                />
              </div>
            </div>

            {/* Preview results */}
            {previewItems.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Preview ({previewItems.length} files)
                </p>
                <div className="max-h-48 overflow-y-auto space-y-1 rounded-2xl bg-[var(--dk-surface-base)] p-2">
                  {previewItems.map((item) => (
                    <div
                      key={item.sourcePath}
                      className="flex items-center gap-3 rounded-xl px-3 py-2"
                    >
                      {item.matched ? (
                        <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-mono">
                          {item.sourceFilename}
                        </p>
                        {item.matched && (
                          <p className="truncate text-xs text-muted-foreground">
                            → {item.targetPath}
                          </p>
                        )}
                      </div>
                      <DkBadge
                        variant={item.matched ? "success" : "muted"}
                        size="sm"
                      >
                        {item.type.toUpperCase()}
                      </DkBadge>
                    </div>
                  ))}
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
              isLoading={previewLoading}
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
                isLoading={executing}
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
