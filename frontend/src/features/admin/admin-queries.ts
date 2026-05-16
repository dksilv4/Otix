import { useQuery } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"

interface AdminRecentUser {
  id: string
  username: string
  email: string
  createdAt: string
}

export interface AdminStats {
  totalUsers: number
  mediaCounts: Record<string, number>
  stubCounts: { total: number }
  peopleCount: number
  recentUsers: AdminRecentUser[]
}

export const REFETCH_INTERVAL = 15_000

export function useAdminStats() {
  return useQuery({
    queryKey: ["admin", "stats"],
    queryFn: async () => {
      const { data } = await apiClient.get<AdminStats>("/admin/stats")
      return data
    },
    staleTime: 10_000,
    refetchInterval: REFETCH_INTERVAL,
  })
}

export interface MetricPoint {
  label: string
  value: number
}

export interface AdminMetrics {
  metric: string
  hours: number
  data: MetricPoint[]
}

export function useAdminMetrics(metric: string, hours: number) {
  return useQuery({
    queryKey: ["admin", "metrics", metric, hours],
    queryFn: async () => {
      const { data } = await apiClient.get<AdminMetrics>("/admin/metrics", {
        params: { metric, hours },
      })
      return data
    },
    staleTime: 10_000,
    refetchInterval: REFETCH_INTERVAL,
  })
}
