import {
  Archive,
  Disc,
  FileText,
  Folder,
  Gamepad2,
  Package,
} from 'lucide-react'
import type { FormatCategory } from '../../node-explorer-types'

export interface ExplorerFormatIconProps {
  format: FormatCategory
}

export const ExplorerFormatIcon = ({ format }: ExplorerFormatIconProps) => {
  switch (format) {
    case 'iso':
      return <Disc className="h-4 w-4 text-primary shrink-0" />
    case 'installer':
      return <Package className="h-4 w-4 text-primary shrink-0" />
    case 'game':
      return <Gamepad2 className="h-4 w-4 text-primary shrink-0" />
    case 'archive':
      return <Archive className="h-4 w-4 text-primary shrink-0" />
    case 'rom':
      return <Gamepad2 className="h-4 w-4 text-primary shrink-0" />
    case 'folder':
      return <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
    default:
      return <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
  }
}
