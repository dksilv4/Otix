// frontend/src/features/game-scanner/molecules/game-card.tsx
import { useState } from "react";
import { Play, Gamepad2, CheckCircle2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { DkBadge } from "@/features/dk-ui/atoms/badge";
import type { DetectedGame } from "../types";
import { hasElectronAPI } from "../storage";

const PLATFORM_BADGES: Record<
  string,
  { variant: "default" | "success" | "warning" | "secondary" | "muted"; label: string }
> = {
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
  onAcceptSuggestion: (game: DetectedGame) => void;
  onRejectSuggestion: (game: DetectedGame) => void;
}

export function GameCard({ game, index, onAcceptSuggestion, onRejectSuggestion }: GameCardProps) {
  const [posterError, setPosterError] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const badge = PLATFORM_BADGES[game.platform] ?? PLATFORM_BADGES.pc;
  // Prefer textless poster so the floating logo pops clean
  const backgroundUrl = game.otixTextlessPosterUrl || game.otixPosterUrl;
  const hasBackground = backgroundUrl && !posterError;
  const hasLogo = game.otixLogoUrl && !logoError;
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
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group relative aspect-[2/1] overflow-hidden rounded-xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-sm)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[var(--dk-shadow-lg)] cursor-pointer"
    >
      {/* Background — real game artwork */}
      {hasBackground ? (
        <>
          <img
            src={backgroundUrl!}
            alt=""
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out"
            style={{ transform: isHovered ? "scale(1.05)" : "scale(1)" }}
            onError={() => setPosterError(true)}
          />
          {/* Dark overlay for contrast against logo */}
          <div className="absolute inset-0 bg-black/35 transition-all duration-300 group-hover:bg-black/25" />
        </>
      ) : (
        /* Unmatched fallback */
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--dk-surface-glass)] to-[var(--dk-surface-base)]">
          <div className="absolute inset-0 flex items-center justify-center">
            {game.iconUrl && !posterError ? (
              <img
                src={game.iconUrl}
                alt=""
                className="h-14 w-14 object-contain opacity-25 transition-all duration-300 group-hover:opacity-40 group-hover:scale-110"
                onError={() => setPosterError(true)}
              />
            ) : (
              <Gamepad2 className="h-12 w-12 text-muted-foreground/20 transition-all duration-300 group-hover:text-muted-foreground/35 group-hover:scale-110" />
            )}
          </div>
        </div>
      )}

      {/* Top badges */}
      <div className="absolute top-2.5 left-2.5 right-2.5 z-10 flex items-center justify-between gap-2">
        <DkBadge variant={badge.variant} size="sm" className="shadow-lg backdrop-blur-sm bg-black/40">
          {badge.label}
        </DkBadge>
        {isMatched && (
          <div className="flex items-center gap-1 rounded-full bg-black/40 backdrop-blur-sm px-2 py-0.5 text-[10px] font-semibold text-green-400 shadow-lg">
            <CheckCircle2 className="h-3 w-3" />
          </div>
        )}
        {game.otixMatchSuggestion && !isMatched && (
          <div className="flex items-center gap-1 rounded-full bg-black/40 backdrop-blur-sm px-2 py-0.5 text-[10px] font-semibold text-blue-400 shadow-lg">
            {game.otixConfidence != null ? `${Math.round(game.otixConfidence * 100)}%` : "?"}
          </div>
        )}
      </div>

      {/* Floating game logo — the premium visual centrepiece */}
      {hasLogo ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6 transition-all duration-300 group-hover:scale-105">
          <img
            src={game.otixLogoUrl!}
            alt={game.title}
            className="max-h-[60%] max-w-[70%] object-contain drop-shadow-[0_2px_16px_rgba(0,0,0,0.8)]"
            onError={() => setLogoError(true)}
          />
        </div>
      ) : (
        /* Fallback title bar at bottom when no logo */
        <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/90 to-transparent p-3 pt-8">
          <h3 className="text-sm font-bold text-white leading-tight truncate drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
            {game.title}
          </h3>
          <p className="mt-0.5 text-[11px] text-white/50 truncate">
            {isMatched && game.otixMediaTitle !== game.title
              ? game.otixMediaTitle
              : game.installDir.split(/[\\/]/).slice(-2).join(" / ")}
          </p>
        </div>
      )}

      {/* Hover: play button */}
      <div
        className={`absolute inset-0 z-20 flex items-center justify-center bg-black/25 transition-all duration-300 ${
          isHovered ? "opacity-100" : "opacity-0"
        }`}
      >
        <button
          onClick={handlePlay}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white shadow-2xl shadow-emerald-500/40 transition-all duration-200 hover:bg-emerald-400 hover:scale-105 active:scale-95"
        >
          <Play className="h-4 w-4 fill-current" />
          Play
        </button>
      </div>

      {/* Ring on hover */}
      <div
        className={`pointer-events-none absolute inset-0 rounded-xl ring-1 ring-white/10 transition-all duration-300 ${
          isHovered ? "ring-white/20" : ""
        }`}
      />
    </motion.div>
  );

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
