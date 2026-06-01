// frontend/src/features/game-scanner/molecules/game-card.tsx
import { useState } from "react";
import { Play, Gamepad2, CheckCircle2, ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { DkBadge } from "@/features/dk-ui/atoms/badge";
import type { DetectedGame } from "../types";
import { hasElectronAPI } from "../storage";

const PLATFORM_BADGES: Record<string, { variant: "default" | "success" | "warning" | "secondary" | "muted"; label: string }> = {
  steam: { variant: "default", label: "Steam" },
  pc: { variant: "success", label: "PC" },
  iso: { variant: "warning", label: "ISO" },
  epic: { variant: "muted", label: "Epic" },
  gog: { variant: "secondary", label: "GOG" },
  battlenet: { variant: "default", label: "Battle.net" },
  ubisoft: { variant: "muted", label: "Ubisoft" },
  ea: { variant: "destructive", label: "EA" },
  riot: { variant: "destructive", label: "Riot" },
  xbox: { variant: "success", label: "Xbox" },
  itch: { variant: "muted", label: "Itch" },
};

interface GameCardProps {
  game: DetectedGame;
  index: number;
}

export function GameCard({ game, index }: GameCardProps) {
  const [imgError, setImgError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const badge = PLATFORM_BADGES[game.platform] ?? PLATFORM_BADGES.pc;
  const posterUrl = game.otixPosterUrl || game.otixTextlessPosterUrl;
  const hasPoster = posterUrl && !imgError;
  const isMatched = !!game.otixMediaId;

  const handlePlay = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (hasElectronAPI()) {
      try {
        await (window as any).electronAPI.launchGame(game);
      } catch (err) {
        console.error("Failed to launch game:", err);
      }
    }
  };

  const cardContent = (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group relative aspect-[16/10] overflow-hidden rounded-2xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-sm)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[var(--dk-shadow-lg)] cursor-pointer"
    >
      {/* Background */}
      {hasPoster ? (
        <img
          src={posterUrl!}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out"
          style={{ transform: isHovered ? "scale(1.05)" : "scale(1)" }}
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--dk-surface-glass)] via-[var(--dk-surface-base)] to-[var(--dk-surface-glass)]">
          {/* Centered icon for unmatched games */}
          <div className="absolute inset-0 flex items-center justify-center">
            {game.iconUrl && !imgError ? (
              <img
                src={game.iconUrl}
                alt=""
                className="h-20 w-20 object-contain opacity-30 transition-all duration-300 group-hover:opacity-50 group-hover:scale-110"
                onError={() => setImgError(true)}
              />
            ) : (
              <Gamepad2 className="h-16 w-16 text-muted-foreground/20 transition-all duration-300 group-hover:text-muted-foreground/30 group-hover:scale-110" />
            )}
          </div>
        </div>
      )}

      {/* Dark gradient overlays for text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
      {/* Extra dark strip at bottom for title */}
      <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black/95 to-transparent" />

      {/* Platform badge - top left */}
      <div className="absolute top-3 left-3 z-10">
        <DkBadge variant={badge.variant} size="sm" className="shadow-lg backdrop-blur-sm bg-black/40">
          {badge.label}
        </DkBadge>
      </div>

      {/* Match indicator - top right */}
      {isMatched && (
        <div className="absolute top-3 right-3 z-10">
          <div className="flex items-center gap-1 rounded-full bg-black/40 backdrop-blur-sm px-2 py-1 text-[10px] font-semibold text-green-400 shadow-lg">
            <CheckCircle2 className="h-3 w-3" />
            {game.otixConfidence != null ? `${Math.round(game.otixConfidence * 100)}%` : "Matched"}
          </div>
        </div>
      )}

      {/* Hover Play button - centered */}
      <div
        className={`absolute inset-0 z-20 flex items-center justify-center transition-all duration-300 ${
          isHovered ? "opacity-100" : "opacity-0"
        }`}
      >
        <button
          onClick={handlePlay}
          className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3 text-sm font-bold text-white shadow-2xl shadow-emerald-500/40 transition-all duration-200 hover:bg-emerald-400 hover:scale-105 active:scale-95"
        >
          <Play className="h-5 w-5 fill-current" />
          Play
        </button>
      </div>

      {/* Title bar - bottom */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-4">
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0 flex-1">
            {/* Logo or title */}
            {game.otixLogoUrl && !imgError ? (
              <img
                src={game.otixLogoUrl}
                alt={game.title}
                className="h-8 max-w-[80%] object-contain object-left"
                onError={() => setImgError(true)}
              />
            ) : (
              <h3 className="text-sm font-bold text-white leading-tight truncate drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
                {game.title}
              </h3>
            )}
            {/* Subtitle: path or match title */}
            <p className="mt-0.5 text-[11px] text-white/60 truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
              {isMatched && game.otixMediaTitle !== game.title
                ? game.otixMediaTitle
                : game.installDir.split(/[\\/]/).slice(-2).join(" / ")}
            </p>
          </div>

          {/* External link hint on hover for matched games */}
          {isMatched && (
            <ExternalLink
              className={`h-3.5 w-3.5 text-white/50 flex-shrink-0 transition-all duration-300 ${
                isHovered ? "opacity-100" : "opacity-0"
              }`}
            />
          )}
        </div>
      </div>

      {/* Subtle border glow on hover */}
      <div
        className={`pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-white/10 transition-all duration-300 ${
          isHovered ? "ring-white/20" : ""
        }`}
      />
    </motion.div>
  );

  // Wrap in Link if matched
  if (isMatched) {
    return (
      <Link
        to="/media/$mediaType/$mediaId"
        params={{ mediaType: "game", mediaId: game.otixMediaId! }}
        className="block"
      >
        {cardContent}
      </Link>
    );
  }

  return cardContent;
}
