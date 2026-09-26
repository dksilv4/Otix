import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type {
  AddRadarrMoviePayload,
  AddSonarrSeriesPayload,
  ArrConnectionTestResult,
  ArrQualityProfile,
  ArrRootFolder,
  ServerArrQueueResponse,
  ServerRadarrConfig,
  ServerRadarrMovie,
  ServerSonarrConfig,
  ServerSonarrSeries,
} from '../arr-types';

export const arrKeys = {
  all: ['server-arr'] as const,
  radarr: {
    all: ['server-radarr'] as const,
    config: (nodeId?: number) => [...arrKeys.radarr.all, nodeId, 'config'] as const,
    rootFolders: (nodeId?: number) => [...arrKeys.radarr.all, nodeId, 'rootfolders'] as const,
    qualityProfiles: (nodeId?: number) => [...arrKeys.radarr.all, nodeId, 'qualityprofiles'] as const,
    movies: (nodeId?: number) => [...arrKeys.radarr.all, nodeId, 'movies'] as const,
    lookup: (nodeId?: number, term?: string) => [...arrKeys.radarr.all, nodeId, 'lookup', term] as const,
    queue: (nodeId?: number) => [...arrKeys.radarr.all, nodeId, 'queue'] as const,
    history: (nodeId?: number) => [...arrKeys.radarr.all, nodeId, 'history'] as const,
  },
  sonarr: {
    all: ['server-sonarr'] as const,
    config: (nodeId?: number) => [...arrKeys.sonarr.all, nodeId, 'config'] as const,
    rootFolders: (nodeId?: number) => [...arrKeys.sonarr.all, nodeId, 'rootfolders'] as const,
    qualityProfiles: (nodeId?: number) => [...arrKeys.sonarr.all, nodeId, 'qualityprofiles'] as const,
    series: (nodeId?: number) => [...arrKeys.sonarr.all, nodeId, 'series'] as const,
    lookup: (nodeId?: number, term?: string) => [...arrKeys.sonarr.all, nodeId, 'lookup', term] as const,
    queue: (nodeId?: number) => [...arrKeys.sonarr.all, nodeId, 'queue'] as const,
    history: (nodeId?: number) => [...arrKeys.sonarr.all, nodeId, 'history'] as const,
  },
};

export const nodeArrKeys = arrKeys;

// ── Radarr Hooks ────────────────────────────────────────────────────────

export function useNodeRadarrConfig(nodeId?: number) {
  return useQuery<ServerRadarrConfig>({
    queryKey: arrKeys.radarr.config(nodeId),
    queryFn: async () => {
      if (!nodeId) throw new Error('No node selected');
      const { data } = await apiClient.get<ServerRadarrConfig>(
        `/library/servers/${nodeId}/radarr/config`
      );
      return data;
    },
    enabled: !!nodeId,
    staleTime: 30_000,
    meta: { suppressToast: true },
  });
}

export const useServerRadarrConfig = useNodeRadarrConfig;

export function useSaveNodeRadarrConfig(nodeId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<ServerRadarrConfig>) => {
      if (!nodeId) throw new Error('No node selected');
      const { data } = await apiClient.post(
        `/library/servers/${nodeId}/radarr/config`,
        payload
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: arrKeys.radarr.all });
    },
  });
}

export const useSaveServerRadarrConfig = useSaveNodeRadarrConfig;

export function useTestRadarr(nodeId?: number) {
  return useMutation({
    mutationFn: async (payload?: {
      host?: string;
      port?: number;
      api_key?: string;
      use_ssl?: boolean;
      url_base?: string;
      instance_id?: string;
    }) => {
      if (!nodeId) throw new Error('No node selected');
      const { data } = await apiClient.post<ArrConnectionTestResult>(
        `/library/servers/${nodeId}/radarr/test`,
        payload || {}
      );
      return data;
    },
  });
}

export function useNodeRadarrRootFolders(
  nodeId?: number,
  instanceId?: string,
  options?: { enabled?: boolean }
) {
  return useQuery<ArrRootFolder[]>({
    queryKey: [...arrKeys.radarr.rootFolders(nodeId), instanceId],
    queryFn: async () => {
      if (!nodeId) return [];
      const { data } = await apiClient.get<ArrRootFolder[]>(
        `/library/servers/${nodeId}/radarr/rootfolders`,
        { params: instanceId ? { instance_id: instanceId } : undefined }
      );
      return data || [];
    },
    enabled: !!nodeId && (options?.enabled ?? true),
    staleTime: 60_000,
  });
}

export const useServerRadarrRootFolders = useNodeRadarrRootFolders;

export function useNodeRadarrQualityProfiles(
  nodeId?: number,
  instanceId?: string,
  options?: { enabled?: boolean }
) {
  return useQuery<ArrQualityProfile[]>({
    queryKey: [...arrKeys.radarr.qualityProfiles(nodeId), instanceId],
    queryFn: async () => {
      if (!nodeId) return [];
      const { data } = await apiClient.get<ArrQualityProfile[]>(
        `/library/servers/${nodeId}/radarr/qualityprofiles`,
        { params: instanceId ? { instance_id: instanceId } : undefined }
      );
      return data || [];
    },
    enabled: !!nodeId && (options?.enabled ?? true),
    staleTime: 60_000,
  });
}

export const useServerRadarrQualityProfiles = useNodeRadarrQualityProfiles;

export function useNodeRadarrMovies(nodeId?: number) {
  return useQuery<ServerRadarrMovie[]>({
    queryKey: arrKeys.radarr.movies(nodeId),
    queryFn: async () => {
      if (!nodeId) return [];
      const { data } = await apiClient.get<ServerRadarrMovie[]>(
        `/library/servers/${nodeId}/radarr/movies`
      );
      return data || [];
    },
    enabled: !!nodeId,
    staleTime: 30_000,
  });
}

export const useServerRadarrMovies = useNodeRadarrMovies;

export function useNodeRadarrLookup(nodeId?: number, term?: string) {
  return useQuery<unknown[]>({
    queryKey: arrKeys.radarr.lookup(nodeId, term),
    queryFn: async () => {
      if (!nodeId || !term?.trim()) return [];
      const { data } = await apiClient.get<unknown[]>(
        `/library/servers/${nodeId}/radarr/lookup`,
        { params: { term: term.trim() } }
      );
      return data || [];
    },
    enabled: !!nodeId && !!term?.trim(),
    staleTime: 60_000,
  });
}

export const useServerRadarrLookup = useNodeRadarrLookup;

export function useAddNodeRadarrMovie(nodeId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: AddRadarrMoviePayload) => {
      if (!nodeId) throw new Error('No node selected');
      const { data } = await apiClient.post(
        `/library/servers/${nodeId}/radarr/movies`,
        payload
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: arrKeys.radarr.movies(nodeId) });
      queryClient.invalidateQueries({ queryKey: arrKeys.radarr.lookup(nodeId) });
      queryClient.invalidateQueries({ queryKey: arrKeys.radarr.queue(nodeId) });
    },
  });
}

export const useAddServerRadarrMovie = useAddNodeRadarrMovie;

export function useNodeRadarrQueue(nodeId?: number, page: number = 1, pageSize: number = 50, pollingIntervalMs: number | false = 5000) {
  return useQuery<ServerArrQueueResponse>({
    queryKey: arrKeys.radarr.queue(nodeId),
    queryFn: async () => {
      if (!nodeId) return { page: 1, pageSize: 50, totalRecords: 0, records: [] };
      const { data } = await apiClient.get<ServerArrQueueResponse>(
        `/library/servers/${nodeId}/radarr/queue`,
        { params: { page, page_size: pageSize } }
      );
      return data || { page: 1, pageSize: 50, totalRecords: 0, records: [] };
    },
    enabled: !!nodeId,
    refetchInterval: pollingIntervalMs,
    staleTime: 3000,
    meta: { suppressToast: true },
  });
}

export const useServerRadarrQueue = useNodeRadarrQueue;

export function useCancelNodeRadarrQueueItem(nodeId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      queueId,
      removeFromClient = true,
      blocklist = false,
    }: {
      queueId: string | number;
      removeFromClient?: boolean;
      blocklist?: boolean;
    }) => {
      if (!nodeId) throw new Error('No node selected');
      const { data } = await apiClient.delete(
        `/library/servers/${nodeId}/radarr/queue/${queueId}`,
        { params: { remove_from_client: removeFromClient, blocklist } }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: arrKeys.radarr.queue(nodeId) });
    },
  });
}

export const useCancelServerRadarrQueueItem = useCancelNodeRadarrQueueItem;

// ── Sonarr Hooks ────────────────────────────────────────────────────────

export function useNodeSonarrConfig(nodeId?: number) {
  return useQuery<ServerSonarrConfig>({
    queryKey: arrKeys.sonarr.config(nodeId),
    queryFn: async () => {
      if (!nodeId) throw new Error('No node selected');
      const { data } = await apiClient.get<ServerSonarrConfig>(
        `/library/servers/${nodeId}/sonarr/config`
      );
      return data;
    },
    enabled: !!nodeId,
    staleTime: 30_000,
    meta: { suppressToast: true },
  });
}

export const useServerSonarrConfig = useNodeSonarrConfig;

export function useSaveNodeSonarrConfig(nodeId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<ServerSonarrConfig>) => {
      if (!nodeId) throw new Error('No node selected');
      const { data } = await apiClient.post(
        `/library/servers/${nodeId}/sonarr/config`,
        payload
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: arrKeys.sonarr.all });
    },
  });
}

export const useSaveServerSonarrConfig = useSaveNodeSonarrConfig;

export function useTestSonarr(nodeId?: number) {
  return useMutation({
    mutationFn: async (payload?: {
      host?: string;
      port?: number;
      api_key?: string;
      use_ssl?: boolean;
      url_base?: string;
      instance_id?: string;
    }) => {
      if (!nodeId) throw new Error('No node selected');
      const { data } = await apiClient.post<ArrConnectionTestResult>(
        `/library/servers/${nodeId}/sonarr/test`,
        payload || {}
      );
      return data;
    },
  });
}

export function useNodeSonarrRootFolders(
  nodeId?: number,
  instanceId?: string,
  options?: { enabled?: boolean }
) {
  return useQuery<ArrRootFolder[]>({
    queryKey: [...arrKeys.sonarr.rootFolders(nodeId), instanceId],
    queryFn: async () => {
      if (!nodeId) return [];
      const { data } = await apiClient.get<ArrRootFolder[]>(
        `/library/servers/${nodeId}/sonarr/rootfolders`,
        { params: instanceId ? { instance_id: instanceId } : undefined }
      );
      return data || [];
    },
    enabled: !!nodeId && (options?.enabled ?? true),
    staleTime: 60_000,
  });
}

export const useServerSonarrRootFolders = useNodeSonarrRootFolders;

export function useNodeSonarrQualityProfiles(
  nodeId?: number,
  instanceId?: string,
  options?: { enabled?: boolean }
) {
  return useQuery<ArrQualityProfile[]>({
    queryKey: [...arrKeys.sonarr.qualityProfiles(nodeId), instanceId],
    queryFn: async () => {
      if (!nodeId) return [];
      const { data } = await apiClient.get<ArrQualityProfile[]>(
        `/library/servers/${nodeId}/sonarr/qualityprofiles`,
        { params: instanceId ? { instance_id: instanceId } : undefined }
      );
      return data || [];
    },
    enabled: !!nodeId && (options?.enabled ?? true),
    staleTime: 60_000,
  });
}

export const useServerSonarrQualityProfiles = useNodeSonarrQualityProfiles;

export function useNodeSonarrSeries(nodeId?: number) {
  return useQuery<ServerSonarrSeries[]>({
    queryKey: arrKeys.sonarr.series(nodeId),
    queryFn: async () => {
      if (!nodeId) return [];
      const { data } = await apiClient.get<ServerSonarrSeries[]>(
        `/library/servers/${nodeId}/sonarr/series`
      );
      return data || [];
    },
    enabled: !!nodeId,
    staleTime: 30_000,
  });
}

export const useServerSonarrSeries = useNodeSonarrSeries;

export function useNodeSonarrLookup(nodeId?: number, term?: string) {
  return useQuery<unknown[]>({
    queryKey: arrKeys.sonarr.lookup(nodeId, term),
    queryFn: async () => {
      if (!nodeId || !term?.trim()) return [];
      const { data } = await apiClient.get<unknown[]>(
        `/library/servers/${nodeId}/sonarr/lookup`,
        { params: { term: term.trim() } }
      );
      return data || [];
    },
    enabled: !!nodeId && !!term?.trim(),
    staleTime: 60_000,
  });
}

export const useServerSonarrLookup = useNodeSonarrLookup;

export function useAddNodeSonarrSeries(nodeId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: AddSonarrSeriesPayload) => {
      if (!nodeId) throw new Error('No node selected');
      const { data } = await apiClient.post(
        `/library/servers/${nodeId}/sonarr/series`,
        payload
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: arrKeys.sonarr.series(nodeId) });
      queryClient.invalidateQueries({ queryKey: arrKeys.sonarr.lookup(nodeId) });
      queryClient.invalidateQueries({ queryKey: arrKeys.sonarr.queue(nodeId) });
    },
  });
}

export const useAddServerSonarrSeries = useAddNodeSonarrSeries;

export function useNodeSonarrQueue(nodeId?: number, page: number = 1, pageSize: number = 50, pollingIntervalMs: number | false = 5000) {
  return useQuery<ServerArrQueueResponse>({
    queryKey: arrKeys.sonarr.queue(nodeId),
    queryFn: async () => {
      if (!nodeId) return { page: 1, pageSize: 50, totalRecords: 0, records: [] };
      const { data } = await apiClient.get<ServerArrQueueResponse>(
        `/library/servers/${nodeId}/sonarr/queue`,
        { params: { page, page_size: pageSize } }
      );
      return data || { page: 1, pageSize: 50, totalRecords: 0, records: [] };
    },
    enabled: !!nodeId,
    refetchInterval: pollingIntervalMs,
    staleTime: 3000,
    meta: { suppressToast: true },
  });
}

export const useServerSonarrQueue = useNodeSonarrQueue;

export function useCancelNodeSonarrQueueItem(nodeId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      queueId,
      removeFromClient = true,
      blocklist = false,
    }: {
      queueId: string | number;
      removeFromClient?: boolean;
      blocklist?: boolean;
    }) => {
      if (!nodeId) throw new Error('No node selected');
      const { data } = await apiClient.delete(
        `/library/servers/${nodeId}/sonarr/queue/${queueId}`,
        { params: { remove_from_client: removeFromClient, blocklist } }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: arrKeys.sonarr.queue(nodeId) });
    },
  });
}

export const useCancelServerSonarrQueueItem = useCancelNodeSonarrQueueItem;
