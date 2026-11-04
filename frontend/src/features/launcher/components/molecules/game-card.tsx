import { useState } from "react";
import { Play, Download, Gamepad2, CheckCircle2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { DkBadge } from "@ui/atoms/badge";
import type { LocalGame } from "@/features/launcher/types";
import { MediaLogo } from "@/lib/media/media-logo";
import { hasDesktopAPI } from "@/features/launcher/data/storage";
import {
  getGameAvailabilityBadge,
  isRemoteOnly,
  titleToGradient,
} from "@/features/launcher/utils";

interface GameCardProps {
  game: LocalGame;
  index: number;
  onAcceptSuggestion?: (game: LocalGame) => void;
  onRejectSuggestion?: (game: LocalGame) => void;
}

export const GameCard = ({
  game,
  index,
  onAcceptSuggestion,
  onRejectSuggestion,
}: GameCardProps) => {
  const [posterError, setPosterError] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const badge = getGameAvailabilityBadge(game);
  const isRemote = isRemoteOnly(game);

  // Prefer textless poster, then background art (backdrop), then standard poster so the floating 4D logo pops clean.
  const backgroundUrl =
    (game.data as any)?.textlessPosterUrl ||
    (game.data as any)?.backdropUrl ||
    game.data?.posterUrl ||
    game.posterUrl;
  const hasBackground = backgroundUrl && !posterError;
  const hasLogo = game.data?.logoUrl && !logoError;
  const isMatched = !!game.data?.id;
  const mediaId = game.data?.id || game.matchSuggestion?.id;
  const linkTo = mediaId
    ? {
        to: "/media/$mediaType/$mediaId" as const,
        params: { mediaType: "game" as const, mediaId },
        state: {
          preview: {
            title: game.data?.title || game.title,
            logoUrl: game.data?.logoUrl || null,
            logoColorGuess: game.data?.logoColorGuess || null,
            backdropUrl: (game.data as any)?.backdropUrl || null,
            posterUrl: game.data?.posterUrl || game.posterUrl || null,
          },
        },
      }
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

  const handleInstall = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (hasDesktopAPI()) {
      try {
        if ((window as any).desktopAPI?.downloadsRemoteStart && (game.serverId || game.serverFileId)) {
          await (window as any).desktopAPI.downloadsRemoteStart({
            serverUrl: (game as any).serverUrl,
            fileId: game.serverFileId,
            filename: game.title,
            gameTitle: game.title,
            mediaItemId: game.data?.id || game.otixMediaId || null,
          });
        }
      } catch (err) {
        console.error("Failed to start remote install:", err);
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
      data-context-type="game"
      data-game-id={game.id}
      data-media-title={game.title}
      data-media-poster={backgroundUrl || undefined}
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
          <div className="absolute inset-0 bg-black/45 transition-all duration-300 group-hover:bg-black/30" />
        </>
      ) : (
        /* Unmatched — title-hash colour gradient + icon */
        <div
          className="absolute inset-0"
          style={{ background: titleToGradient(game.title) }}
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
              <Gamepad2 className="h-20 w-20 text-foreground/10 transition-all duration-300 group-hover:text-foreground/20 group-hover:scale-110" />
            )}
          </div>
          {/* Title at bottom */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-10">
            <h3 className="text-sm font-bold text-foreground leading-tight truncate">
              {game.title}
            </h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
              {(game.installDir || "").split(/[\\/]/).slice(-2).join(" / ")}
            </p>
          </div>
        </div>
      )}

      {/* Top badges */}
      <div className="absolute top-2.5 left-2.5 right-2.5 z-10 flex items-center justify-between gap-2">
        <DkBadge variant={badge.variant} size="sm" className="shadow-lg backdrop-blur-sm bg-black/40">
          {badge.label}
        </DkBadge>
        {isMatched && (
          <div className="flex items-center gap-1 rounded-full bg-black/40 backdrop-blur-sm px-2 py-0.5 text-[10px] font-semibold text-primary shadow-lg">
            <CheckCircle2 className="h-3 w-3" />
          </div>
        )}
        {game.matchSuggestion && !isMatched && (
          <div className="flex items-center gap-1 rounded-full bg-black/40 backdrop-blur-sm px-2 py-0.5 text-[10px] font-semibold text-primary shadow-lg">
            ?
          </div>
        )}
      </div>

      {/* Logo — decorative, top portion */}
      {hasLogo && (
        <div className="absolute top-[8%] left-0 right-0 z-10 flex items-center justify-center px-6 pointer-events-none">
          <div
            className="absolute inset-0 opacity-80 group-hover:opacity-95 transition-opacity duration-300 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(0, 0, 0, 0.65) 0%, rgba(0, 0, 0, 0.3) 50%, rgba(0, 0, 0, 0) 80%)",
            }}
          />
          <MediaLogo
            src={game.data?.logoUrl ?? ""}
            alt={game.title}
            className="relative z-10 max-h-[55%] max-w-[80%] object-contain transition-all duration-500 ease-out scale-100 group-hover:scale-105"
            colorGuess={game.data?.logoColorGuess ?? null}
            background="dark"
            shadow="drop-shadow(0 2px 4px rgba(0,0,0,0.95)) drop-shadow(0 6px 20px rgba(0,0,0,0.85)) drop-shadow(0 0 1px rgba(0,0,0,0.9))"
            onError={() => setLogoError(true)}
          />
        </div>
      )}

      {/* Title bar — always visible at bottom */}
      <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3 pt-10">
        <h3 className="text-sm font-bold text-foreground leading-tight truncate drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
          {game.title}
        </h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
          {isMatched && game.data?.title && game.data?.title !== game.title
            ? game.data?.title
            : (game.installDir || "").split(/[\\/]/).slice(-2).join(" / ")}
        </p>
      </div>

      {/* Hover: play button, remote install button, or match suggestion */}
      {game.matchSuggestion && !isMatched ? (
        <div
          className={`absolute inset-0 z-20 flex items-center justify-center transition-all duration-300 ${
            isHovered ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm rounded-xl" />
          <div className="relative z-10 flex flex-col items-center gap-3 px-4">
            <p className="text-sm font-semibold text-foreground text-center leading-tight">
              Match with{" "}
              <span className="text-primary">{game.matchSuggestion.title}</span>?
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onAcceptSuggestion?.(game);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-bold transition-all hover:bg-primary/90 hover:scale-105 active:scale-95"
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
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--dk-surface-ghost)] px-3 py-1.5 text-xs font-semibold text-foreground transition-all hover:bg-[var(--dk-surface-field)] hover:scale-105 active:scale-95"
              >
                No
              </button>
            </div>
          </div>
        </div>
      ) : isRemote ? (
        <div
          className={`absolute inset-0 z-20 flex items-center justify-center bg-black/25 transition-all duration-300 ${
            isHovered ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <button
            onClick={handleInstall}
            className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-bold shadow-lg transition-all duration-200 hover:bg-primary/90 hover:scale-105 active:scale-95"
          >
            <Download className="h-4 w-4" />
            Install to PC
          </button>
        </div>
      ) : (
        <div
          className={`absolute inset-0 z-20 flex items-center justify-center bg-black/25 transition-all duration-300 ${
            isHovered ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <button
            onClick={handlePlay}
            className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-bold shadow-lg transition-all duration-200 hover:bg-primary/90 hover:scale-105 active:scale-95"
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
};
