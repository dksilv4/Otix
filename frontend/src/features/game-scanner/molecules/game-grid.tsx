// frontend/src/features/game-scanner/molecules/game-grid.tsx
import { AnimatePresence } from "framer-motion";
import { GameCard } from "./game-card";
import type { DetectedGame } from "../types";

interface GameGridProps {
  games: DetectedGame[];
}

export function GameGrid({ games }: GameGridProps) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <AnimatePresence mode="popLayout">
        {games.map((game, i) => (
          <GameCard key={game.id} game={game} index={i} />
        ))}
      </AnimatePresence>
    </div>
  );
}
