import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { serverKeys } from './use-server-downloads';
import { normalizeExplorerBrowse } from './server-explorer-utils';
import type {
  CreateServerFolderPayload,
  ServerExplorerBrowseResult,
  SetServerDownloadPathPayload,
} from './server-explorer-types';

export const explorerKeys = {
  all: ['server-explorer'] as const,
  browse: (serverId?: number, path?: string) =>
    [...explorerKeys.all, serverId, path ?? 'root'] as const,
};

/** Hook to browse server filesystem on a connected otix-server node. */
export function useServerExplorer(serverId?: number, path?: string) {
  return useQuery<ServerExplorerBrowseResult>({
    queryKey: explorerKeys.browse(serverId, path),
    queryFn: async () => {
      if (!serverId) {
        throw new Error('No server selected');
      }
      const params = path ? { path } : undefined;
      const { data } = await apiClient.get<ServerExplorerBrowseResult>(
        `/library/servers/${serverId}/explorer`,
        { params },
      );
      return normalizeExplorerBrowse(data);
    },
    enabled: !!serverId,
    staleTime: 10_000,
  });
}

/** Hook to assign a folder as the primary download location on the server node. */
export function useSetServerDownloadPath(serverId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SetServerDownloadPathPayload) => {
      if (!serverId) throw new Error('No server selected');
      const { data } = await apiClient.post(
        `/library/servers/${serverId}/explorer/set-download-path`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      // Invalidate explorer cache and server list/games
      queryClient.invalidateQueries({ queryKey: explorerKeys.all });
      queryClient.invalidateQueries({ queryKey: serverKeys.all });
    },
  });
}

/** Hook to create a subfolder on the server storage. */
export function useCreateServerFolder(serverId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateServerFolderPayload) => {
      if (!serverId) throw new Error('No server selected');
      const { data } = await apiClient.post(
        `/library/servers/${serverId}/explorer/create-folder`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: explorerKeys.all });
    },
  });
}
