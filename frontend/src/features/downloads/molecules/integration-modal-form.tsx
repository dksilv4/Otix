import React from 'react'

export function IntegrationModalForm({
  onSubmit,
  children,
  footer,
}: {
  onSubmit: (e: React.FormEvent) => void
  children: React.ReactNode
  footer: React.ReactNode
}) {
  return (
    <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto px-4">{children}</div>
      <div className="shrink-0 px-4 pb-4 pt-3">{footer}</div>
    </form>
  )
}
