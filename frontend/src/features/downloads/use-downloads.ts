/**
 * Hooks for SABnzbd + NZBPlanet download integration.
 * All calls go through window.electronAPI (Electron IPC).
 * Falls back gracefully when not running in Electron.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { NZBResult, DownloadConfig, Download, WishlistTrackingEntry } from './types';

function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI;
}

// ── Config ──

export function useDownloadConfig(userId: string | undefined) {
  const [config, setConfig] = useState<DownloadConfig | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchConfig = useCallback(async () => {
    if (!userId || !isElectron()) return;
    setLoading(true);
    try {
      const c = await window.electronAPI!.downloadsGetConfig(userId);
      setConfig(c);
    } catch (err) {
      console.error('Failed to fetch download config:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const saveConfig = useCallback(async (cfg: Omit<DownloadConfig, 'id'> & { id?: string }) => {
    if (!isElectron()) throw new Error('Not in Electron');
    const saved = await window.electronAPI!.downloadsSaveConfig(cfg);
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

  const search = useCallback(async (query: string, apiKey: string) => {
    if (!isElectron()) return [];
    setSearching(true);
    try {
      const r = await window.electronAPI!.downloadsSearch(query, apiKey);
      setResults(r);
      const best = await window.electronAPI!.downloadsAutoPick(r);
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
    console.log('[useDownloads] fetchDownloads called, userId:', userId, 'isElectron:', isElectron());
    if (!userId || !isElectron()) {
      console.log('[useDownloads] fetchDownloads skipped — no userId or not Electron');
      return;
    }
    try {
      const d = await window.electronAPI!.downloadsGetUserDownloads(userId);
      console.log('[useDownloads] fetched', d.length, 'downloads:', d.map(x => ({ id: x.id, mediaItemId: x.mediaItemId, status: x.status })));
      setDownloads(d);
    } catch (err) {
      console.error('Failed to fetch downloads:', err);
    }
  }, [userId]);

  const searchAndDownload = useCallback(async (
    uid: string,
    mediaItemId: string | null,
    gameName: string,
  ): Promise<{ download: Download } | { error: string }> => {
    if (!isElectron()) return { error: 'Not in Electron' };
    setLoading(true);
    try {
      const result = await window.electronAPI!.downloadsSearchAndDownload(uid, mediaItemId, gameName);
      await fetchDownloads();
      return result;
    } catch (err: any) {
      return { error: err.message ?? 'Unknown error' };
    } finally {
      setLoading(false);
    }
  }, [fetchDownloads]);

  const pollQueue = useCallback(async () => {
    if (!userId || !isElectron()) return;
    try {
      await window.electronAPI!.downloadsPollQueue(userId);
      await fetchDownloads();
    } catch (err) {
      console.error('Poll failed:', err);
    }
  }, [userId, fetchDownloads]);

  const cancelDownload = useCallback(async (id: string) => {
    if (!isElectron()) return;
    await window.electronAPI!.downloadsDelete(id);
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
    if (!userId || !isElectron()) return;
    try {
      const t = await window.electronAPI!.downloadsGetWishlistTracking(userId);
      setTracking(t);
    } catch (err) {
      console.error('Failed to fetch wishlist tracking:', err);
    }
  }, [userId]);

  const scanWishlist = useCallback(async (games: { id: string; title: string }[]) => {
    if (!userId || !isElectron()) return [];
    setScanning(true);
    try {
      const r = await window.electronAPI!.downloadsScanWishlist(userId, games);
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
    if (!userId || !isElectron()) return;
    await window.electronAPI!.downloadsSkipWishlistItem(userId, mediaItemId);
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
    if (!isElectron()) return false;
    setTestingSabnzbd(true);
    try {
      return await window.electronAPI!.downloadsTestSabnzbd(host, port, apiKey, useSsl);
    } finally {
      setTestingSabnzbd(false);
    }
  }, []);

  const testNzbplanet = useCallback(async (apiKey: string) => {
    console.log('[useConnectionTest] testNzbplanet called, apiKey length:', apiKey?.length ?? 0, 'isElectron:', isElectron());
    if (!isElectron()) {
      console.error('[useConnectionTest] NOT in Electron — window.electronAPI is', typeof window !== 'undefined' ? (window as any).electronAPI : 'window undefined');
      return false;
    }
    setTestingNzbplanet(true);
    try {
      console.log('[useConnectionTest] calling window.electronAPI.downloadsTestNzbplanet...');
      const result = await window.electronAPI!.downloadsTestNzbplanet(apiKey);
      console.log('[useConnectionTest] result:', result);
      return result;
    } catch (err: any) {
      console.error('[useConnectionTest] error:', err.message, err);
      return false;
    } finally {
      setTestingNzbplanet(false);
    }
  }, []);

  return { testingSabnzbd, testingNzbplanet, testSabnzbd, testNzbplanet };
}
