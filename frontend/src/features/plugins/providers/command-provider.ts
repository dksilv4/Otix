import type { Command, CommandProvider } from '@/features/hub/types'

/**
 * A command-hub widget contributed by a plugin at the `command:hub` slot.
 *
 * Plugins declare `slots: [{ location: 'command:hub', label: '...' }]` and
 * return widgets from `slotRender('command:hub')`. `action` is the plugin
 * method invoked when the command runs.
 */
interface PluginCommandWidget {
  type: 'command'
  key?: string
  props: {
    title: string
    subtitle?: string
    keywords?: string[]
    action?: string
  }
}

interface SlotContribution {
  pluginId: string
  label: string
  data?: { widgets?: PluginCommandWidget[] }
}

function callData(pluginId: string, method: string, ...args: unknown[]): Promise<unknown> {
  const desktopAPI = (window as any).desktopAPI
  if (!desktopAPI?.plugin?.callData) return Promise.resolve()
  return desktopAPI.plugin.callData(pluginId, method, ...args).catch((err: Error) => {
    console.error(`[Plugins] command ${pluginId}.${method} failed:`, err)
  })
}

/**
 * Surfaces plugin-registered commands in the Cmd+K palette. Registers as a
 * "plugin" domain provider so plugins stay opt-in (nothing when no plugin
 * contributes to the `command:hub` slot).
 */
export function createPluginsCommandProvider(): CommandProvider {
  return {
    id: 'plugins',
    label: 'Plugins',
    domain: 'plugin',
    search: async (query: string): Promise<Command[]> => {
      const desktopAPI = (window as any).desktopAPI
      if (!desktopAPI?.plugin?.getSlotData) return []

      let contributions: SlotContribution[]
      try {
        contributions = (await desktopAPI.plugin.getSlotData('command:hub')) as SlotContribution[]
      } catch {
        return []
      }

      const commands: Command[] = []
      for (const contribution of contributions) {
        for (const widget of contribution.data?.widgets ?? []) {
          if (widget.type !== 'command' || !widget.props?.title) continue
          const { title, subtitle, keywords, action } = widget.props
          const key = widget.key ?? title
          commands.push({
            id: `plugin:${contribution.pluginId}:${key}`,
            title,
            subtitle: subtitle ?? contribution.label,
            domain: 'plugin',
            keywords,
            run: () => {
              if (action) callData(contribution.pluginId, action, key)
            },
          })
        }
      }

      const q = query.trim().toLowerCase()
      if (!q) return commands
      return commands.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          (c.subtitle ?? '').toLowerCase().includes(q) ||
          (c.keywords ?? []).some((k) => k.toLowerCase().includes(q)),
      )
    },
  }
}
