import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import type { DocCodeSnippet } from '../../types'

interface DocsCodeBlockProps {
  snippet: DocCodeSnippet
  onCopy: (code: string, label?: string) => void
}

export const DocsCodeBlock = ({ snippet, onCopy }: DocsCodeBlockProps) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    onCopy(snippet.code, snippet.label || snippet.language)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="group relative rounded-2xl border border-white/[0.05] overflow-hidden my-4 shadow-[var(--dk-shadow-xs)]"
      style={{ backgroundColor: 'var(--dk-surface-base)' }}
    >
      <div
        className="flex items-center justify-between px-4 py-2 border-b border-[var(--dk-separator)] text-[11px] font-medium text-muted-foreground"
        style={{ backgroundColor: 'var(--dk-surface-raised)' }}
      >
        <span className="font-mono uppercase tracking-wider">
          {snippet.label || snippet.language}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? 'Copied' : 'Copy code snippet'}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)] transition-colors"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-primary" />
              <span className="text-primary">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="p-4 overflow-x-auto text-xs sm:text-sm font-mono leading-relaxed text-foreground/90 selection:bg-primary/20">
        <pre className="whitespace-pre">
          <code>{snippet.code}</code>
        </pre>
      </div>
    </div>
  )
}
