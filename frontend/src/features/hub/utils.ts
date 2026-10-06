import { getHubProviders } from './registry'
import type { Command, CommandProvider } from './types'

export interface CommandGroup {
  providerId: string
  label: string
  commands: Command[]
}

export const RESULT_LIMIT = 50

export const searchAllProviders = async (query: string): Promise<CommandGroup[]> => {
  const rawProviders = getHubProviders()
  const providers: CommandProvider[] = Array.isArray(rawProviders) ? rawProviders : []
  const groups = await Promise.all(
    providers.map(async (p) => {
      const rawCommands = await Promise.resolve(p.search(query)).catch(() => [] as Command[])
      const commands = Array.isArray(rawCommands) ? rawCommands : []
      return { providerId: p.id, label: p.label, commands }
    }),
  )
  return (Array.isArray(groups) ? groups : [])
    .map((g) => ({ ...g, commands: (Array.isArray(g.commands) ? g.commands : []).slice(0, RESULT_LIMIT) }))
    .filter((g) => g.commands.length > 0)
}
