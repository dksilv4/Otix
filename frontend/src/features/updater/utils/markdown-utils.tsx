import type { ReactNode } from 'react'
import { openExternal } from '@/lib/utils/open-external'

export interface MarkdownBlockHeading {
  type: 'heading'
  level: number
  text: string
}

export interface MarkdownBlockCode {
  type: 'code'
  language: string
  code: string
}

export interface MarkdownBlockQuote {
  type: 'quote'
  text: string
}

export interface MarkdownBlockHr {
  type: 'hr'
}

export interface MarkdownBlockList {
  type: 'list'
  ordered: boolean
  items: string[]
}

export interface MarkdownBlockParagraph {
  type: 'paragraph'
  text: string
}

export type MarkdownBlock =
  | MarkdownBlockHeading
  | MarkdownBlockCode
  | MarkdownBlockQuote
  | MarkdownBlockHr
  | MarkdownBlockList
  | MarkdownBlockParagraph

export const renderInlineMarkdown = (text: string): ReactNode[] => {
  const pattern =
    /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g
  const nodes: ReactNode[] = []
  let lastIndex = 0
  let key = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }

    if (match[2]) {
      // Bold: **text**
      nodes.push(
        <strong key={`bold-${key++}`} className="font-semibold text-foreground">
          {match[2]}
        </strong>
      )
    } else if (match[3]) {
      // Italic: *text*
      nodes.push(
        <em key={`italic-${key++}`} className="italic text-foreground/90">
          {match[3]}
        </em>
      )
    } else if (match[4]) {
      // Inline code: `text`
      nodes.push(
        <code
          key={`code-${key++}`}
          className="px-1.5 py-0.5 rounded-md font-mono text-[11px] bg-[var(--dk-surface-field)] border border-white/[0.04] text-foreground"
        >
          {match[4]}
        </code>
      )
    } else if (match[5] && match[6]) {
      // Link: [label](url)
      const label = match[5]
      const url = match[6]
      nodes.push(
        <button
          key={`link-${key++}`}
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            openExternal(url, { newTab: true })
          }}
          className="text-primary hover:underline font-medium inline text-left cursor-pointer p-0 bg-transparent border-0"
        >
          {label}
        </button>
      )
    }

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes
}

export const parseMarkdownBlocks = (raw: string): MarkdownBlock[] => {
  if (!raw || typeof raw !== 'string') return []

  const lines = raw.replace(/\r\n/g, '\n').split('\n')
  const blocks: MarkdownBlock[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Empty line: skip
    if (!line.trim()) {
      i++
      continue
    }

    // Fenced code block
    if (line.trim().startsWith('```')) {
      const language = line.trim().replace(/^```/, '').trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      if (i < lines.length) i++ // consume ending ```
      blocks.push({
        type: 'code',
        language,
        code: codeLines.join('\n'),
      })
      continue
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(line.trim())) {
      blocks.push({ type: 'hr' })
      i++
      continue
    }

    // Headings: #, ##, ###, ####
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/)
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      })
      i++
      continue
    }

    // Blockquote
    if (line.trim().startsWith('>')) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''))
        i++
      }
      blocks.push({
        type: 'quote',
        text: quoteLines.join('\n'),
      })
      continue
    }

    // List items (*, -, + or 1.)
    const isUnordered = /^[-*+]\s+(.+)$/.test(line.trim())
    const isOrdered = /^\d+\.\s+(.+)$/.test(line.trim())
    if (isUnordered || isOrdered) {
      const items: string[] = []
      const ordered = isOrdered

      while (i < lines.length) {
        const curr = lines[i].trim()
        const unMatch = curr.match(/^[-*+]\s+(.+)$/)
        const ordMatch = curr.match(/^\d+\.\s+(.+)$/)
        if (unMatch && !ordered) {
          items.push(unMatch[1])
          i++
        } else if (ordMatch && ordered) {
          items.push(ordMatch[1])
          i++
        } else if (curr.startsWith('  ') && items.length > 0) {
          // Continuation or nested sub-line
          items[items.length - 1] += ` ${curr.trim()}`
          i++
        } else {
          break
        }
      }

      blocks.push({
        type: 'list',
        ordered,
        items,
      })
      continue
    }

    // Regular paragraph
    const paragraphLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('>') &&
      !/^#{1,4}\s+/.test(lines[i].trim()) &&
      !/^[-*_]{3,}$/.test(lines[i].trim()) &&
      !/^[-*+]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim())
    ) {
      paragraphLines.push(lines[i].trim())
      i++
    }

    blocks.push({
      type: 'paragraph',
      text: paragraphLines.join(' '),
    })
  }

  return blocks
}

export const renderMarkdownBlock = (
  block: MarkdownBlock,
  key: number | string
): ReactNode => {
  switch (block.type) {
    case 'heading': {
      if (block.level === 1) {
        return (
          <h2
            key={key}
            className="text-sm font-bold text-foreground tracking-tight pt-1.5 first:pt-0"
          >
            {renderInlineMarkdown(block.text)}
          </h2>
        )
      }
      if (block.level === 2) {
        return (
          <h3
            key={key}
            className="text-xs font-semibold text-foreground tracking-tight pt-1 first:pt-0"
          >
            {renderInlineMarkdown(block.text)}
          </h3>
        )
      }
      return (
        <h4
          key={key}
          className="text-xs font-medium text-foreground/90 pt-0.5 first:pt-0"
        >
          {renderInlineMarkdown(block.text)}
        </h4>
      )
    }

    case 'code':
      return (
        <pre
          key={key}
          className="rounded-xl p-3 font-mono text-[11px] bg-[var(--dk-surface-field)] border border-white/[0.04] overflow-x-auto text-foreground leading-relaxed my-1.5"
        >
          <code>{block.code}</code>
        </pre>
      )

    case 'quote':
      return (
        <blockquote
          key={key}
          className="border-l-2 border-primary/40 pl-3 py-1 my-1.5 text-xs text-muted-foreground italic leading-relaxed"
        >
          {renderInlineMarkdown(block.text)}
        </blockquote>
      )

    case 'hr':
      return (
        <hr
          key={key}
          className="my-3 h-px border-0 bg-[var(--dk-separator)]"
        />
      )

    case 'list': {
      if (block.ordered) {
        return (
          <ol key={key} className="space-y-1.5 my-1 pl-4 list-decimal text-xs">
            {block.items.map((item, idx) => (
              <li key={idx} className="leading-relaxed text-foreground/90">
                {renderInlineMarkdown(item)}
              </li>
            ))}
          </ol>
        )
      }

      return (
        <ul key={key} className="space-y-1.5 my-1 text-xs">
          {block.items.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2.5 leading-relaxed text-foreground/90">
              <span className="text-primary font-bold shrink-0 mt-0.5 select-none">•</span>
              <span className="flex-1">{renderInlineMarkdown(item)}</span>
            </li>
          ))}
        </ul>
      )
    }

    case 'paragraph':
    default:
      return (
        <p key={key} className="text-xs leading-relaxed text-foreground/90 my-1">
          {renderInlineMarkdown(block.text)}
        </p>
      )
  }
}
