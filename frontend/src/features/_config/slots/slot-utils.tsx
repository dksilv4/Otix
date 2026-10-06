import type { ReactNode } from 'react'

export const safeUrl = (url: string): string | undefined => {
  if (/^(https?:|mailto:)/i.test(url)) return url
  return undefined
}

export const renderInline = (text: string): ReactNode[] => {
  const pattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g
  const nodes: ReactNode[] = []
  let last = 0
  let k = 0
  let m: RegExpExecArray | null
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    if (m[2]) {
      nodes.push(
        <strong key={k++} className="font-semibold text-white">
          {m[2]}
        </strong>,
      )
    } else if (m[3]) {
      nodes.push(<em key={k++}>{m[3]}</em>)
    } else if (m[4]) {
      nodes.push(
        <code key={k++} className="rounded bg-white/5 px-1 py-0.5 font-mono text-xs">
          {m[4]}
        </code>,
      )
    } else if (m[5] && m[6] && safeUrl(m[6])) {
      nodes.push(
        <a key={k++} className="text-sky-400 hover:underline" href={m[6]}>
          {m[5]}
        </a>,
      )
    } else {
      nodes.push(text.slice(m.index, m.index + m[0].length))
    }
    last = m.index + m[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export const renderCell = (value: unknown): ReactNode => {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? '✓' : '✗'
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
