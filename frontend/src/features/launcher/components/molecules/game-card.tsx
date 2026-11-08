import { useState } from "react"
import { Play, Download, Gamepad2, CheckCircle2 } from "lucide-react"
import { Link } from "@tanstack/react-router"
import { motion } from "framer-motion"
import { DkBadge } from "@ui/atoms/badge"
import type { LocalGame } from "@/features/launcher/types"
import { MediaLogo } from "@/lib/media/media-logo"
import { getDesktopAPI } from "@/lib/desktop/api"
import { useLaunchGame } from "@/features/launcher/hooks/use-launch-game"
import { ConsoleDisambiguationModal } from "@/features/launcher/components/molecules/console-disambiguation-modal"
import {
  getGameAvailabilityBadge,
  isRemoteOnly,
  titleToGradient,
} from "@/features/launcher/utils"

interface GameCardProps {
  game: LocalGame
  index: number
  onAcceptSuggestion?: (game: LocalGame) => void
  onRejectSuggestion?: (game: LocalGame) => void
}

export const GameCard = ({
  game,
  index,
  onAcceptSuggestion,
  onRejectSuggestion,
}: GameCardProps) => {
  const [posterError, setPosterError] = useState(false)
  const [logoError, setLogoError] = useState(false)
  const { launchGame, disambiguationModalProps, hasDisambiguationTarget } = useLaunchGame()

  const badge = getGameAvailabilityBadge(game)
  const isRemote = isRemoteOnly(game)

  // In 2:1 horizontal card, prefer landscape backdropUrl first, then textlessPosterUrl, then standard posterUrl
  const backgroundUrl =
    (game.data as Record<string, unknown> | undefined)?.backdropUrl as string | undefined ||
    game.otixBackdropUrl ||
    (game.data as Record<string, unknown> | undefined)?.textlessPosterUrl as string | undefined ||
    game.otixTextlessPosterUrl ||
    game.data?.posterUrl ||
    game.posterUrl ||
    undefined
  const hasBackground = Boolean(backgroundUrl && !posterError)
  const hasLogo = Boolean(game.data?.logoUrl && !logoError)
  const isMatched = Boolean(game.data?.id)
  const mediaId = game.data?.id || game.matchSuggestion?.id

  const linkProps = mediaId
    ? {
        to: "/media/$mediaType/$mediaId" as const,
        params: { mediaType: "game" as const, mediaId },
        state: (((prev: any) => ({
          ...prev,
          preview: {
            title: game.data?.title || game.title,
            logoUrl: game.data?.logoUrl || null,
            logoColorGuess: game.data?.logoColorGuess || null,
            backdropUrl: ((game.data as Record<string, unknown> | undefined)?.backdropUrl as string) || null,
            posterUrl: game.data?.posterUrl || game.posterUrl || null,
          },
        })) as any),
      }
    : null

  const handlePlay = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    await launchGame(game)
  }

  const handleInstall = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const api = getDesktopAPI()
    const serverUrl = ((game as unknown as Record<string, unknown>).serverUrl as string) || ''
    const fileId = game.serverFileId || ''
    if (api?.downloadsRemoteStart && serverUrl && fileId) {
      try {
        await api.downloadsRemoteStart({
          serverUrl,
          fileId,
          filename: game.title,
          filesize: 0,
          gameTitle: game.title,
          mediaItemId: game.data?.id || game.otixMediaId || null,
        })
      } catch (err) {
        console.error("Failed to start remote install:", err)
      }
    }
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
        className="group relative aspect-[2/1] overflow-hidden rounded-xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-sm)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[var(--dk-shadow-lg)] cursor-pointer focus-within:ring-2 focus-within:ring-primary"
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
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out scale-100 group-hover:scale-105"
              onError={() => setPosterError(true)}
            />
            {/* Scrim overlay for contrast against logo & metadata */}
            <div className="absolute inset-0 bg-black/40 transition-colors duration-300 group-hover:bg-black/25 pointer-events-none" />
          </>
        ) : (
          /* Unmatched — title-hash colour gradient + icon */
          <div
            className="absolute inset-0"
            style={{ background: titleToGradient(game.title) }}
          >
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {game.iconUrl ? (
                <img
                  src={game.iconUrl}
                  alt=""
                  className="h-24 w-24 object-contain opacity-20 transition-all duration-300 group-hover:opacity-35 group-hover:scale-105"
                />
              ) : (
                <Gamepad2 className="h-20 w-20 text-foreground/10 transition-all duration-300 group-hover:text-foreground/20 group-hover:scale-105" />
              )}
            </div>
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-10 pointer-events-none">
              <h3 className="text-sm font-bold text-foreground leading-tight truncate">
                {game.title}
              </h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
                {(game.installDir || "").split(/[\\/]/).slice(-2).join(" / ")}
              </p>
            </div>
          </div>
        )}

        {/* Stretched Link for navigation (sitting at z-0, sibling to interactive buttons) */}
        {linkProps && (
          <Link
            {...linkProps}
            aria-label={game.title}
            className="absolute inset-0 z-0 rounded-xl focus:outline-none"
          />
        )}

        {/* Top badges */}
        <div className="absolute top-2.5 left-2.5 right-2.5 z-10 flex items-center justify-between gap-2 pointer-events-none">
          <DkBadge variant={badge.variant} size="sm" className="shadow-sm backdrop-blur-md bg-[var(--dk-surface-glass)] border border-white/[0.06]">
            {badge.label}
          </DkBadge>
          {isMatched && (
            <div className="flex items-center gap-1 rounded-full bg-[var(--dk-surface-glass)] backdrop-blur-md px-2 py-0.5 text-[10px] font-semibold text-primary shadow-sm border border-white/[0.06]">
              <CheckCircle2 className="h-3 w-3" />
            </div>
          )}
          {game.matchSuggestion && !isMatched && (
            <div className="flex items-center gap-1 rounded-full bg-[var(--dk-surface-glass)] backdrop-blur-md px-2 py-0.5 text-[10px] font-semibold text-primary shadow-sm border border-white/[0.06]">
              ?
            </div>
          )}
        </div>

        {/* Logo — centered */}
        {hasLogo && (
          <div className="absolute top-[8%] left-0 right-0 z-10 flex items-center justify-center px-6 pointer-events-none">
            <div
              className="absolute inset-0 opacity-75 group-hover:opacity-90 transition-opacity duration-300 pointer-events-none"
              style={{
                background:
                  "radial-gradient(ellipse at center, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.25) 50%, rgba(0, 0, 0, 0) 80%)",
              }}
            />
            <MediaLogo
              src={game.data?.logoUrl ?? ""}
              alt={game.title}
              className="relative z-10 max-h-[55%] max-w-[80%] object-contain transition-transform duration-500 ease-out scale-100 group-hover:scale-105"
              colorGuess={game.data?.logoColorGuess ?? null}
              background="dark"
              shadow="drop-shadow(0 2px 4px rgba(0,0,0,0.95)) drop-shadow(0 6px 20px rgba(0,0,0,0.85)) drop-shadow(0 0 1px rgba(0,0,0,0.9))"
              onError={() => setLogoError(true)}
            />
          </div>
        )}

        {/* Title bar — always visible at bottom */}
        <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-3 pt-10 pointer-events-none">
          <h3 className="text-sm font-bold text-foreground leading-tight truncate drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
            {game.title}
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
            {isMatched && game.data?.title && game.data?.title !== game.title
              ? game.data?.title
              : (game.installDir || "").split(/[\\/]/).slice(-2).join(" / ")}
          </p>
        </div>

        {/* Hover / Focus-Within Actions (sitting at z-20 above the stretched link) */}
        {game.matchSuggestion && !isMatched ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-300 pointer-events-none">
            <div className="absolute inset-0 bg-black/55 backdrop-blur-md rounded-xl" />
            <div className="relative z-10 flex flex-col items-center gap-3 px-4 pointer-events-auto">
              <p className="text-sm font-semibold text-foreground text-center leading-tight">
                Match with{" "}
                <span className="text-primary">{game.matchSuggestion.title}</span>?
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onAcceptSuggestion?.(game)
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-bold transition-all hover:bg-primary/90 hover:scale-105 active:scale-95 shadow-sm cursor-pointer"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Yes, match
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onRejectSuggestion?.(game)
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--dk-surface-ghost)] px-3 py-1.5 text-xs font-semibold text-foreground transition-all hover:bg-[var(--dk-surface-field)] hover:scale-105 active:scale-95 shadow-sm cursor-pointer"
                >
                  No
                </button>
              </div>
            </div>
          </div>
        ) : isRemote ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-300 pointer-events-none">
            <button
              type="button"
              onClick={handleInstall}
              className="pointer-events-auto inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-bold shadow-lg transition-all duration-200 hover:bg-primary/90 hover:scale-105 active:scale-95 cursor-pointer"
            >
              <Download className="h-4 w-4" />
              Install to PC
            </button>
          </div>
        ) : (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-300 pointer-events-none">
            <button
              type="button"
              onClick={handlePlay}
              className="pointer-events-auto inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-bold shadow-lg transition-all duration-200 hover:bg-primary/90 hover:scale-105 active:scale-95 cursor-pointer"
            >
              <Play className="h-4 w-4 fill-current" />
              Play
            </button>
          </div>
        )}

        {/* Soft micro-border highlight on hover */}
        <div className="pointer-events-none absolute inset-0 rounded-xl border border-white/[0.04] group-hover:border-white/[0.12] transition-colors duration-300" />
      </motion.div>

      {/* Disambiguation modal if multiple executables/consoles exist */}
      {hasDisambiguationTarget && (
        <ConsoleDisambiguationModal {...disambiguationModalProps} />
      )}
    </>
  )
}
