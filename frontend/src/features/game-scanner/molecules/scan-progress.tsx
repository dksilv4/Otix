// frontend/src/features/game-scanner/molecules/scan-progress.tsx
import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";

interface ScanProgressProps {
  currentDir: string;
  progress: number;
  foundCount: number;
}

export function ScanProgress({
  currentDir,
  progress,
  foundCount,
}: ScanProgressProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--dk-surface-glass)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>

      <h3 className="text-lg font-semibold text-foreground">
        Scanning for games...
      </h3>

      <p className="mt-1 max-w-md truncate text-sm text-muted-foreground font-mono">
        {currentDir}
      </p>

      {/* Progress bar */}
      <div className="mt-4 h-1.5 w-64 overflow-hidden rounded-full bg-[var(--dk-surface-glass)]">
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(progress, 100)}%` }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>

      <p className="mt-3 text-sm font-medium text-muted-foreground">
        Found {foundCount} game{foundCount !== 1 ? "s" : ""} so far...
      </p>
    </div>
  );
}
