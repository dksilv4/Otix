// frontend/src/features/game-scanner/molecules/platform-filter.tsx
import { cn } from "@/lib/utils";
import type { Platform } from "../types";

const FILTERS: { value: Platform; label: string }[] = [
  { value: "all", label: "All" },
  { value: "steam", label: "Steam" },
  { value: "pc", label: "PC" },
  { value: "iso", label: "ISO" },
];

interface PlatformFilterProps {
  value: Platform;
  onChange: (platform: Platform) => void;
  counts: Record<Platform, number>;
}

export function PlatformFilter({ value, onChange, counts }: PlatformFilterProps) {
  return (
    <div className="flex gap-2">
      {FILTERS.map((f) => (
        <button
          key={f.value}
          onClick={() => onChange(f.value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors duration-150 whitespace-nowrap",
            value === f.value
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-glass)]",
          )}
        >
          {f.label}
          <span className="text-xs opacity-60 tabular-nums">
            {counts[f.value] ?? 0}
          </span>
        </button>
      ))}
    </div>
  );
}
