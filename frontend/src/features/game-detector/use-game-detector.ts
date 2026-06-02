import { useState, useEffect, useCallback } from 'react';
import type { RunningGame, PlaySession } from '@desktop/preload-api';

export function useGameDetector() {
  const [runningGame, setRunningGame] = useState<RunningGame | null>(null);
  const [recentSessions, setRecentSessions] = useState<PlaySession[]>([]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    api.getRunningGame().then(setRunningGame);
    api.getRecentSessions().then((sessions) => setRecentSessions(sessions.slice(0, 20)));

    const unsubStarted = api.onGameStarted((data) => {
      setRunningGame(data);
    });
    const unsubEnded = api.onGameEnded((session) => {
      setRunningGame(null);
      setRecentSessions((prev) => [session, ...prev].slice(0, 20));
    });

    return () => {
      unsubStarted();
      unsubEnded();
    };
  }, []);

  const stopTracking = useCallback(async () => {
    const api = window.electronAPI;
    if (!api || !runningGame) return;
    await api.stopTracking(runningGame.game.id);
  }, [runningGame]);

  return { runningGame, recentSessions, stopTracking };
}
