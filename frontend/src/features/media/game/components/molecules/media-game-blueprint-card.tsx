import { Copy, Edit3, Trash2, Grid3X3, Layers } from 'lucide-react'
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
  tags?: string[]
  created_at?: string
}

interface Props {
  blueprint: ParsedBlueprint
  showActions?: boolean
  onCopy?: (rawString: string) => void
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
  onClick?: () => void
}

export const BlueprintCard = ({ blueprint, showActions, onCopy, onEdit, onDelete, onClick }: Props) => {
  const entityEntries = Object.entries(blueprint.entities).slice(0, 3)
  const extraCount = Math.max(0, Object.keys(blueprint.entities).length - 3)

  return (
    <div
      onClick={onClick}
      className="glass-inset rounded-xl p-3.5 space-y-3 transition-all duration-200 hover:bg-[var(--dk-surface-glass)] cursor-pointer group"
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <BlueprintIcon icons={blueprint.icons || []} size="md" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {blueprint.label}
          </p>
          {blueprint.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
              {blueprint.description}
            </p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Grid3X3 className="h-3 w-3" />
          {blueprint.dimensions.width}×{blueprint.dimensions.height}
        </span>
        <span className="flex items-center gap-1">
          <Layers className="h-3 w-3" />
          {blueprint.entityCount} entities
        </span>
        {blueprint.tileCount > 0 && (
          <span>{blueprint.tileCount} tiles</span>
        )}
      </div>

      {/* Entity breakdown */}
      {entityEntries.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {entityEntries.map(([name, count]) => (
            <span key={name} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--dk-surface-glass)] text-muted-foreground">
              {name}: {count}
            </span>
          ))}
          {extraCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--dk-surface-glass)] text-muted-foreground">
              +{extraCount} more
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      {showActions && (
        <div className="flex items-center gap-1 pt-1 border-t border-[var(--dk-separator)] opacity-0 group-hover:opacity-100 transition-opacity">
          {onCopy && (
            <button
              onClick={(e) => { e.stopPropagation(); onCopy(blueprint.raw) }}
              className="flex items-center gap-1 px-2 py-1 text-[10px] rounded-md hover:bg-[var(--dk-surface-glass)] text-muted-foreground hover:text-foreground transition-all"
              title="Copy blueprint string"
            >
              <Copy className="h-3 w-3" /> Copy
            </button>
          )}
          {onEdit && blueprint.id && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(blueprint.id!) }}
              className="flex items-center gap-1 px-2 py-1 text-[10px] rounded-md hover:bg-[var(--dk-surface-glass)] text-muted-foreground hover:text-foreground transition-all"
              title="Edit metadata"
            >
              <Edit3 className="h-3 w-3" /> Edit
            </button>
          )}
          {onDelete && blueprint.id && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(blueprint.id!) }}
              className="flex items-center gap-1 px-2 py-1 text-[10px] rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all ml-auto"
              title="Delete blueprint"
            >
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          )}
        </div>
      )}
    </div>
  )
};
