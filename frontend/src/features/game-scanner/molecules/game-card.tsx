import { useState } from "react";
import { Play, Gamepad2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { DkBadge } from "@/features/dk-ui/atoms/badge";
import type { DetectedGame } from "../types";
import { hasElectronAPI } from "../storage";

const PLATFORM_VARIANTS: Record<
  string,
  { variant: "default" | "success" | "warning"; label: string }
> = {
  steam: { variant: "default", label: "Steam" },
  pc: { variant: "success", label: "PC" },
  iso: { variant: "warning", label: "ISO" },
};

interface GameCardProps {
  game: DetectedGame;
  index: number;
}

export function GameCard({ game, index }: GameCardProps) {
  const [imgError, setImgError] = useState(false);
  const platformMeta = PLATFORM_VARIANTS[game.platform] ?? PLATFORM_VARIANTS.pc;

  const handlePlay = async () => {
    if (hasElectronAPI()) {
      try {
        await (window as any).electronAPI.launchGame(game);
      } catch (err) {
        console.error("Failed to launch game:", err);
      }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.3,
        delay: index * 0.05,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="group flex items-center gap-4 rounded-2xl bg-[var(--dk-surface-base)] p-4 shadow-[var(--dk-shadow-sm)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--dk-shadow-md)]"
    >
      {/* Game Icon */}
      <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--dk-surface-glass)]">
        {game.iconUrl && !imgError ? (
          <img
            src={game.iconUrl}
            alt=""
            className="h-full w-full object-contain"
            onError={() => setImgError(true)}
          />
        ) : (
          <Gamepad2 className="h-6 w-6 text-muted-foreground" />
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {game.title}
          </h3>
          <DkBadge variant={platformMeta.variant} size="sm">
            {platformMeta.label}
          </DkBadge>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {game.installDir}
        </p>

        {/* Match status */}
        {game.otixMediaId ? (
          <Link
            to="/media/$mediaType/$mediaId"
            params={{ mediaType: "game", mediaId: game.otixMediaId }}
            className="mt-1 inline-flex items-center gap-1 text-xs text-green-400 hover:underline"
          >
            <CheckCircle2 className="h-3 w-3" />
            {game.otixMediaTitle ?? "Matched"}{" "}
            {game.otixConfidence != null &&
              `· ${Math.round(game.otixConfidence * 100)}%`}
          </Link>
        ) : (
          <span className="mt-1 inline-flex items-center gap-1 text-xs text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            Not linked
          </span>
        )}
      </div>

      {/* Action */}
      <div className="flex-shrink-0">
        {game.platform === "iso" ? (
          <button className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--dk-surface-glass)] px-3 py-2 text-xs font-semibold text-foreground backdrop-blur-md transition-all hover:bg-[var(--dk-surface-glass-hover)] active:scale-[0.97]">
            <Play className="h-3.5 w-3.5" />
            Install
          </button>
        ) : (
          <button
            onClick={handlePlay}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-500/25 transition-all hover:bg-emerald-400 active:scale-95"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            Play
          </button>
        )}
      </div>
    </motion.div>
  );
}
