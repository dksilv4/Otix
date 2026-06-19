// frontend/src/features/_config/slots/ErrorCard.tsx
import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'

interface ErrorCardProps {
  pluginName: string
  message: string
  details?: string
  suspended?: boolean
  onReenable?: () => void
}

export function ErrorCard({ pluginName, message, details, suspended, onReenable }: ErrorCardProps) {
  const [expanded, setExpanded] = useState(false)
  const isDev = process.env.NODE_ENV === 'development'

  return (
    <div
      style={{
        backgroundColor: 'var(--dk-surface-base)',
        borderRadius: 'var(--dk-radius-md)',
        padding: '12px 16px',
        border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <AlertTriangle size={16} style={{ color: 'var(--danger)' }} />
        <span style={{ fontWeight: 600, fontSize: 14 }}>
          {pluginName}: {message}
        </span>
        {isDev && details && (
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
            }}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>
      {expanded && details && (
        <pre style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
          {details}
        </pre>
      )}
      {suspended && onReenable && (
        <button
          onClick={onReenable}
          style={{
            marginTop: 8,
            padding: '4px 12px',
            borderRadius: 'var(--dk-radius-sm)',
            border: '1px solid var(--border)',
            background: 'var(--dk-surface-raised)',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Re-enable this section
        </button>
      )}
    </div>
  )
}
