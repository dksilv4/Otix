import { Wand2 } from 'lucide-react'
import { ProposalsPage } from '@/features/proposals/pages/proposals-page'

export const SettingsProposalsPage = () => {
  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex flex-col gap-1 pb-1">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-primary/10 text-primary">
            <Wand2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Match Proposals</h1>
            <p className="text-xs text-muted-foreground">
              Review and confirm metadata matches, suggestions, and identity candidates for your games.
            </p>
          </div>
        </div>
      </div>

      {/* Proposals Page Content */}
      <ProposalsPage />
    </div>
  )
}
