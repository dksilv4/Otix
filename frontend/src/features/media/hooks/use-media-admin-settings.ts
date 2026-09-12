import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'

export const mediaAdminQueryKeys = {
  mirroring: ['media', 'admin', 'mirroring'] as const,
  storage: ['media', 'admin', 'storage'] as const,
  artworkSettings: ['media', 'admin', 'artwork-settings'] as const,
}

export interface MirroringState {
  enabled: boolean
}

export interface DiskState {
  total: number
  used: number
  free: number
  tripped: boolean
}

/** Locally mirrored artwork usage + max-storage budget (mirror_max_gb). */
export interface MirrorUsage {
  count: number
  bytes: number
  /** Total-artwork budget in GB; 0 means unlimited. */
  maxGb: number
  overBudget: boolean
}

export interface ArtworkSettings {
  fetchEnabled: boolean
  discoverEnabled: boolean
  localGamesEnabled: boolean
  sweepLimit: number
  sweepIntervalMinutes: number
  /** Which of poster/backdrop/logo/textless_poster/icon get auto-mirrored. */
  assetTypes: string[]
  /** Disk safety cap in GB; <=0 disables the check. */
  minFreeGb: number
  mirrored: MirrorUsage
  disk: DiskState
}

export const ASSET_TYPE_OPTIONS = [
  { value: 'poster', label: 'Poster' },
  { value: 'backdrop', label: 'Backdrop' },
  { value: 'logo', label: 'Logo' },
  { value: 'textless_poster', label: 'Textless poster' },
  { value: 'icon', label: 'Icon' },
] as const

export interface PurgeResult {
  deleted: number
  bytesFreed: number
}

/** Server-wide local-artwork mirroring flag (GET /media/admin/mirroring). */
export function useMirroring(enabled = true) {
  return useQuery<MirroringState>({
    queryKey: mediaAdminQueryKeys.mirroring,
    queryFn: async () => {
      const { data } = await apiClient.get<MirroringState>('/media/admin/mirroring')
      return data
    },
    staleTime: 30_000,
    enabled,
  })
}

/** Flip the server-wide mirroring flag (PUT /media/admin/mirroring). */
export function useSetMirroring() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const { data } = await apiClient.put<MirroringState>('/media/admin/mirroring', { enabled })
      return data
    },
    onSuccess: (state) => {
      queryClient.setQueryData(mediaAdminQueryKeys.mirroring, state)
    },
  })
}

/** Auto-mirror sub-settings + disk state (GET /media/admin/artwork-settings). */
export function useArtworkSettings(enabled = true) {
  return useQuery<ArtworkSettings>({
    queryKey: mediaAdminQueryKeys.artworkSettings,
    queryFn: async () => {
      const { data } = await apiClient.get<ArtworkSettings>(
        '/media/admin/artwork-settings',
      )
      return data
    },
    staleTime: 30_000,
    enabled,
  })
}

export type ArtworkSettingsPatch = Partial<
  Pick<
    ArtworkSettings,
    | 'fetchEnabled'
    | 'discoverEnabled'
    | 'localGamesEnabled'
    | 'sweepLimit'
    | 'sweepIntervalMinutes'
    | 'assetTypes'
    | 'minFreeGb'
  >
> & { maxGb?: number }

/** Update a subset of the auto-mirror sub-settings (PUT /media/admin/artwork-settings). */
export function useSetArtworkSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (patch: ArtworkSettingsPatch) => {
      const { data } = await apiClient.put<ArtworkSettings>(
        '/media/admin/artwork-settings',
        patch,
      )
      return data
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(mediaAdminQueryKeys.artworkSettings, settings)
    },
  })
}

/** Delete every locally mirrored artwork file (DELETE /media/admin/assets). */
export function usePurgeAssets() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.delete<PurgeResult>('/media/admin/assets')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaAdminQueryKeys.storage })
      queryClient.invalidateQueries({ queryKey: ['media'] })
      queryClient.invalidateQueries({ queryKey: ['discover'] })
    },
  })
}
