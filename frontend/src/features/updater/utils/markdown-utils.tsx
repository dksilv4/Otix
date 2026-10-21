import type { ReactNode } from 'react'
import { openExternal } from '@/lib/utils/open-external'
import { CheckSquare, Square } from 'lucide-react'

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

export interface MarkdownBlockTable {
  type: 'table'
  headers: string[]
  rows: string[][]
}

export type MarkdownBlock =
  | MarkdownBlockHeading
  | MarkdownBlockCode
  | MarkdownBlockQuote
  | MarkdownBlockHr
  | MarkdownBlockList
  | MarkdownBlockParagraph
  | MarkdownBlockTable

export const renderInlineMarkdown = (text: string): ReactNode[] => {
  if (!text) return []

  const pattern =
    /(\[([^\]]+)\]\(([^)]+)\)|(https?:\/\/[^\s<>"'()[\]]+[^\s<>"'()[\].,!?:;])|\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|~~([^~]+)~~|\*([^*]+)\*|(?:\b|^)_([^_]+)_(?:\b|$)|(?:^|\s)@([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?)\b|(?:^|\s|\()#(\d+)\b|(?:^|\s|\()([a-f0-9]{7,10})(?=[)\s]|$))/g

  const nodes: ReactNode[] = []
  let lastIndex = 0
  let key = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }

    if (match[2] && match[3]) {
      // Markdown link: [label](url)
      const label = match[2]
      const url = match[3]
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
    } else if (match[4]) {
      // Auto-linked raw URL
      const url = match[4]
      nodes.push(
        <button
          key={`rawurl-${key++}`}
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            openExternal(url, { newTab: true })
          }}
          className="text-primary hover:underline font-medium inline text-left cursor-pointer p-0 bg-transparent border-0 break-all"
        >
          {url}
        </button>
      )
    } else if (match[5]) {
      // Bold + Italic: ***text***
      nodes.push(
        <strong key={`bi-${key++}`} className="font-semibold italic text-foreground">
          {match[5]}
        </strong>
      )
    } else if (match[6] || match[7]) {
      // Bold: **text** or __text__
      nodes.push(
        <strong key={`bold-${key++}`} className="font-semibold text-foreground">
          {match[6] || match[7]}
        </strong>
      )
    } else if (match[8]) {
      // Inline code: `text`
      nodes.push(
        <code
          key={`code-${key++}`}
          className="px-1.5 py-0.5 rounded-md font-mono text-[11px] bg-[var(--dk-surface-field)] border border-white/[0.04] text-foreground"
        >
          {match[8]}
        </code>
      )
    } else if (match[9]) {
      // Strikethrough: ~~text~~
      nodes.push(
        <del key={`del-${key++}`} className="line-through text-muted-foreground">
          {match[9]}
        </del>
      )
    } else if (match[10] || match[11]) {
      // Italic: *text* or _text_
      nodes.push(
        <em key={`italic-${key++}`} className="italic text-foreground/90">
          {match[10] || match[11]}
        </em>
      )
    } else if (match[12]) {
      // GitHub mention: @username
      const full = match[0]
      if (full.startsWith(' ') || full.startsWith('\t')) {
        nodes.push(full[0])
      }
      const username = match[12]
      nodes.push(
        <button
          key={`user-${key++}`}
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            openExternal(`https://github.com/${username}`, { newTab: true })
          }}
          className="inline-flex items-center text-primary font-medium hover:underline px-1 py-0.5 rounded bg-primary/10 text-[11px] cursor-pointer"
        >
          @{username}
        </button>
      )
    } else if (match[13]) {
      // GitHub issue/PR ref: #123
      const full = match[0]
      if (full.startsWith(' ') || full.startsWith('\t') || full.startsWith('(')) {
        nodes.push(full[0])
      }
      const issueNum = match[13]
      nodes.push(
        <button
          key={`issue-${key++}`}
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            openExternal(`https://github.com/dksilv4/Otix/issues/${issueNum}`, { newTab: true })
          }}
          className="inline-flex items-center font-mono font-medium text-primary hover:underline px-1 rounded bg-[var(--dk-surface-ghost)] text-[11px] cursor-pointer"
        >
          #{issueNum}
        </button>
      )
    } else if (match[14]) {
      // Commit SHA: e.g. 72b8203e
      const full = match[0]
      if (full.startsWith(' ') || full.startsWith('\t') || full.startsWith('(')) {
        nodes.push(full[0])
      }
      const sha = match[14]
      nodes.push(
        <button
          key={`sha-${key++}`}
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            openExternal(`https://github.com/dksilv4/Otix/commit/${sha}`, { newTab: true })
          }}
          className="inline-flex items-center font-mono text-muted-foreground hover:text-foreground hover:underline px-1 rounded bg-[var(--dk-surface-ghost)] text-[10px] cursor-pointer"
        >
          {sha}
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

    // Markdown table (| h1 | h2 |)
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      if (i + 1 < lines.length && /^\|(\s*:?-+:?\s*\|)+$/.test(lines[i + 1].trim())) {
        const headers = line.split('|').slice(1, -1).map((s) => s.trim())
        i += 2 // skip header and delimiter line
        const rows: string[][] = []
        while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
          rows.push(lines[i].split('|').slice(1, -1).map((s) => s.trim()))
          i++
        }
        blocks.push({
          type: 'table',
          headers,
          rows,
        })
        continue
      }
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
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !(lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|'))
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

const CONVENTIONAL_REGEX =
  /^(feat|fix|perf|refactor|docs|chore|test|style|revert)(?:\(([^)]+)\))?:\s*(.*)$/i

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
            className="text-base font-bold text-foreground tracking-tight pt-2.5 pb-1 first:pt-0"
          >
            {renderInlineMarkdown(block.text)}
          </h2>
        )
      }
      if (block.level === 2) {
        return (
          <h3
            key={key}
            className="text-sm font-semibold text-foreground tracking-tight pt-2 pb-1 border-b border-white/[0.04] first:pt-0"
          >
            {renderInlineMarkdown(block.text)}
          </h3>
        )
      }
      if (block.level === 3) {
        return (
          <h4
            key={key}
            className="text-xs font-semibold text-foreground tracking-tight pt-1.5 first:pt-0"
          >
            {renderInlineMarkdown(block.text)}
          </h4>
        )
      }
      return (
        <h5
          key={key}
          className="text-xs font-medium text-muted-foreground pt-1 first:pt-0"
        >
          {renderInlineMarkdown(block.text)}
        </h5>
      )
    }

    case 'table':
      return (
        <div
          key={key}
          className="my-2.5 overflow-x-auto rounded-xl border border-white/[0.04] bg-[var(--dk-surface-ghost)]"
        >
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-white/[0.04] bg-[var(--dk-surface-raised)] text-muted-foreground font-semibold">
                {block.headers.map((h, i) => (
                  <th key={i} className="px-3.5 py-2 text-foreground font-semibold">
                    {renderInlineMarkdown(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rIdx) => (
                <tr
                  key={rIdx}
                  className="border-b border-white/[0.02] last:border-0 hover:bg-[var(--dk-surface-raised)]/40 transition-colors"
                >
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="px-3.5 py-2 text-foreground/90 leading-relaxed">
                      {renderInlineMarkdown(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )

    case 'code':
      return (
        <div
          key={key}
          className="my-2.5 rounded-xl overflow-hidden bg-[var(--dk-surface-field)] border border-white/[0.04]"
        >
          {block.language && (
            <div className="flex items-center justify-between px-3.5 py-1.5 border-b border-white/[0.04] bg-[var(--dk-surface-ghost)] text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              <span>{block.language}</span>
            </div>
          )}
          <pre className="p-3.5 font-mono text-[11px] overflow-x-auto text-foreground leading-relaxed">
            <code>{block.code}</code>
          </pre>
        </div>
      )

    case 'quote':
      return (
        <blockquote
          key={key}
          className="rounded-xl p-3 bg-[var(--dk-surface-ghost)] border-l-2 border-primary/50 text-xs text-muted-foreground italic leading-relaxed my-2"
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
          <ol key={key} className="space-y-1.5 my-1.5 pl-4 list-decimal text-xs text-muted-foreground">
            {block.items.map((item, idx) => (
              <li key={idx} className="leading-relaxed text-foreground/90 pl-1">
                {renderInlineMarkdown(item)}
              </li>
            ))}
          </ol>
        )
      }

      return (
        <ul key={key} className="space-y-1.5 my-1 text-xs">
          {block.items.map((item, idx) => {
            // Task list check: [x] or [ ]
            const taskMatch = item.match(/^\[([ xX])\]\s*(.*)$/)
            if (taskMatch) {
              const isChecked = taskMatch[1].toLowerCase() === 'x'
              const taskText = taskMatch[2]
              return (
                <li key={idx} className="flex items-start gap-2 leading-relaxed text-foreground/90">
                  {isChecked ? (
                    <CheckSquare className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  ) : (
                    <Square className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  )}
                  <span className={isChecked ? 'line-through text-muted-foreground flex-1' : 'flex-1'}>
                    {renderInlineMarkdown(taskText)}
                  </span>
                </li>
              )
            }

            // Conventional commit check: feat:, fix(desktop):, etc.
            const convMatch = item.match(CONVENTIONAL_REGEX)
            if (convMatch) {
              const type = convMatch[1].toLowerCase()
              const scope = convMatch[2]
              const rest = convMatch[3]
              const badgeClass =
                type === 'feat'
                  ? 'bg-primary/10 text-primary'
                  : type === 'fix'
                    ? 'bg-[var(--dk-surface-ghost)] text-foreground font-semibold'
                    : type === 'perf'
                      ? 'bg-primary/15 text-primary'
                      : 'bg-[var(--dk-surface-ghost)] text-muted-foreground'

              return (
                <li key={idx} className="flex items-start gap-2 leading-relaxed text-foreground/90">
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider shrink-0 mt-0.5 border border-white/[0.04] ${badgeClass}`}
                  >
                    {scope ? `${type}(${scope})` : type}
                  </span>
                  <span className="flex-1">{renderInlineMarkdown(rest)}</span>
                </li>
              )
            }

            // Standard clean unordered item (subtle en-dash marker, no pinging bubbles/dots)
            return (
              <li key={idx} className="flex items-start gap-2 leading-relaxed text-foreground/90">
                <span className="text-muted-foreground/50 select-none text-xs shrink-0 mt-0.5 font-bold">–</span>
                <span className="flex-1">{renderInlineMarkdown(item)}</span>
              </li>
            )
          })}
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
