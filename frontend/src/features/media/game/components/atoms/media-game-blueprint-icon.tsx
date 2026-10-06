import { Package } from 'lucide-react'
import { colorFromName, iconInitial } from '../../utils/blueprint'

interface Props {
  icons: string[]
  size?: 'sm' | 'md' | 'lg'
}

const SIZE_MAP = { sm: { outer: 'w-6 h-6', cell: 'w-3 h-3', icon: 'h-3 w-3' }, md: { outer: 'w-8 h-8', cell: 'w-4 h-4', icon: 'h-4 w-4' }, lg: { outer: 'w-12 h-12', cell: 'w-6 h-6', icon: 'h-6 w-6' } }
const FONT_MAP = { sm: 'text-[8px]', md: 'text-[10px]', lg: 'text-xs' }

export const BlueprintIcon = ({ icons, size = 'md' }: Props) => {
  const dims = SIZE_MAP[size]
  const font = FONT_MAP[size]

  if (!icons?.length) {
    return (
      <div className={`flex items-center justify-center ${dims.outer} rounded-lg bg-white/5 text-muted-foreground`}>
        <Package className={dims.icon} />
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
          className={`flex items-center justify-center ${dims.cell} rounded ${colorFromName(name)} ${font} font-bold`}
          title={name}
        >
          {iconInitial(name)}
        </div>
      ))}
    </div>
  )
};
