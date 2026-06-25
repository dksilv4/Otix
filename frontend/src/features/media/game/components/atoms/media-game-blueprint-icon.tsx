import { Package } from 'lucide-react'

interface Props {
  icons: string[]
  size?: 'sm' | 'md' | 'lg'
}

const SIZE_MAP = { sm: 6, md: 8, lg: 12 }
const FONT_MAP = { sm: 'text-[8px]', md: 'text-[10px]', lg: 'text-xs' }

// Simple deterministic color from entity name
function colorFromName(name: string): string {
  const colors = [
    'bg-blue-500/20 text-blue-400',
    'bg-green-500/20 text-green-400',
    'bg-yellow-500/20 text-yellow-400',
    'bg-red-500/20 text-red-400',
    'bg-purple-500/20 text-purple-400',
    'bg-pink-500/20 text-pink-400',
    'bg-indigo-500/20 text-indigo-400',
    'bg-teal-500/20 text-teal-400',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i)
  }
  return colors[Math.abs(hash) % colors.length]
}

function iconInitial(name: string): string {
  return name.split(/[-\s]/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export function BlueprintIcon({ icons, size = 'md' }: Props) {
  const dim = SIZE_MAP[size]
  const font = FONT_MAP[size]

  if (!icons?.length) {
    return (
      <div className={`flex items-center justify-center w-${dim} h-${dim} rounded-lg bg-white/5 text-muted-foreground`}>
        <Package className={`h-${dim/2} w-${dim/2}`} />
      </div>
    )
  }

  // Show up to 4 icons in a 2x2 grid
  const display = icons.slice(0, 4)

  return (
    <div className="grid grid-cols-2 gap-0.5">
      {display.map((name, i) => (
        <div
          key={i}
          className={`flex items-center justify-center w-${dim/2} h-${dim/2} rounded ${colorFromName(name)} ${font} font-bold`}
          title={name}
        >
          {iconInitial(name)}
        </div>
      ))}
    </div>
  )
}
