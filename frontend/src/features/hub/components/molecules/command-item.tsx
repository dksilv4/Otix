import { FileText, Gamepad2, Cog, Puzzle, Compass } from 'lucide-react'
import type { Command, CommandDomain } from '../../types'

const DOMAIN_ICONS: Record<CommandDomain, typeof Compass> = {
  navigation: Compass,
  media: FileText,
  games: Gamepad2,
  system: Cog,
  plugin: Puzzle,
}

const FallbackIcon = ({ domain }: { domain: CommandDomain }) => {
  const Icon = DOMAIN_ICONS[domain] ?? Compass
  return <Icon className="h-4 w-4" />
};

interface CommandItemProps {
  command: Command
  active: boolean
  onSelect: () => void
  onHover: () => void
  innerRef: (el: HTMLButtonElement | null) => void
}

export const CommandItem = ({ command, active, onSelect, onHover, innerRef }: CommandItemProps) => {
  return (
    <button
      ref={innerRef}
      type="button"
      role="option"
      aria-selected={active}
      onMouseEnter={onHover}
      onClick={onSelect}
      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
        active ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/5'
      }`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/70">
        {command.icon ? <command.icon className="h-4 w-4" /> : <FallbackIcon domain={command.domain} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{command.title}</span>
        {command.subtitle && (
          <span className="block truncate text-xs text-white/40">{command.subtitle}</span>
        )}
      </span>
    </button>
  )
};
