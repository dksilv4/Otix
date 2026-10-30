// TODO: Review this file
/**
 * Hooks for SABnzbd + NZBPlanet download integration.
 * All calls go through window.desktopAPI (Electron IPC).
 * Falls back gracefully when not running in Electron.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { isDesktop } from '@/lib/desktop/api';
import type { NZBResult, DownloadConfig, Download, WishlistTrackingEntry, HypervisorConfirmResponse } from '../types';

// ── Config ──

export function useDownloadConfig(userId: string | undefined = undefined) {
  const [config, setConfig] = useState<DownloadConfig | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchConfig = useCallback(async () => {
    if (!userId || !isDesktop()) return;
    setLoading(true);
    try {
      const c = await window.desktopAPI!.downloadsGetConfig(userId) as unknown as DownloadConfig;
      setConfig(c);
    } catch (err) {
      console.error('Failed to fetch download config:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const saveConfig = useCallback(async (cfg: Omit<DownloadConfig, 'id'> & { id?: string }) => {
    if (!isDesktop()) throw new Error('Not in Electron');
    const saved = await window.desktopAPI!.downloadsSaveConfig(cfg as Record<string, unknown>) as unknown as DownloadConfig;
    setConfig(saved);
    return saved;
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return { config, loading, fetchConfig, saveConfig };
}

// ── Search ──

export function useNzbSearch() {
  const [results, setResults] = useState<NZBResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [bestPick, setBestPick] = useState<NZBResult | null>(null);

  const search = useCallback(async (query: string, apiKey: string, allowHypervisor?: boolean) => {
    if (!isDesktop()) return [];
    setSearching(true);
    try {
      const r = await window.desktopAPI!.downloadsSearch(query, apiKey) as unknown as NZBResult[];
      setResults(r);
      const best = await window.desktopAPI!.downloadsAutoPick(r as unknown as Record<string, unknown>[], allowHypervisor) as unknown as NZBResult | null;
      setBestPick(best);
      return r;
    } catch (err) {
      console.error('NZB search failed:', err);
      return [];
    } finally {
      setSearching(false);
    }
  }, []);

  return { results, searching, bestPick, search };
}

// ── Download ──

export function useDownloads(userId: string | undefined) {
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDownloads = useCallback(async () => {
    if (!isDesktop()) return;
    try {
      // The downloads table is the shared framework layer (SABnzbd + Radarr +
      // Sonarr write into it) and the IPC handler ignores userId, so fetch it
      // regardless of sign-in state — Radarr/Sonarr download tracking is meant
      // to work offline.
      const d = await window.desktopAPI!.downloadsGetUserDownloads(userId ?? '') as unknown as Download[];
      setDownloads(d);
    } catch (err) {
      console.error('Failed to fetch downloads:', err);
    }
  }, [userId]);

  const searchAndDownload = useCallback(async (
    uid: string,
    mediaItemId: string | null,
    gameName: string,
    allowHypervisor?: boolean,
  ): Promise<{ download: Download } | { error: string } | HypervisorConfirmResponse> => {
    if (!isDesktop()) return { error: 'Not in Electron' };
    setLoading(true);
    try {
      const result = await window.desktopAPI!.downloadsSearchAndDownload(uid, mediaItemId, gameName, allowHypervisor) as unknown as { download: Download } | { error: string } | HypervisorConfirmResponse;
      await fetchDownloads();
      return result;
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : 'Unknown error' };
    } finally {
      setLoading(false);
    }
  }, [fetchDownloads]);

  const pollQueue = useCallback(async () => {
    if (!isDesktop()) return;
    try {
      await window.desktopAPI!.downloadsPollQueue(userId ?? '');
      await fetchDownloads();
    } catch (err) {
      console.error('Poll failed:', err);
    }
  }, [userId, fetchDownloads]);

  const cancelDownload = useCallback(async (id: string) => {
    if (!isDesktop()) return;
    await window.desktopAPI!.downloadsDelete(id);
    await fetchDownloads();
  }, [fetchDownloads]);

  // Start polling when downloads are active
  useEffect(() => {
    fetchDownloads();
  }, [fetchDownloads]);

  useEffect(() => {
    const hasActive = downloads.some(d => d.status === 'queued' || d.status === 'downloading' || d.status === 'processing');
    if (hasActive && !pollRef.current) {
      pollRef.current = setInterval(pollQueue, 15000); // every 15s
    } else if (!hasActive && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [downloads, pollQueue]);

  return { downloads, loading, fetchDownloads, searchAndDownload, pollQueue, cancelDownload };
}

// ── Wishlist ──

export function useWishlistDownloads(userId: string | undefined) {
  const [tracking, setTracking] = useState<WishlistTrackingEntry[]>([]);
  const [scanning, setScanning] = useState(false);

  const fetchTracking = useCallback(async () => {
    if (!userId || !isDesktop()) return;
    try {
      const t = await window.desktopAPI!.downloadsGetWishlistTracking(userId) as unknown as WishlistTrackingEntry[];
      setTracking(t);
    } catch (err) {
      console.error('Failed to fetch wishlist tracking:', err);
    }
  }, [userId]);

  const scanWishlist = useCallback(async (games: { id: string; title: string }[]) => {
    if (!userId || !isDesktop()) return [];
    setScanning(true);
    try {
      const r = await window.desktopAPI!.downloadsScanWishlist(userId, games);
      await fetchTracking();
      return r;
    } catch (err) {
      console.error('Wishlist scan failed:', err);
      return [];
    } finally {
      setScanning(false);
    }
  }, [userId, fetchTracking]);

  const skipItem = useCallback(async (mediaItemId: string) => {
    if (!userId || !isDesktop()) return;
    await window.desktopAPI!.downloadsSkipWishlistItem(userId, mediaItemId);
    await fetchTracking();
  }, [userId, fetchTracking]);

  useEffect(() => {
    fetchTracking();
  }, [fetchTracking]);

  return { tracking, scanning, fetchTracking, scanWishlist, skipItem };
}

// ── Connection testing ──

export function useConnectionTest() {
  const [testingSabnzbd, setTestingSabnzbd] = useState(false);
  const [testingNzbplanet, setTestingNzbplanet] = useState(false);

  const testSabnzbd = useCallback(async (host: string, port: number, apiKey: string, useSsl: boolean) => {
    if (!isDesktop()) return false;
    setTestingSabnzbd(true);
    try {
      return await window.desktopAPI!.downloadsTestSabnzbd(host, port, apiKey, useSsl);
    } finally {
      setTestingSabnzbd(false);
    }
  }, []);

  const testNzbplanet = useCallback(async (apiKey: string) => {
    console.log('[useConnectionTest] testNzbplanet called, apiKey length:', apiKey?.length ?? 0, 'isDesktop:', isDesktop());
    if (!isDesktop()) {
      console.error('[useConnectionTest] NOT in Electron — window.desktopAPI is', typeof window !== 'undefined' ? window.desktopAPI : 'window undefined');
      return false;
    }
    setTestingNzbplanet(true);
    try {
      console.log('[useConnectionTest] calling window.desktopAPI.downloadsTestNzbplanet...');
      const result = await window.desktopAPI!.downloadsTestNzbplanet(apiKey);
      console.log('[useConnectionTest] result:', result);
      return result;
    } catch (err: unknown) {
      console.error('[useConnectionTest] error:', err instanceof Error ? err.message : err);
      return false;
    } finally {
      setTestingNzbplanet(false);
    }
  }, []);

  return { testingSabnzbd, testingNzbplanet, testSabnzbd, testNzbplanet };
}
