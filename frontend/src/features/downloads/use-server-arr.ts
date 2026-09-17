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
} from './arr-types';

export const arrKeys = {
  all: ['server-arr'] as const,
  radarr: {
    all: ['server-radarr'] as const,
    config: (serverId?: number) => [...arrKeys.radarr.all, serverId, 'config'] as const,
    rootFolders: (serverId?: number) => [...arrKeys.radarr.all, serverId, 'rootfolders'] as const,
    qualityProfiles: (serverId?: number) => [...arrKeys.radarr.all, serverId, 'qualityprofiles'] as const,
    movies: (serverId?: number) => [...arrKeys.radarr.all, serverId, 'movies'] as const,
    lookup: (serverId?: number, term?: string) => [...arrKeys.radarr.all, serverId, 'lookup', term] as const,
    queue: (serverId?: number) => [...arrKeys.radarr.all, serverId, 'queue'] as const,
    history: (serverId?: number) => [...arrKeys.radarr.all, serverId, 'history'] as const,
  },
  sonarr: {
    all: ['server-sonarr'] as const,
    config: (serverId?: number) => [...arrKeys.sonarr.all, serverId, 'config'] as const,
    rootFolders: (serverId?: number) => [...arrKeys.sonarr.all, serverId, 'rootfolders'] as const,
    qualityProfiles: (serverId?: number) => [...arrKeys.sonarr.all, serverId, 'qualityprofiles'] as const,
    series: (serverId?: number) => [...arrKeys.sonarr.all, serverId, 'series'] as const,
    lookup: (serverId?: number, term?: string) => [...arrKeys.sonarr.all, serverId, 'lookup', term] as const,
    queue: (serverId?: number) => [...arrKeys.sonarr.all, serverId, 'queue'] as const,
    history: (serverId?: number) => [...arrKeys.sonarr.all, serverId, 'history'] as const,
  },
};

// ── Radarr Hooks ────────────────────────────────────────────────────────

export function useServerRadarrConfig(serverId?: number) {
  return useQuery<ServerRadarrConfig>({
    queryKey: arrKeys.radarr.config(serverId),
    queryFn: async () => {
      if (!serverId) throw new Error('No server selected');
      const { data } = await apiClient.get<ServerRadarrConfig>(
        `/library/servers/${serverId}/radarr/config`
      );
      return data;
    },
    enabled: !!serverId,
    staleTime: 30_000,
  });
}

export function useSaveServerRadarrConfig(serverId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<ServerRadarrConfig>) => {
      if (!serverId) throw new Error('No server selected');
      const { data } = await apiClient.post(
        `/library/servers/${serverId}/radarr/config`,
        payload
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: arrKeys.radarr.all });
    },
  });
}

export function useTestRadarr(serverId?: number) {
  return useMutation({
    mutationFn: async (payload?: {
      host?: string;
      port?: number;
      api_key?: string;
      use_ssl?: boolean;
      url_base?: string;
      instance_id?: string;
    }) => {
      if (!serverId) throw new Error('No server selected');
      const { data } = await apiClient.post<ArrConnectionTestResult>(
        `/library/servers/${serverId}/radarr/test`,
        payload || {}
      );
      return data;
    },
  });
}

export function useServerRadarrRootFolders(
  serverId?: number,
  instanceId?: string,
  options?: { enabled?: boolean }
) {
  return useQuery<ArrRootFolder[]>({
    queryKey: [...arrKeys.radarr.rootFolders(serverId), instanceId],
    queryFn: async () => {
      if (!serverId) return [];
      const { data } = await apiClient.get<ArrRootFolder[]>(
        `/library/servers/${serverId}/radarr/rootfolders`,
        { params: instanceId ? { instance_id: instanceId } : undefined }
      );
      return data || [];
    },
    enabled: !!serverId && (options?.enabled ?? true),
    staleTime: 60_000,
  });
}

export function useServerRadarrQualityProfiles(
  serverId?: number,
  instanceId?: string,
  options?: { enabled?: boolean }
) {
  return useQuery<ArrQualityProfile[]>({
    queryKey: [...arrKeys.radarr.qualityProfiles(serverId), instanceId],
    queryFn: async () => {
      if (!serverId) return [];
      const { data } = await apiClient.get<ArrQualityProfile[]>(
        `/library/servers/${serverId}/radarr/qualityprofiles`,
        { params: instanceId ? { instance_id: instanceId } : undefined }
      );
      return data || [];
    },
    enabled: !!serverId && (options?.enabled ?? true),
    staleTime: 60_000,
  });
}

export function useServerRadarrMovies(serverId?: number) {
  return useQuery<ServerRadarrMovie[]>({
    queryKey: arrKeys.radarr.movies(serverId),
    queryFn: async () => {
      if (!serverId) return [];
      const { data } = await apiClient.get<ServerRadarrMovie[]>(
        `/library/servers/${serverId}/radarr/movies`
      );
      return data || [];
    },
    enabled: !!serverId,
    staleTime: 30_000,
  });
}

export function useServerRadarrLookup(serverId?: number, term?: string) {
  return useQuery<unknown[]>({
    queryKey: arrKeys.radarr.lookup(serverId, term),
    queryFn: async () => {
      if (!serverId || !term?.trim()) return [];
      const { data } = await apiClient.get<unknown[]>(
        `/library/servers/${serverId}/radarr/lookup`,
        { params: { term: term.trim() } }
      );
      return data || [];
    },
    enabled: !!serverId && !!term?.trim(),
    staleTime: 60_000,
  });
}

export function useAddServerRadarrMovie(serverId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: AddRadarrMoviePayload) => {
      if (!serverId) throw new Error('No server selected');
      const { data } = await apiClient.post(
        `/library/servers/${serverId}/radarr/movies`,
        payload
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: arrKeys.radarr.movies(serverId) });
      queryClient.invalidateQueries({ queryKey: arrKeys.radarr.lookup(serverId) });
      queryClient.invalidateQueries({ queryKey: arrKeys.radarr.queue(serverId) });
    },
  });
}

export function useServerRadarrQueue(serverId?: number, page: number = 1, pageSize: number = 50, pollingIntervalMs: number = 5000) {
  return useQuery<ServerArrQueueResponse>({
    queryKey: arrKeys.radarr.queue(serverId),
    queryFn: async () => {
      if (!serverId) return { page: 1, pageSize: 50, totalRecords: 0, records: [] };
      const { data } = await apiClient.get<ServerArrQueueResponse>(
        `/library/servers/${serverId}/radarr/queue`,
        { params: { page, page_size: pageSize } }
      );
      return data || { page: 1, pageSize: 50, totalRecords: 0, records: [] };
    },
    enabled: !!serverId,
    refetchInterval: pollingIntervalMs,
    staleTime: 3000,
  });
}

export function useCancelServerRadarrQueueItem(serverId?: number) {
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
      if (!serverId) throw new Error('No server selected');
      const { data } = await apiClient.delete(
        `/library/servers/${serverId}/radarr/queue/${queueId}`,
        { params: { remove_from_client: removeFromClient, blocklist } }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: arrKeys.radarr.queue(serverId) });
    },
  });
}

// ── Sonarr Hooks ────────────────────────────────────────────────────────

export function useServerSonarrConfig(serverId?: number) {
  return useQuery<ServerSonarrConfig>({
    queryKey: arrKeys.sonarr.config(serverId),
    queryFn: async () => {
      if (!serverId) throw new Error('No server selected');
      const { data } = await apiClient.get<ServerSonarrConfig>(
        `/library/servers/${serverId}/sonarr/config`
      );
      return data;
    },
    enabled: !!serverId,
    staleTime: 30_000,
  });
}

export function useSaveServerSonarrConfig(serverId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<ServerSonarrConfig>) => {
      if (!serverId) throw new Error('No server selected');
      const { data } = await apiClient.post(
        `/library/servers/${serverId}/sonarr/config`,
        payload
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: arrKeys.sonarr.all });
    },
  });
}

export function useTestSonarr(serverId?: number) {
  return useMutation({
    mutationFn: async (payload?: {
      host?: string;
      port?: number;
      api_key?: string;
      use_ssl?: boolean;
      url_base?: string;
      instance_id?: string;
    }) => {
      if (!serverId) throw new Error('No server selected');
      const { data } = await apiClient.post<ArrConnectionTestResult>(
        `/library/servers/${serverId}/sonarr/test`,
        payload || {}
      );
      return data;
    },
  });
}

export function useServerSonarrRootFolders(
  serverId?: number,
  instanceId?: string,
  options?: { enabled?: boolean }
) {
  return useQuery<ArrRootFolder[]>({
    queryKey: [...arrKeys.sonarr.rootFolders(serverId), instanceId],
    queryFn: async () => {
      if (!serverId) return [];
      const { data } = await apiClient.get<ArrRootFolder[]>(
        `/library/servers/${serverId}/sonarr/rootfolders`,
        { params: instanceId ? { instance_id: instanceId } : undefined }
      );
      return data || [];
    },
    enabled: !!serverId && (options?.enabled ?? true),
    staleTime: 60_000,
  });
}

export function useServerSonarrQualityProfiles(
  serverId?: number,
  instanceId?: string,
  options?: { enabled?: boolean }
) {
  return useQuery<ArrQualityProfile[]>({
    queryKey: [...arrKeys.sonarr.qualityProfiles(serverId), instanceId],
    queryFn: async () => {
      if (!serverId) return [];
      const { data } = await apiClient.get<ArrQualityProfile[]>(
        `/library/servers/${serverId}/sonarr/qualityprofiles`,
        { params: instanceId ? { instance_id: instanceId } : undefined }
      );
      return data || [];
    },
    enabled: !!serverId && (options?.enabled ?? true),
    staleTime: 60_000,
  });
}

export function useServerSonarrSeries(serverId?: number) {
  return useQuery<ServerSonarrSeries[]>({
    queryKey: arrKeys.sonarr.series(serverId),
    queryFn: async () => {
      if (!serverId) return [];
      const { data } = await apiClient.get<ServerSonarrSeries[]>(
        `/library/servers/${serverId}/sonarr/series`
      );
      return data || [];
    },
    enabled: !!serverId,
    staleTime: 30_000,
  });
}

export function useServerSonarrLookup(serverId?: number, term?: string) {
  return useQuery<unknown[]>({
    queryKey: arrKeys.sonarr.lookup(serverId, term),
    queryFn: async () => {
      if (!serverId || !term?.trim()) return [];
      const { data } = await apiClient.get<unknown[]>(
        `/library/servers/${serverId}/sonarr/lookup`,
        { params: { term: term.trim() } }
      );
      return data || [];
    },
    enabled: !!serverId && !!term?.trim(),
    staleTime: 60_000,
  });
}

export function useAddServerSonarrSeries(serverId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: AddSonarrSeriesPayload) => {
      if (!serverId) throw new Error('No server selected');
      const { data } = await apiClient.post(
        `/library/servers/${serverId}/sonarr/series`,
        payload
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: arrKeys.sonarr.series(serverId) });
      queryClient.invalidateQueries({ queryKey: arrKeys.sonarr.lookup(serverId) });
      queryClient.invalidateQueries({ queryKey: arrKeys.sonarr.queue(serverId) });
    },
  });
}

export function useServerSonarrQueue(serverId?: number, page: number = 1, pageSize: number = 50, pollingIntervalMs: number = 5000) {
  return useQuery<ServerArrQueueResponse>({
    queryKey: arrKeys.sonarr.queue(serverId),
    queryFn: async () => {
      if (!serverId) return { page: 1, pageSize: 50, totalRecords: 0, records: [] };
      const { data } = await apiClient.get<ServerArrQueueResponse>(
        `/library/servers/${serverId}/sonarr/queue`,
        { params: { page, page_size: pageSize } }
      );
      return data || { page: 1, pageSize: 50, totalRecords: 0, records: [] };
    },
    enabled: !!serverId,
    refetchInterval: pollingIntervalMs,
    staleTime: 3000,
  });
}

export function useCancelServerSonarrQueueItem(serverId?: number) {
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
      if (!serverId) throw new Error('No server selected');
      const { data } = await apiClient.delete(
        `/library/servers/${serverId}/sonarr/queue/${queueId}`,
        { params: { remove_from_client: removeFromClient, blocklist } }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: arrKeys.sonarr.queue(serverId) });
    },
  });
}
