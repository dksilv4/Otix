// frontend/src/features/game-scanner/molecules/directory-manager.tsx
import { useState } from "react";
import {
  Folder,
  FolderPlus,
  X,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface DirectoryManagerProps {
  gamePaths: string[];
  isoPaths: string[];
  onAddGameDir: () => void;
  onRemoveGameDir: (path: string) => void;
  onAddIsoDir: () => void;
  onRemoveIsoDir: (path: string) => void;
}

export function DirectoryManager({
  gamePaths,
  isoPaths,
  onAddGameDir,
  onRemoveGameDir,
  onAddIsoDir,
  onRemoveIsoDir,
}: DirectoryManagerProps) {
  const [isOpen, setIsOpen] = useState(
    gamePaths.length === 0 && isoPaths.length === 0,
  );

  const hasPaths = gamePaths.length > 0 || isoPaths.length > 0;

  return (
    <div className="rounded-2xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-sm)]">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="flex items-center gap-2">
          <Folder className="h-4 w-4" />
          Scan Directories
          {hasPaths && (
            <span className="rounded-full bg-[var(--dk-surface-glass)] px-2 py-0.5 text-xs">
              {gamePaths.length + isoPaths.length}
            </span>
          )}
        </span>
        {isOpen ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-4 px-4 pb-4">
              {/* Game directories */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Game Folders
                </p>
                <div className="space-y-1.5">
                  {gamePaths.length === 0 && (
                    <p className="text-xs text-muted-foreground/50">
                      No game folders added
                    </p>
                  )}
                  {gamePaths.map((p) => (
                    <div
                      key={p}
                      className="flex items-center gap-2 rounded-lg bg-[var(--dk-surface-glass)] px-3 py-2"
                    >
                      <Folder className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-xs text-foreground font-mono">
                        {p}
                      </span>
                      <button
                        onClick={() => onRemoveGameDir(p)}
                        className="flex-shrink-0 rounded-md p-0.5 text-muted-foreground transition-colors hover:text-destructive active:scale-90"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={onAddGameDir}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:text-primary/80 active:scale-[0.97]"
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                  Add Game Folder
                </button>
              </div>

              {/* ISO directories */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  ISO Folders
                </p>
                <div className="space-y-1.5">
                  {isoPaths.length === 0 && (
                    <p className="text-xs text-muted-foreground/50">
                      No ISO folders added
                    </p>
                  )}
                  {isoPaths.map((p) => (
                    <div
                      key={p}
                      className="flex items-center gap-2 rounded-lg bg-[var(--dk-surface-glass)] px-3 py-2"
                    >
                      <Folder className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-xs text-foreground font-mono">
                        {p}
                      </span>
                      <button
                        onClick={() => onRemoveIsoDir(p)}
                        className="flex-shrink-0 rounded-md p-0.5 text-muted-foreground transition-colors hover:text-destructive active:scale-90"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={onAddIsoDir}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:text-primary/80 active:scale-[0.97]"
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                  Add ISO Folder
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
