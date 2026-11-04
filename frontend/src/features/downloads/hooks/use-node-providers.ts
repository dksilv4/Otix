/** React Query hooks for the Unified Modular Provider Framework (Downloaders & Search Providers). */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { isValidNodeId } from './use-node-usenet';
import { searchModularNodeDirect } from '../utils/node-search';
import type {
  AddDownloadPayload,
  ProviderConnectionTestResult,
  ProviderType,
  ServerProvidersResponse,
  UnifiedDownloadQueue,
  UnifiedReleaseItem,
} from '../provider-types';

export const providerKeys = {
  all: ['server-providers'] as const,
  list: (nodeId?: number) => [...providerKeys.all, nodeId, 'list'] as const,
  search: (nodeId?: number, query?: string, provider?: string) =>
    [...providerKeys.all, nodeId, 'search', query, provider] as const,
  queue: (nodeId?: number, downloader?: string) =>
    [...providerKeys.all, nodeId, 'queue', downloader] as const,
};

export const nodeProviderKeys = providerKeys;

/** Hook to fetch all registered downloaders and search providers on the node. */
export function useNodeProviders(nodeId?: number) {
  return useQuery<ServerProvidersResponse>({
    queryKey: providerKeys.list(nodeId),
    queryFn: async () => {
      if (!nodeId) throw new Error('No node selected');
      try {
        const { data } = await apiClient.get<ServerProvidersResponse>(
          `/library/nodes/${nodeId}/providers`
        );
        return data;
      } catch {
        return {
          downloaders: [],
          searchProviders: [],
          search_providers: [],
          activeDownloader: null,
          active_downloader: null,
          activeSearchProvider: null,
          active_search_provider: null,
        } as ServerProvidersResponse;
      }
    },
    enabled: isValidNodeId(nodeId),
    staleTime: 30_000,
  });
}

export const useServerProviders = useNodeProviders;

/** Hook to test connectivity for a specific registered provider. */
export function useTestProvider(nodeId?: number) {
  return useMutation({
    mutationFn: async ({
      providerType,
      name,
    }: {
      providerType: ProviderType;
      name: string;
    }) => {
      if (!nodeId) throw new Error('No node selected');
      const { data } = await apiClient.post<ProviderConnectionTestResult>(
        `/library/nodes/${nodeId}/providers/${providerType}/${name}/test`
      );
      return data;
    },
  });
}

/** Hook to search releases across registered search providers (Prowlarr, etc). */
export function useModularSearch(
  nodeId?: number,
  query?: string,
  provider?: string
) {
  return useQuery<UnifiedReleaseItem[]>({
    queryKey: providerKeys.search(nodeId, query, provider),
    queryFn: async () => {
      if (!nodeId || !query?.trim()) return [];
      try {
        return await searchModularNodeDirect(nodeId, query, provider);
      } catch {
        return [];
      }
    },
    enabled: !!nodeId && !!query?.trim(),
    staleTime: 60_000,
  });
}

/** Hook to dispatch a release download to the target or active downloader. */
export function useAddModularDownload(nodeId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      payload,
      downloader,
    }: {
      payload: AddDownloadPayload;
      downloader?: string;
    }) => {
      if (!nodeId) throw new Error('No node selected');
      const params = downloader ? { downloader } : undefined;
      const { data } = await apiClient.post(
        `/library/nodes/${nodeId}/downloads/add`,
        payload,
        { params }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: providerKeys.all });
    },
  });
}

/** Hook to fetch live download queue with polling from the downloader. */
export function useModularDownloadQueue(
  nodeId?: number,
  downloader?: string,
  pollingIntervalMs: number = 3000
) {
  return useQuery<UnifiedDownloadQueue>({
    queryKey: providerKeys.queue(nodeId, downloader),
    queryFn: async () => {
      if (!nodeId) throw new Error('No node selected');
      const params = downloader ? { downloader } : undefined;
      const { data } = await apiClient.get<UnifiedDownloadQueue>(
        `/library/nodes/${nodeId}/downloads/queue`,
        { params }
      );
      return data;
    },
    enabled: isValidNodeId(nodeId),
    refetchInterval: pollingIntervalMs,
    staleTime: 2000,
  });
}

/** Hook to cancel a download in the queue. */
export function useCancelModularDownload(nodeId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      downloadId,
      downloader,
    }: {
      downloadId: string;
      downloader?: string;
    }) => {
      if (!nodeId) throw new Error('No node selected');
      const params = downloader ? { downloader } : undefined;
      const { data } = await apiClient.delete(
        `/library/nodes/${nodeId}/downloads/queue/${downloadId}`,
        { params }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: providerKeys.all });
    },
  });
}
