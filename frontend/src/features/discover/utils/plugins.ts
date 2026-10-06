export const getPluginAPI = () => {
  return (window as any).desktopAPI?.plugin as
    | { callData: (pluginId: string, method: string, ...args: unknown[]) => Promise<unknown> }
    | undefined
}
