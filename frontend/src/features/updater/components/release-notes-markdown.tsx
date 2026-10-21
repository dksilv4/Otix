import { useMemo } from 'react'
import {
  parseMarkdownBlocks,
  renderMarkdownBlock,
} from '../utils/markdown-utils'

export interface ReleaseNotesMarkdownProps {
  content: string
  className?: string
}

export const ReleaseNotesMarkdown = ({
  content,
  className = '',
}: ReleaseNotesMarkdownProps) => {
  const blocks = useMemo(() => parseMarkdownBlocks(content), [content])

  if (!content || blocks.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic py-2">
        No release notes available for this update.
      </div>
    )
  }

  return (
    <div className={`space-y-2 text-xs leading-relaxed text-foreground/90 ${className}`}>
      {blocks.map((block, idx) => renderMarkdownBlock(block, idx))}
    </div>
  )
}
