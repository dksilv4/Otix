import { useState } from "react";
import { Play, Gamepad2, CheckCircle2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { DkBadge } from "@/old-features/ui/atoms/badge";
import type { LocalGame } from "@/features/launcher/types";
import { hasDesktopAPI } from "@/features/launcher/data/storage";

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
  ea: { variant: "secondary", label: "EA" },
  riot: { variant: "default", label: "Riot" },
  xbox: { variant: "success", label: "Xbox" },
  itch: { variant: "muted", label: "Itch" },
};

interface GameCardProps {
  game: LocalGame;
  index: number;
  onAcceptSuggestion?: (game: LocalGame) => void;
  onRejectSuggestion?: (game: LocalGame) => void;
}

export function GameCard({ game, index, onAcceptSuggestion, onRejectSuggestion }: GameCardProps) {
  const [posterError, setPosterError] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const hasMultipleSources = game.sources && game.sources.length > 1;
  const primaryBadge = PLATFORM_BADGES[game.platform] ?? PLATFORM_BADGES.pc;
  const badge = hasMultipleSources
    ? { variant: "default" as const, label: game.sources!.map((s) => PLATFORM_BADGES[s]?.label ?? s).join(" + ") }
    : primaryBadge;
  // Prefer textless poster so the floating logo pops clean.
  // Fall back to SGDB grid (posterUrl from scanner) for unmatched game.
  const backgroundUrl = game.data?.posterUrl || game.data?.posterUrl || game.posterUrl;
  const hasBackground = backgroundUrl && !posterError;
  const hasLogo = game.data?.logoUrl && !logoError;
  const isMatched = !!game.data?.id;
  const mediaId = game.data?.id || game.matchSuggestion?.id;
  const linkTo = mediaId
    ? { to: "/media/$mediaType/$mediaId" as const, params: { mediaType: "game" as const, mediaId } }
    : null;

  const handlePlay = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (hasDesktopAPI()) {
      try {
        await (window as any).desktopAPI.launchGame(game);
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
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out scale-110"
            style={{ transform: isHovered ? "scale(1)" : undefined }}
            onError={() => setPosterError(true)}
          />
          {/* Dark overlay for contrast against logo */}
          <div className="absolute inset-0 bg-black/35 transition-all duration-300 group-hover:bg-black/25" />
        </>
      ) : (
        /* Unmatched — title-hash colour gradient + icon */
        (() => {
          // Deterministic hue from game title — same game always same colour
          let hash = 0;
          for (let i = 0; i < game.title.length; i++) {
            hash = game.title.charCodeAt(i) + ((hash << 5) - hash);
          }
          const hue = Math.abs(hash) % 360;
          const gradient = `oklch(0.25 0.08 ${hue})`;
          const gradient2 = `oklch(0.18 0.06 ${(hue + 40) % 360})`;

          return (
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(135deg, ${gradient}, ${gradient2})`,
              }}
            >
              {/* Large centred icon */}
              <div className="absolute inset-0 flex items-center justify-center">
                {game.iconUrl ? (
                  <img
                    src={game.iconUrl}
                    alt=""
                    className="h-24 w-24 object-contain opacity-20 transition-all duration-300 group-hover:opacity-35 group-hover:scale-110"
                  />
                ) : (
                  <Gamepad2 className="h-20 w-20 text-white/10 transition-all duration-300 group-hover:text-white/20 group-hover:scale-110" />
                )}
              </div>
              {/* Title at bottom */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-10">
                <h3 className="text-sm font-bold text-white leading-tight truncate">
                  {game.title}
                </h3>
                <p className="mt-0.5 text-[11px] text-white/40 truncate">
                  {game.installDir.split(/[\\/]/).slice(-2).join(" / ")}
                </p>
              </div>
            </div>
          );
        })()
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
        {game.matchSuggestion && !isMatched && (
          <div className="flex items-center gap-1 rounded-full bg-black/40 backdrop-blur-sm px-2 py-0.5 text-[10px] font-semibold text-blue-400 shadow-lg">
            {true ? `${Math.round(0 * 100)}%` : "?"}
          </div>
        )}
      </div>

      {/* Logo — decorative, top portion */}
      {hasLogo && (
        <div className="absolute top-[8%] left-0 right-0 z-10 flex items-center justify-center px-6">
          <img
            src={game.data?.logoUrl!}
            alt={game.title}
            className="max-h-[45%] max-w-[70%] object-contain drop-shadow-[0_2px_16px_rgba(0,0,0,0.8)] transition-all duration-500 ease-out scale-100 group-hover:scale-105"
            onError={() => setLogoError(true)}
          />
        </div>
      )}

      {/* Title bar — always visible at bottom */}
      <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3 pt-10">
        <h3 className="text-sm font-bold text-white leading-tight truncate drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
          {game.title}
        </h3>
        <p className="mt-0.5 text-[11px] text-white/50 truncate">
          {isMatched && game.data?.title && game.data?.title !== game.title
            ? game.data?.title
            : game.installDir.split(/[\\/]/).slice(-2).join(" / ")}
        </p>
      </div>

      {/* Hover: play button or match suggestion */}
      {game.matchSuggestion && !isMatched ? (
        <div
          className={`absolute inset-0 z-20 flex items-center justify-center transition-all duration-300 ${
            isHovered ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm rounded-xl" />
          <div className="relative z-10 flex flex-col items-center gap-3 px-4">
            <p className="text-sm font-semibold text-white text-center leading-tight">
              Match with{" "}
              <span className="text-blue-400">{game.matchSuggestion.title}</span>?
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onAcceptSuggestion?.(game);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-bold text-white transition-all hover:bg-blue-400 hover:scale-105 active:scale-95"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Yes, match
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRejectSuggestion?.(game);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/70 transition-all hover:bg-white/20 hover:text-white hover:scale-105 active:scale-95"
              >
                No
              </button>
            </div>
          </div>
        </div>
      ) : (
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
      )}

      {/* Ring on hover */}
      <div
        className={`pointer-events-none absolute inset-0 rounded-xl ring-1 ring-white/10 transition-all duration-300 ${
          isHovered ? "ring-white/20" : ""
        }`}
      />
    </motion.div>
  );

  const Wrapper = linkTo ? Link : "div";
  const wrapperProps = linkTo
    ? { to: linkTo.to, params: linkTo.params, className: "block" }
    : {};

  return (
    <Wrapper {...(wrapperProps as any)}>
      {cardContent}
    </Wrapper>
  );
}
