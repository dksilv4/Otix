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
} from '../usenet-types';
import { normalizeProwlarrRelease, normalizeProwlarrIndexers } from '../usenet-utils';

export const usenetKeys = {
  all: ['server-usenet'] as const,
  config: (nodeId?: number) => [...usenetKeys.all, nodeId, 'config'] as const,
  search: (nodeId?: number, query?: string) =>
    [...usenetKeys.all, nodeId, 'search', query] as const,
  queue: (nodeId?: number) => [...usenetKeys.all, nodeId, 'queue'] as const,
  history: (nodeId?: number) => [...usenetKeys.all, nodeId, 'history'] as const,
  prowlarrIndexers: (nodeId?: number, protocol?: string) =>
    protocol
      ? ([...usenetKeys.all, nodeId, 'prowlarr-indexers', protocol] as const)
      : ([...usenetKeys.all, nodeId, 'prowlarr-indexers'] as const),
};

export const nodeUsenetKeys = usenetKeys;

export const isValidNodeId = (id?: number): id is number => typeof id === 'number' && id > 0;

/** Hook to fetch Usenet configuration from the connected node. */
export function useNodeUsenetConfig(nodeId?: number) {
  return useQuery<ServerUsenetConfig>({
    queryKey: usenetKeys.config(nodeId),
    queryFn: async () => {
      if (!isValidNodeId(nodeId)) throw new Error('No valid node selected');
      const { data } = await apiClient.get<ServerUsenetConfig>(
        `/library/servers/${nodeId}/usenet/config`
      );
      return data;
    },
    enabled: isValidNodeId(nodeId),
    retry: false,
    staleTime: 30_000,
  });
}

export const useServerUsenetConfig = useNodeUsenetConfig;

/** Hook to update SABnzbd & Prowlarr settings on the node. */
export function useSaveNodeUsenetConfig(nodeId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<ServerUsenetConfig>) => {
      if (!isValidNodeId(nodeId)) throw new Error('No valid node selected');
      const { data } = await apiClient.post(
        `/library/servers/${nodeId}/usenet/config`,
        payload
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usenetKeys.config(nodeId) });
    },
  });
}

export const useSaveServerUsenetConfig = useSaveNodeUsenetConfig;

/** Hook to test connectivity to SABnzbd. */
export function useTestSabnzbd(nodeId?: number) {
  return useMutation({
    mutationFn: async (payload?: {
      host?: string;
      port?: number;
      api_key?: string;
      use_ssl?: boolean;
      url_base?: string;
    } | void) => {
      if (!isValidNodeId(nodeId)) throw new Error('No valid node selected');
      const { data } = await apiClient.post<ConnectionTestResult>(
        `/library/servers/${nodeId}/usenet/test-sabnzbd`,
        payload || {}
      );
      return data;
    },
  });
}

/** Hook to test connectivity to Prowlarr. */
export function useTestProwlarr(nodeId?: number) {
  return useMutation({
    mutationFn: async (payload?: {
      host?: string;
      port?: number;
      api_key?: string;
      use_ssl?: boolean;
      url_base?: string;
    } | void) => {
      if (!isValidNodeId(nodeId)) throw new Error('No valid node selected');
      const { data } = await apiClient.post<ConnectionTestResult>(
        `/library/servers/${nodeId}/usenet/test-prowlarr`,
        payload || {}
      );
      return data;
    },
  });
}

const NUMERAL_PAIRS: [RegExp, string][] = [
  [/\b3\b/g, 'III'],
  [/\biii\b/gi, '3'],
  [/\b2\b/g, 'II'],
  [/\bii\b/gi, '2'],
  [/\b4\b/g, 'IV'],
  [/\biv\b/gi, '4'],
  [/\b5\b/g, 'V'],
  [/\bv\b/gi, '5'],
  [/\b6\b/g, 'VI'],
  [/\bvi\b/gi, '6'],
  [/\b7\b/g, 'VII'],
  [/\bvii\b/gi, '7'],
  [/\b8\b/g, 'VIII'],
  [/\bviii\b/gi, '8'],
  [/\b9\b/g, 'IX'],
  [/\bix\b/gi, '9'],
  [/\b10\b/g, 'X'],
  [/\bx\b/gi, '10'],
];

export function getAlternateNumeralQuery(query: string): string | null {
  for (const [pattern, replacement] of NUMERAL_PAIRS) {
    if (pattern.test(query)) {
      return query.replace(pattern, replacement);
    }
  }
  return null;
}

/** Hook to search indexers via Prowlarr on the node. */
export function useNodeUsenetSearch(nodeId?: number, query?: string) {
  return useQuery<ServerProwlarrRelease[]>({
    queryKey: usenetKeys.search(nodeId, query),
    queryFn: async () => {
      const q = query?.trim();
      if (!isValidNodeId(nodeId) || !q) return [];
      const queries = [q];
      const alt = getAlternateNumeralQuery(q);
      if (alt && alt.toLowerCase() !== q.toLowerCase()) {
        queries.push(alt);
      }

      const results = await Promise.all(
        queries.map(async (searchQuery) => {
          try {
            const { data } = await apiClient.get<unknown>(
              `/library/servers/${nodeId}/usenet/search`,
              { params: { query: searchQuery } }
            );
            return Array.isArray(data) ? data : [];
          } catch {
            return [];
          }
        }),
      );

      const seen = new Set<string>();
      const combined: ServerProwlarrRelease[] = [];
      for (const row of results.flat()) {
        const item = normalizeProwlarrRelease(row);
        if (item && !seen.has(item.guid)) {
          seen.add(item.guid);
          combined.push(item);
        }
      }
      return combined;
    },
    enabled: isValidNodeId(nodeId) && !!query?.trim(),
    retry: false,
    staleTime: 60_000,
  });
}

export const useServerUsenetSearch = useNodeUsenetSearch;

/** Hook to queue an NZB download into SABnzbd on the node. */
export function useStartNodeDownload(nodeId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: DownloadReleasePayload) => {
      if (!isValidNodeId(nodeId)) throw new Error('No valid node selected');
      const { data } = await apiClient.post(
        `/library/servers/${nodeId}/usenet/download`,
        payload
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usenetKeys.queue(nodeId) });
      queryClient.invalidateQueries({ queryKey: usenetKeys.history(nodeId) });
    },
  });
}

export const useStartServerDownload = useStartNodeDownload;

/** Hook to fetch persisted download history, synced from SABnzbd. */
export function useNodeUsenetHistory(nodeId?: number, pollingIntervalMs: number = 10000) {
  return useQuery<ServerDownloadHistoryItem[]>({
    queryKey: usenetKeys.history(nodeId),
    queryFn: async () => {
      if (!isValidNodeId(nodeId)) throw new Error('No valid node selected');
      const { data } = await apiClient.get<ServerDownloadHistoryData>(
        `/library/servers/${nodeId}/usenet/history`,
        { params: { limit: 50 } }
      );
      return Array.isArray(data?.items) ? data.items : [];
    },
    enabled: isValidNodeId(nodeId),
    retry: false,
    refetchInterval: (query) => (query.state.status === 'error' ? false : pollingIntervalMs),
    refetchIntervalInBackground: false,
    staleTime: 8000,
  });
}

export const useServerUsenetHistory = useNodeUsenetHistory;

/** Hook to fetch live download queue from SABnzbd with optional polling. */
export function useNodeUsenetQueue(nodeId?: number, pollingIntervalMs: number = 3000) {
  return useQuery<ServerDownloadQueueData>({
    queryKey: usenetKeys.queue(nodeId),
    queryFn: async () => {
      if (!isValidNodeId(nodeId)) throw new Error('No valid node selected');
      const { data } = await apiClient.get<ServerDownloadQueueData>(
        `/library/servers/${nodeId}/usenet/queue`
      );
      return data;
    },
    enabled: isValidNodeId(nodeId),
    retry: false,
    refetchInterval: (query) => {
      if (query.state.status === 'error') return false;
      const items = query.state.data?.items;
      if (items && items.length > 0) {
        return Math.min(pollingIntervalMs, 1500);
      }
      return pollingIntervalMs;
    },
    refetchIntervalInBackground: false,
    staleTime: 1000,
    meta: { suppressToast: true },
  });
}

export const useServerUsenetQueue = useNodeUsenetQueue;

/** Hook to cancel a download in SABnzbd on the node. */
export function useCancelNodeQueueDownload(nodeId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (nzoId: string) => {
      if (!isValidNodeId(nodeId)) throw new Error('No valid node selected');
      const { data } = await apiClient.delete(
        `/library/servers/${nodeId}/usenet/queue/${nzoId}`
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usenetKeys.queue(nodeId) });
      queryClient.invalidateQueries({ queryKey: usenetKeys.history(nodeId) });
    },
  });
}

export const useCancelServerQueueDownload = useCancelNodeQueueDownload;

/** Hook to save SABnzbd configuration specifically. */
export function useSaveNodeSabnzbdConfig(nodeId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sabnzbd: Partial<ServerSabnzbdConfig>) => {
      if (!isValidNodeId(nodeId)) throw new Error('No valid node selected');
      const { data } = await apiClient.post<SaveServerUsenetConfigResponse>(
        `/library/servers/${nodeId}/usenet/config`,
        { sabnzbd }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usenetKeys.all });
      queryClient.invalidateQueries({ queryKey: ['server-providers'] });
      queryClient.invalidateQueries({ queryKey: ['game-servers'] });
    },
  });
}

export const useSaveServerSabnzbdConfig = useSaveNodeSabnzbdConfig;

/** Hook to save Prowlarr configuration specifically. */
export function useSaveNodeProwlarrConfig(nodeId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (prowlarr: Partial<ServerProwlarrConfig>) => {
      if (!isValidNodeId(nodeId)) throw new Error('No valid node selected');
      const { data } = await apiClient.post<SaveServerUsenetConfigResponse>(
        `/library/servers/${nodeId}/usenet/config`,
        { prowlarr }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usenetKeys.all });
      queryClient.invalidateQueries({ queryKey: ['server-providers'] });
      queryClient.invalidateQueries({ queryKey: ['game-servers'] });
    },
  });
}

export const useSaveServerProwlarrConfig = useSaveNodeProwlarrConfig;

/** Hook to fetch indexers from Prowlarr. */
export function useProwlarrIndexers(
  nodeId?: number,
  protocol?: 'all' | 'torrent' | 'usenet' | string
) {
  return useQuery<ProwlarrIndexerItem[]>({
    queryKey: usenetKeys.prowlarrIndexers(nodeId, protocol),
    queryFn: async () => {
      if (!isValidNodeId(nodeId)) throw new Error('No valid node selected');
      const params = protocol && protocol !== 'all' ? { protocol } : undefined;
      const { data } = await apiClient.get<unknown>(
        `/library/servers/${nodeId}/prowlarr/indexers`,
        { params }
      );
      return normalizeProwlarrIndexers(data);
    },
    enabled: isValidNodeId(nodeId),
    retry: false,
    staleTime: 60_000,
  });
}

/** Hook to trigger indexer sync in Prowlarr. */
export function useSyncProwlarrIndexers(nodeId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (protocol?: 'all' | 'torrent' | 'usenet' | string) => {
      if (!isValidNodeId(nodeId)) throw new Error('No valid node selected');
      const params = protocol && protocol !== 'all' ? { protocol } : undefined;
      const { data } = await apiClient.post<ProwlarrSyncResponse>(
        `/library/servers/${nodeId}/prowlarr/sync`,
        params ? { protocol } : {},
        { params }
      );
      return data;
    },
    onSuccess: (data) => {
      const indexers = normalizeProwlarrIndexers(data);
      queryClient.setQueryData(usenetKeys.prowlarrIndexers(nodeId), indexers);
    },
  });
}

/** Hook to pause the SABnzbd download queue. */
export function usePauseSabnzbdQueue(nodeId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!isValidNodeId(nodeId)) throw new Error('No valid node selected');
      const { data } = await apiClient.post(
        `/library/servers/${nodeId}/sabnzbd/queue/pause`
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usenetKeys.queue(nodeId) });
    },
  });
}

/** Hook to resume the SABnzbd download queue. */
export function useResumeSabnzbdQueue(nodeId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!isValidNodeId(nodeId)) throw new Error('No valid node selected');
      const { data } = await apiClient.post(
        `/library/servers/${nodeId}/sabnzbd/queue/resume`
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usenetKeys.queue(nodeId) });
    },
  });
}
