import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { nodeKeys } from './use-node-downloads';
import { normalizeExplorerBrowse } from '../node-explorer-utils';
import type {
  CreateNodeFolderPayload,
  NodeExplorerBrowseResult,
  SetNodeDownloadPathPayload,
} from '../node-explorer-types';

export const nodeExplorerKeys = {
  all: ['server-explorer'] as const,
  browse: (nodeId?: number, path?: string) =>
    [...nodeExplorerKeys.all, nodeId, path ?? 'root'] as const,
};

export const explorerKeys = nodeExplorerKeys;

/** Hook to browse node filesystem on a connected node. */
export function useNodeExplorer(nodeId?: number, path?: string) {
  return useQuery<NodeExplorerBrowseResult>({
    queryKey: nodeExplorerKeys.browse(nodeId, path),
    queryFn: async () => {
      if (!nodeId) {
        throw new Error('No node selected');
      }
      const params = path ? { path } : undefined;
      const { data } = await apiClient.get<NodeExplorerBrowseResult>(
        `/library/servers/${nodeId}/explorer`,
        { params },
      );
      return normalizeExplorerBrowse(data);
    },
    enabled: !!nodeId,
    staleTime: 10_000,
  });
}

export const useServerExplorer = useNodeExplorer;

/** Hook to assign a folder as the primary download location on the node. */
export function useSetNodeDownloadPath(nodeId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SetNodeDownloadPathPayload) => {
      if (!nodeId) throw new Error('No node selected');
      const { data } = await apiClient.post(
        `/library/servers/${nodeId}/explorer/set-download-path`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      // Invalidate explorer cache and node list/games
      queryClient.invalidateQueries({ queryKey: nodeExplorerKeys.all });
      queryClient.invalidateQueries({ queryKey: nodeKeys.all });
    },
  });
}

export const useSetServerDownloadPath = useSetNodeDownloadPath;

/** Hook to create a subfolder on the node storage. */
export function useCreateNodeFolder(nodeId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateNodeFolderPayload) => {
      if (!nodeId) throw new Error('No node selected');
      const { data } = await apiClient.post(
        `/library/servers/${nodeId}/explorer/create-folder`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nodeExplorerKeys.all });
    },
  });
}

export const useCreateServerFolder = useCreateNodeFolder;
