import { useQuery } from '@tanstack/react-query'
import type { SlotContribution } from '../types'

export function useSlotData(pageId: string): {
  data: Record<string, SlotContribution[]> | undefined
  isLoading: boolean
  error: Error | null
} {
  const { data, isLoading, error } = useQuery({
    queryKey: ['slots', pageId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!(window as any).desktopAPI?.plugin?.getPageSlotData) {
        return {}
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await (window as any).desktopAPI.plugin.getPageSlotData(pageId) as Record<string, SlotContribution[]>
    },
    staleTime: 30_000,
  })

  return {
    data,
    isLoading,
    error: error as Error | null,
  }
}
