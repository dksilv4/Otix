import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type {
  ConnectionTestResult,
  DownloadReleasePayload,
  ProwlarrIndexerItem,
  ProwlarrSyncResponse,
  ServerDownloadHistoryData,
  ServerDownloadHistoryItem,
  ServerDownloadQueueData,
  ServerProwlarrConfig,
  ServerProwlarrRelease,
  ServerSabnzbdConfig,
  SaveServerUsenetConfigResponse,
  ServerUsenetConfig,
} from './usenet-types';
import { normalizeProwlarrRelease } from './usenet-utils';

export const usenetKeys = {
  all: ['server-usenet'] as const,
  config: (serverId?: number) => [...usenetKeys.all, serverId, 'config'] as const,
  search: (serverId?: number, query?: string) =>
    [...usenetKeys.all, serverId, 'search', query] as const,
  queue: (serverId?: number) => [...usenetKeys.all, serverId, 'queue'] as const,
  history: (serverId?: number) => [...usenetKeys.all, serverId, 'history'] as const,
  prowlarrIndexers: (serverId?: number, protocol?: string) =>
    [...usenetKeys.all, serverId, 'prowlarr-indexers', protocol] as const,
};

/** Hook to fetch Usenet configuration from the connected server node. */
export function useServerUsenetConfig(serverId?: number) {
  return useQuery<ServerUsenetConfig>({
    queryKey: usenetKeys.config(serverId),
    queryFn: async () => {
      if (!serverId) throw new Error('No server selected');
      const { data } = await apiClient.get<ServerUsenetConfig>(
        `/library/servers/${serverId}/usenet/config`
      );
      return data;
    },
    enabled: !!serverId,
    staleTime: 30_000,
  });
}

/** Hook to update SABnzbd & Prowlarr settings on the server node. */
export function useSaveServerUsenetConfig(serverId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<ServerUsenetConfig>) => {
      if (!serverId) throw new Error('No server selected');
      const { data } = await apiClient.post(
        `/library/servers/${serverId}/usenet/config`,
        payload
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usenetKeys.config(serverId) });
    },
  });
}

/** Hook to test connectivity to SABnzbd. */
export function useTestSabnzbd(serverId?: number) {
  return useMutation({
    mutationFn: async (payload?: {
      host?: string;
      port?: number;
      api_key?: string;
      use_ssl?: boolean;
      url_base?: string;
    }) => {
      if (!serverId) throw new Error('No server selected');
      const { data } = await apiClient.post<ConnectionTestResult>(
        `/library/servers/${serverId}/usenet/test-sabnzbd`,
        payload || {}
      );
      return data;
    },
  });
}

/** Hook to test connectivity to Prowlarr. */
export function useTestProwlarr(serverId?: number) {
  return useMutation({
    mutationFn: async (payload?: {
      host?: string;
      port?: number;
      api_key?: string;
      use_ssl?: boolean;
      url_base?: string;
    }) => {
      if (!serverId) throw new Error('No server selected');
      const { data } = await apiClient.post<ConnectionTestResult>(
        `/library/servers/${serverId}/usenet/test-prowlarr`,
        payload || {}
      );
      return data;
    },
  });
}

/** Hook to search indexers via Prowlarr on the server node. */
export function useServerUsenetSearch(serverId?: number, query?: string) {
  return useQuery<ServerProwlarrRelease[]>({
    queryKey: usenetKeys.search(serverId, query),
    queryFn: async () => {
      if (!serverId || !query?.trim()) return [];
      const { data } = await apiClient.get<unknown>(
        `/library/servers/${serverId}/usenet/search`,
        { params: { query: query.trim() } }
      );
      const rows = Array.isArray(data) ? data : [];
      return rows
        .map((row) => normalizeProwlarrRelease(row))
        .filter((row): row is ServerProwlarrRelease => row != null);
    },
    enabled: !!serverId && !!query?.trim(),
    staleTime: 60_000,
  });
}

/** Hook to queue an NZB download into SABnzbd on the server node. */
export function useStartServerDownload(serverId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: DownloadReleasePayload) => {
      if (!serverId) throw new Error('No server selected');
      const { data } = await apiClient.post(
        `/library/servers/${serverId}/usenet/download`,
        payload
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usenetKeys.queue(serverId) });
      queryClient.invalidateQueries({ queryKey: usenetKeys.history(serverId) });
    },
  });
}

/** Hook to fetch persisted download history, synced from SABnzbd. */
export function useServerUsenetHistory(serverId?: number, pollingIntervalMs: number = 10000) {
  return useQuery<ServerDownloadHistoryItem[]>({
    queryKey: usenetKeys.history(serverId),
    queryFn: async () => {
      if (!serverId) throw new Error('No server selected');
      const { data } = await apiClient.get<ServerDownloadHistoryData>(
        `/library/servers/${serverId}/usenet/history`,
        { params: { limit: 50 } }
      );
      return Array.isArray(data?.items) ? data.items : [];
    },
    enabled: !!serverId,
    refetchInterval: pollingIntervalMs,
    refetchIntervalInBackground: true,
    staleTime: 8000,
  });
}

/** Hook to fetch live download queue from SABnzbd with optional polling. */
export function useServerUsenetQueue(serverId?: number, pollingIntervalMs: number = 3000) {
  return useQuery<ServerDownloadQueueData>({
    queryKey: usenetKeys.queue(serverId),
    queryFn: async () => {
      if (!serverId) throw new Error('No server selected');
      const { data } = await apiClient.get<ServerDownloadQueueData>(
        `/library/servers/${serverId}/usenet/queue`
      );
      return data;
    },
    enabled: !!serverId,
    refetchInterval: pollingIntervalMs,
    refetchIntervalInBackground: true,
    staleTime: 2000,
  });
}

/** Hook to cancel a download in SABnzbd on the server node. */
export function useCancelServerQueueDownload(serverId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (nzoId: string) => {
      if (!serverId) throw new Error('No server selected');
      const { data } = await apiClient.delete(
        `/library/servers/${serverId}/usenet/queue/${nzoId}`
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usenetKeys.queue(serverId) });
      queryClient.invalidateQueries({ queryKey: usenetKeys.history(serverId) });
    },
  });
}

/** Hook to save SABnzbd configuration specifically. */
export function useSaveServerSabnzbdConfig(serverId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sabnzbd: Partial<ServerSabnzbdConfig>) => {
      if (!serverId) throw new Error('No server selected');
      const { data } = await apiClient.post<SaveServerUsenetConfigResponse>(
        `/library/servers/${serverId}/usenet/config`,
        { sabnzbd }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usenetKeys.all });
    },
  });
}

/** Hook to save Prowlarr configuration specifically. */
export function useSaveServerProwlarrConfig(serverId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (prowlarr: Partial<ServerProwlarrConfig>) => {
      if (!serverId) throw new Error('No server selected');
      const { data } = await apiClient.post(
        `/library/servers/${serverId}/usenet/config`,
        { prowlarr }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usenetKeys.all });
    },
  });
}

/** Hook to fetch indexers from Prowlarr. */
export function useProwlarrIndexers(
  serverId?: number,
  protocol?: 'all' | 'torrent' | 'usenet' | string
) {
  return useQuery<ProwlarrIndexerItem[]>({
    queryKey: usenetKeys.prowlarrIndexers(serverId, protocol),
    queryFn: async () => {
      if (!serverId) throw new Error('No server selected');
      const params = protocol && protocol !== 'all' ? { protocol } : undefined;
      const { data } = await apiClient.get<ProwlarrIndexerItem[]>(
        `/library/servers/${serverId}/prowlarr/indexers`,
        { params }
      );
      return data || [];
    },
    enabled: !!serverId,
    staleTime: 60_000,
  });
}

/** Hook to trigger indexer sync in Prowlarr. */
export function useSyncProwlarrIndexers(serverId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (protocol?: 'all' | 'torrent' | 'usenet' | string) => {
      if (!serverId) throw new Error('No server selected');
      const params = protocol && protocol !== 'all' ? { protocol } : undefined;
      const { data } = await apiClient.post<ProwlarrSyncResponse>(
        `/library/servers/${serverId}/prowlarr/sync`,
        params ? { protocol } : {},
        { params }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usenetKeys.prowlarrIndexers(serverId) });
    },
  });
}

/** Hook to pause the SABnzbd download queue. */
export function usePauseSabnzbdQueue(serverId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!serverId) throw new Error('No server selected');
      const { data } = await apiClient.post(
        `/library/servers/${serverId}/sabnzbd/queue/pause`
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usenetKeys.queue(serverId) });
    },
  });
}

/** Hook to resume the SABnzbd download queue. */
export function useResumeSabnzbdQueue(serverId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!serverId) throw new Error('No server selected');
      const { data } = await apiClient.post(
        `/library/servers/${serverId}/sabnzbd/queue/resume`
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usenetKeys.queue(serverId) });
    },
  });
}

