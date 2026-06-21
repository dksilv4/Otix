import { useQuery } from '@tanstack/react-query'
import type { PluginSettingsTab } from './types'

export function usePluginTabs(): {
  tabs: PluginSettingsTab[]
  isLoading: boolean
} {
  const { data, isLoading } = useQuery({
    queryKey: ['plugin-tabs'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!(window as any).desktopAPI?.plugin?.getPluginTabs) {
        return []
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await (window as any).desktopAPI.plugin.getPluginTabs() as PluginSettingsTab[]
    },
    staleTime: 60_000,
  })

  return {
    tabs: data || [],
    isLoading,
  }
}
