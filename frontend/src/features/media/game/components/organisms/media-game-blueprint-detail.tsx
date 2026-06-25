import { useState } from 'react'
import { Copy, X, Check, Layers, Grid3X3, Hammer } from 'lucide-react'
import { BlueprintIcon } from '../atoms/media-game-blueprint-icon'

interface ParsedBlueprint {
  type: string
  label: string
  description: string
  icons: string[]
  entities: Record<string, number>
  entityCount: number
  tiles: Record<string, number>
  tileCount: number
  dimensions: { width: number; height: number }
  version: string
  raw: string
  id?: string
}

interface Props {
  blueprint: ParsedBlueprint
  onClose: () => void
  onCopy: (raw: string) => void
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
}

// Group entities by category based on name patterns
function categorizeEntity(name: string): string {
  if (name.includes('assembling') || name.includes('furnace') || name.includes('chemical') || name.includes('refinery'))
    return 'Production'
  if (name.includes('belt') || name.includes('splitter') || name.includes('underground') || name.includes('loader'))
    return 'Logistics (Belts)'
  if (name.includes('inserter'))
    return 'Logistics (Inserters)'
  if (name.includes('train') || name.includes('rail') || name.includes('signal') || name.includes('station'))
    return 'Rail'
  if (name.includes('pole') || name.includes('substation') || name.includes('accumulator') || name.includes('solar') || name.includes('reactor'))
    return 'Power'
  if (name.includes('pipe') || name.includes('pump') || name.includes('tank') || name.includes('offshore'))
    return 'Fluids'
  if (name.includes('chest') || name.includes('logistic') || name.includes('requester') || name.includes('provider') || name.includes('storage'))
    return 'Logistics (Chests)'
  if (name.includes('drill') || name.includes('mining'))
    return 'Mining'
  if (name.includes('module') || name.includes('beacon'))
    return 'Modules'
  if (name.includes('wall') || name.includes('gun') || name.includes('laser') || name.includes('ammo') || name.includes('radar'))
    return 'Military'
  return 'Other'
}

export function BlueprintDetail({ blueprint, onClose, onCopy, onEdit, onDelete }: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    onCopy(blueprint.raw)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Group entities by category
  const groupedEntities: Record<string, [string, number][]> = {}
  for (const [name, count] of Object.entries(blueprint.entities)) {
    const cat = categorizeEntity(name)
    if (!groupedEntities[cat]) groupedEntities[cat] = []
    groupedEntities[cat].push([name, count])
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="glass-card rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <BlueprintIcon icons={blueprint.icons || []} size="lg" />
            <div>
              <h2 className="text-lg font-semibold text-white">{blueprint.label}</h2>
              {blueprint.description && (
                <p className="text-sm text-muted-foreground mt-1">{blueprint.description}</p>
              )}
              <p className="text-xs text-muted-foreground/60 mt-1">
                {blueprint.type === 'blueprint-book' ? 'Blueprint Book' : 'Blueprint'} · v{blueprint.version}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 text-muted-foreground transition-all">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Grid3X3 className="h-3.5 w-3.5" />
            {blueprint.dimensions.width} × {blueprint.dimensions.height} tiles
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Layers className="h-3.5 w-3.5" />
            {blueprint.entityCount} entities
          </span>
          {blueprint.tileCount > 0 && (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Hammer className="h-3.5 w-3.5" />
              {blueprint.tileCount} tiles
            </span>
          )}
        </div>

        {/* Entity breakdown grouped by category */}
        {Object.entries(groupedEntities).length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Entities</h3>
            {Object.entries(groupedEntities).map(([category, entities]) => (
              <div key={category}>
                <p className="text-[10px] font-medium text-muted-foreground/60 uppercase mb-1.5">
                  {category} ({entities.reduce((sum, [, count]) => sum + count, 0)})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {entities.map(([name, count]) => (
                    <span
                      key={name}
                      className="text-[11px] px-2 py-1 rounded-md bg-white/5 text-muted-foreground"
                    >
                      {name}: <span className="text-white font-medium">{count}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tiles */}
        {blueprint.tileCount > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tiles</h3>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(blueprint.tiles).map(([name, count]) => (
                <span key={name} className="text-[11px] px-2 py-1 rounded-md bg-white/5 text-muted-foreground">
                  {name}: <span className="text-white font-medium">{count}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-3 border-t border-white/[0.04]">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-primary/15 text-primary hover:bg-primary/25 transition-all"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied!' : 'Copy Blueprint String'}
          </button>
          {onEdit && blueprint.id && (
            <button
              onClick={() => onEdit(blueprint.id!)}
              className="px-3 py-2 text-xs rounded-lg hover:bg-white/10 text-muted-foreground transition-all"
            >
              Edit
            </button>
          )}
          {onDelete && blueprint.id && (
            <button
              onClick={() => { onDelete(blueprint.id!); onClose() }}
              className="px-3 py-2 text-xs rounded-lg hover:bg-red-500/10 text-red-400 transition-all ml-auto"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
