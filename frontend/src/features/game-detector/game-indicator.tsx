import { useState, useEffect, useRef } from 'react';
import { Gamepad2, X, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGameDetector } from './use-game-detector';

function formatElapsed(ms: number): string {
 const totalSeconds = Math.floor(ms / 1000);
 const hours = Math.floor(totalSeconds / 3600);
 const minutes = Math.floor((totalSeconds % 3600) / 60);
 const seconds = totalSeconds % 60;

 if (hours > 0) {
 return `${hours}h ${minutes}m`;
 }
 if (minutes > 0) {
 return `${minutes}m ${seconds}s`;
 }
 return `${seconds}s`;
}

interface Props {
 onOpenMatcher: () => void;
}

export function GameIndicator({ onOpenMatcher }: Props) {
 const { runningGame, stopTracking } = useGameDetector();
 const [elapsed, setElapsed] = useState(0);
 const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

 useEffect(() => {
 if (runningGame) {
 setElapsed(Date.now() - runningGame.startTime);
 timerRef.current = setInterval(() => {
 setElapsed(Date.now() - runningGame.startTime);
 }, 1000);
 } else {
 setElapsed(0);
 }
 return () => {
 if (timerRef.current) {
 clearInterval(timerRef.current);
 timerRef.current = null;
 }
 };
 }, [runningGame]);

 // Check if we're in Electron
 const isElectron = typeof window !== 'undefined' && !!window.electronAPI;
 if (!isElectron) return null;

 return (
 <>
 {runningGame && (
 <div
 className={cn(
 'fixed z-[9999] bottom-6 left-1/2 -translate-x-1/2',
 'flex items-center gap-3 rounded-2xl px-4 py-2.5',
 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20',
 'backdrop-blur-lg border border-emerald-500/30',
 'shadow-lg shadow-emerald-500/10',
 'animate-in fade-in slide-in-from-bottom-2 duration-300',
 )}
 >
 <div className="flex items-center gap-2">
 <span className="relative flex h-2.5 w-2.5">
 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
 <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
 </span>
 <Gamepad2 className="h-4 w-4 text-emerald-400" />
 </div>

 <div className="flex flex-col">
 <span className="text-sm font-semibold text-foreground leading-tight">
 {runningGame.game.title}
 </span>
 <span className="text-xs text-muted-foreground tabular-nums">
 {formatElapsed(elapsed)}
 </span>
 </div>

 <button
 onClick={onOpenMatcher}
 className="p-1 rounded-full hover:bg-foreground/10 transition-colors"
 aria-label="Open game matcher"
 >
 <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
 </button>

 <button
 onClick={stopTracking}
 className="ml-0.5 p-1 rounded-full hover:bg-foreground/10 transition-colors"
 aria-label="Stop tracking"
 >
 <X className="h-3.5 w-3.5 text-muted-foreground" />
 </button>
 </div>
 )}

 {/* Small matcher launcher when no game running */}
 {!runningGame && (
 <button
 onClick={onOpenMatcher}
 className={cn(
 'fixed z-[9999] bottom-6 left-1/2 -translate-x-1/2',
 'flex items-center gap-2 rounded-full px-3 py-2',
 'bg-[var(--dk-surface-glass)] backdrop-blur-lg',
 'shadow-[var(--dk-shadow-glass)] /10',
 'text-xs text-muted-foreground hover:text-foreground',
 'transition-all duration-200',
 )}
 aria-label="Open game matcher"
 >
 <Link2 className="h-3.5 w-3.5" />
 <span>Match Games</span>
 </button>
 )}
 </>
 );
}
