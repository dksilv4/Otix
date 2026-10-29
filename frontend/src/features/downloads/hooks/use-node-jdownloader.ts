import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type { ServerJDownloaderConfig } from '../provider-types';
import type { ConnectionTestResult } from '../usenet-types';
import { isValidNodeId } from './use-node-usenet';

export const jdownloaderKeys = {
  all: ['server-jdownloader'] as const,
  config: (nodeId?: number) => [...jdownloaderKeys.all, nodeId, 'config'] as const,
};

export const useNodeJDownloaderConfig = (nodeId?: number) => {
  return useQuery<ServerJDownloaderConfig>({
    queryKey: jdownloaderKeys.config(nodeId),
    queryFn: async () => {
      if (!isValidNodeId(nodeId)) throw new Error('No valid node selected');
      const { data } = await apiClient.get<ServerJDownloaderConfig>(
        `/library/servers/${nodeId}/jdownloader/config`
      );
      return data;
    },
    enabled: isValidNodeId(nodeId),
    retry: false,
    staleTime: 30_000,
  });
};

export const useServerJDownloaderConfig = useNodeJDownloaderConfig;

export const useSaveNodeJDownloaderConfig = (nodeId?: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<ServerJDownloaderConfig>) => {
      if (!isValidNodeId(nodeId)) throw new Error('No valid node selected');
      const { data } = await apiClient.post(
        `/library/servers/${nodeId}/jdownloader/config`,
        payload
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jdownloaderKeys.config(nodeId) });
      queryClient.invalidateQueries({ queryKey: ['server-providers'] });
    },
  });
};

export const useSaveServerJDownloaderConfig = useSaveNodeJDownloaderConfig;

export const useTestJDownloader = (nodeId?: number) => {
  return useMutation({
    mutationFn: async (payload?: {
      email?: string;
      password?: string;
      deviceName?: string;
      deviceId?: string;
      directHost?: string;
      directPort?: number;
    } | void) => {
      if (!isValidNodeId(nodeId)) throw new Error('No valid node selected');
      const { data } = await apiClient.post<ConnectionTestResult>(
        `/library/servers/${nodeId}/jdownloader/test`,
        payload || {}
      );
      return data;
    },
  });
};
