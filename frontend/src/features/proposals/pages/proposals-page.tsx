import { Filter } from 'lucide-react'

export function ProposalsPage() {
  return (
    <div className="p-6 min-h-full">
      <div className="flex items-center gap-4 mb-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
          <Filter className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-white">Proposals</h1>
          <p className="text-sm text-white/50 mt-0.5">
            Review and manage community edit proposals and game match proposals.
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Filter className="h-12 w-12 text-white/10 mb-4" />
        <p className="text-sm text-white/40 font-medium">No scanner plugins enabled</p>
        <p className="text-xs text-white/30 mt-1.5 max-w-sm">
          Enable a scanner plugin from the Plugins page to generate game match proposals.
        </p>
      </div>
    </div>
  )
}
