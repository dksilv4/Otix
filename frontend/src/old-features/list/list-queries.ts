// TODO: Review this file
import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
} from "@tanstack/react-query"
import { apiClient } from "@/lib/api/client"
import { emitOtixEvent } from "@/lib/plugin-events"
import { listKeys } from "./list-keys"

// ── Types ──────────────────────────────────────────────

export interface UserListOut {
  id: string
  userId: string
  name: string
  description: string | null
  isPublic: boolean
  likeCount: number
  isLiked: boolean
  createdAt: string
  updatedAt: string
}

export interface CollaboratorOut {
  id: string
  userId: string
  permission: string
  status: string
  createdAt: string
  user?: {
    id: string
    username: string
    avatarUrl: string | null
  } | null
}

export interface UserListDetailOut extends UserListOut {
  items: Array<{
    id: string
    mediaType: string
    title: string
    slug: string
    posterUrl: string | null
    textlessPosterUrl: string | null
    logoUrl: string | null
    releaseDate: string | null
    popularity: number
    likeCount: number
    watchlistCount: number
    watchedCount: number
    playedCount: number
    userInteractions?: {
      liked: boolean
      watchlisted: boolean
      watched: boolean
      played: boolean
    } | null
    isAdult?: boolean
    albumArtistName?: string | null
  }>
  collaborators: CollaboratorOut[]
}

export interface UserListCreate {
  name: string
  description?: string | null
  isPublic?: boolean
}

export interface UserListUpdate {
  name?: string | null
  description?: string | null
  isPublic?: boolean | null
}

export interface ListLikeStatus {
  likeCount: number
  isLiked: boolean
}

export interface RankHistoryOut {
  id: string
  mediaItemId: string
  userId: string | null
  oldSortOrder: number
  newSortOrder: number
  changedAt: string
  mediaItem?: {
    id: string
    mediaType: string
    title: string
    posterUrl: string | null
  } | null
}

// ── Queries ────────────────────────────────────────────

export function useUserLists() {
  return useQuery({
    queryKey: listKeys.mine(),
    queryFn: async () => {
      const { data } = await apiClient.get<UserListOut[]>("/list/mine")
      return data
    },
    staleTime: 1000 * 60 * 2,
  })
}

export function usePublicLists() {
  return useInfiniteQuery({
    queryKey: listKeys.public(),
    queryFn: async ({ pageParam }: { pageParam: string | null }) => {
      const params: Record<string, string> = { limit: "24" }
      if (pageParam) params.cursor = pageParam
      const { data } = await apiClient.get<UserListOut[]>("/list", { params })
      return { items: data, nextCursor: null as string | null, hasMore: false }
    },
    initialPageParam: null as string | null,
    getNextPageParam: () => undefined,
    staleTime: 1000 * 60 * 2,
  })
}

export function useListDetail(listId: string) {
  return useQuery({
    queryKey: listKeys.detail(listId),
    queryFn: async () => {
      const { data } = await apiClient.get<UserListDetailOut>("/list/" + listId)
      return data
    },
    enabled: !!listId,
    staleTime: 1000 * 60 * 2,
  })
}

// ── Mutations ──────────────────────────────────────────

export function useCreateList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: UserListCreate) => {
      const { data } = await apiClient.post<UserListOut>("/list", body)
      return data
    },
    onSuccess: (data) => {
      emitOtixEvent("otix:list:created", {
        list: { id: data.id, name: data.name, isPublic: data.isPublic },
      })
      qc.invalidateQueries({ queryKey: listKeys.mine() })
      qc.invalidateQueries({ queryKey: listKeys.public() })
    },
  })
}

export function useUpdateList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      listId,
      ...body
    }: UserListUpdate & { listId: string }) => {
      const { data } = await apiClient.patch<UserListOut>(
        "/list/" + listId,
        body
      )
      return data
    },
    onSuccess: (_data, vars) => {
      emitOtixEvent("otix:list:updated", {
        listId: vars.listId,
        list: { name: vars.name, isPublic: vars.isPublic },
      })
      qc.invalidateQueries({ queryKey: listKeys.detail(vars.listId) })
      qc.invalidateQueries({ queryKey: listKeys.mine() })
    },
  })
}

export function useDeleteList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (listId: string) => {
      await apiClient.delete("/list/" + listId)
    },
    onSuccess: (_data, listId) => {
      emitOtixEvent("otix:list:deleted", { listId })
      qc.invalidateQueries({ queryKey: listKeys.mine() })
      qc.invalidateQueries({ queryKey: listKeys.public() })
    },
  })
}

export function useAddToList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      listId,
      mediaItemId,
    }: {
      listId: string
      mediaItemId: string
      mediaType?: string
    }) => {
      const { data } = await apiClient.post<UserListOut>(
        "/list/" + listId + "/item",
        { mediaItemId }
      )
      return data
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: listKeys.detail(vars.listId) })
      qc.invalidateQueries({ queryKey: listKeys.mine() })
      emitOtixEvent("otix:list:item_added", {
        listId: vars.listId,
        item: { mediaItemId: vars.mediaItemId, mediaType: vars.mediaType },
      })
    },
  })
}

export function useRemoveFromList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      listId,
      mediaItemId,
    }: {
      listId: string
      mediaItemId: string
      mediaType?: string
    }) => {
      await apiClient.delete("/list/" + listId + "/item/" + mediaItemId)
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: listKeys.detail(vars.listId) })
      qc.invalidateQueries({ queryKey: listKeys.mine() })
      emitOtixEvent("otix:list:item_removed", {
        listId: vars.listId,
        item: { mediaItemId: vars.mediaItemId, mediaType: vars.mediaType },
      })
    },
  })
}

export function useReorderList(listId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (mediaItemIds: string[]) => {
      await apiClient.put("/list/" + listId + "/item", { mediaItemIds })
    },
    onMutate: async (mediaItemIds) => {
      await qc.cancelQueries({ queryKey: listKeys.detail(listId) })
      const previous = qc.getQueryData<UserListDetailOut>(
        listKeys.detail(listId)
      )
      if (previous) {
        const ordered = mediaItemIds
          .map((id) => previous.items.find((i) => i.id === id))
          .filter(Boolean) as UserListDetailOut["items"]
        qc.setQueryData<UserListDetailOut>(listKeys.detail(listId), {
          ...previous,
          items: ordered,
        })
      }
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(listKeys.detail(listId), context.previous)
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: listKeys.detail(listId) })
    },
  })
}

// ── Likes ─────────────────────────────────────────────────────

export function useLikeList(listId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<ListLikeStatus>("/list/" + listId + "/like")
      return data
    },
    onSuccess: () => {
      emitOtixEvent("otix:list:liked", { listId })
      qc.invalidateQueries({ queryKey: listKeys.detail(listId) })
      qc.invalidateQueries({ queryKey: listKeys.public() })
    },
  })
}

export function useUnlikeList(listId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.delete<ListLikeStatus>("/list/" + listId + "/like")
      return data
    },
    onSuccess: () => {
      emitOtixEvent("otix:list:unliked", { listId })
      qc.invalidateQueries({ queryKey: listKeys.detail(listId) })
      qc.invalidateQueries({ queryKey: listKeys.public() })
    },
  })
}

// ── Collaborators ─────────────────────────────────────────────

export function useInviteCollaborator(listId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, permission }: { userId: string; permission: string }) => {
      const { data } = await apiClient.post<CollaboratorOut>(
        "/list/" + listId + "/collaborators",
        { userId, permission },
      )
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKeys.detail(listId) })
    },
  })
}

export function useRemoveCollaborator(listId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (userId: string) => {
      await apiClient.delete("/list/" + listId + "/collaborators/" + userId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKeys.detail(listId) })
    },
  })
}

export function useAcceptInvitation(listId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await apiClient.post("/list/" + listId + "/collaborators/accept")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKeys.detail(listId) })
      qc.invalidateQueries({ queryKey: listKeys.mine() })
    },
  })
}

export function useDeclineInvitation(listId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await apiClient.post("/list/" + listId + "/collaborators/decline")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKeys.detail(listId) })
      qc.invalidateQueries({ queryKey: listKeys.mine() })
    },
  })
}

// ── Rank history ──────────────────────────────────────────────

export function useRankHistory(listId: string) {
  return useQuery({
    queryKey: [...listKeys.detail(listId), "history"],
    queryFn: async () => {
      const { data } = await apiClient.get<RankHistoryOut[]>(
        "/list/" + listId + "/history",
      )
      return data
    },
    enabled: !!listId,
  })
}

// ── Export ────────────────────────────────────────────────────

export function getExportUrl(listId: string, format: "json" | "csv" = "json"): string {
  return "/api/list/" + listId + "/export?format=" + format
}
