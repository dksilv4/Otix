// frontend/src/features/game-scanner/molecules/empty-state.tsx
import { Gamepad2, FolderPlus, SearchX } from "lucide-react";

interface EmptyStateProps {
  variant: "no-dirs" | "no-games" | "no-results";
  onAddGameDir?: () => void;
  onAddIsoDir?: () => void;
  onClearFilters?: () => void;
}

export function EmptyState({
  variant,
  onAddGameDir,
  onAddIsoDir,
  onClearFilters,
}: EmptyStateProps) {
  if (variant === "no-dirs") {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--dk-surface-glass)] text-muted-foreground">
          <Gamepad2 className="h-8 w-8" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">
          No folders added
        </h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Add your game directories to scan for installed PC games.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={onAddGameDir}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] transition-all hover:bg-primary/90 active:scale-[0.97]"
          >
            <FolderPlus className="h-4 w-4" />
            Add Game Folder
          </button>
          <button
            onClick={onAddIsoDir}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--dk-surface-glass)] px-4 py-2.5 text-sm font-semibold text-foreground backdrop-blur-md transition-all hover:bg-[var(--dk-surface-glass-hover)] active:scale-[0.97]"
          >
            <FolderPlus className="h-4 w-4" />
            Add ISO Folder
          </button>
        </div>
      </div>
    );
  }

  if (variant === "no-games") {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--dk-surface-glass)] text-muted-foreground">
          <Gamepad2 className="h-8 w-8" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">
          No games found
        </h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          No games were found in your selected folders. Add more folders or
          check your scan paths.
        </p>
      </div>
    );
  }

  // no-results
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--dk-surface-glass)] text-muted-foreground">
        <SearchX className="h-8 w-8" />
      </div>
      <h3 className="text-lg font-semibold text-foreground">
        No games match your search
      </h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Try adjusting your search or platform filters.
      </p>
      {onClearFilters && (
        <button
          onClick={onClearFilters}
          className="mt-4 rounded-xl px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10 active:scale-[0.97]"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
