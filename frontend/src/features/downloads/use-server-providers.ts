/** React Query hooks for the Unified Modular Provider Framework (Downloaders & Search Providers). */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type {
  AddDownloadPayload,
  ProviderConnectionTestResult,
  ProviderType,
  ServerProvidersResponse,
  UnifiedDownloadQueue,
  UnifiedReleaseItem,
} from './provider-types';

export const providerKeys = {
  all: ['server-providers'] as const,
  list: (serverId?: number) => [...providerKeys.all, serverId, 'list'] as const,
  search: (serverId?: number, query?: string, provider?: string) =>
    [...providerKeys.all, serverId, 'search', query, provider] as const,
  queue: (serverId?: number, downloader?: string) =>
    [...providerKeys.all, serverId, 'queue', downloader] as const,
};

/** Hook to fetch all registered downloaders and search providers on the game server node. */
export function useServerProviders(serverId?: number) {
  return useQuery<ServerProvidersResponse>({
    queryKey: providerKeys.list(serverId),
    queryFn: async () => {
      if (!serverId) throw new Error('No server selected');
      const { data } = await apiClient.get<ServerProvidersResponse>(
        `/library/servers/${serverId}/providers`
      );
      return data;
    },
    enabled: !!serverId,
    staleTime: 30_000,
  });
}

/** Hook to test connectivity for a specific registered provider. */
export function useTestProvider(serverId?: number) {
  return useMutation({
    mutationFn: async ({
      providerType,
      name,
    }: {
      providerType: ProviderType;
      name: string;
    }) => {
      if (!serverId) throw new Error('No server selected');
      const { data } = await apiClient.post<ProviderConnectionTestResult>(
        `/library/servers/${serverId}/providers/${providerType}/${name}/test`
      );
      return data;
    },
  });
}

/** Hook to search releases across registered search providers (Prowlarr, etc). */
export function useModularSearch(
  serverId?: number,
  query?: string,
  provider?: string
) {
  return useQuery<UnifiedReleaseItem[]>({
    queryKey: providerKeys.search(serverId, query, provider),
    queryFn: async () => {
      if (!serverId || !query?.trim()) return [];
      const params: Record<string, string> = { query: query.trim() };
      if (provider) {
        params.provider = provider;
      }
      const { data } = await apiClient.get<UnifiedReleaseItem[]>(
        `/library/servers/${serverId}/downloads/search`,
        { params }
      );
      return data || [];
    },
    enabled: !!serverId && !!query?.trim(),
    staleTime: 60_000,
  });
}

/** Hook to dispatch a release download to the target or active downloader. */
export function useAddModularDownload(serverId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      payload,
      downloader,
    }: {
      payload: AddDownloadPayload;
      downloader?: string;
    }) => {
      if (!serverId) throw new Error('No server selected');
      const params = downloader ? { downloader } : undefined;
      const { data } = await apiClient.post(
        `/library/servers/${serverId}/downloads/add`,
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
  serverId?: number,
  downloader?: string,
  pollingIntervalMs: number = 3000
) {
  return useQuery<UnifiedDownloadQueue>({
    queryKey: providerKeys.queue(serverId, downloader),
    queryFn: async () => {
      if (!serverId) throw new Error('No server selected');
      const params = downloader ? { downloader } : undefined;
      const { data } = await apiClient.get<UnifiedDownloadQueue>(
        `/library/servers/${serverId}/downloads/queue`,
        { params }
      );
      return data;
    },
    enabled: !!serverId,
    refetchInterval: pollingIntervalMs,
    staleTime: 2000,
  });
}

/** Hook to cancel a download in the queue. */
export function useCancelModularDownload(serverId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      downloadId,
      downloader,
    }: {
      downloadId: string;
      downloader?: string;
    }) => {
      if (!serverId) throw new Error('No server selected');
      const params = downloader ? { downloader } : undefined;
      const { data } = await apiClient.delete(
        `/library/servers/${serverId}/downloads/queue/${downloadId}`,
        { params }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: providerKeys.all });
    },
  });
}
