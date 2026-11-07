import type { useIntegrationsPageState } from '../../../hooks/use-integrations-page-state'

export const GoogleDriveCardContent = ({ state }: { state: ReturnType<typeof useIntegrationsPageState> }) => {
  return (
    <>
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 bg-[var(--dk-surface-ghost)] text-xs text-muted-foreground">
            <span>
              {state.googleEmail ? (
                <>Connected account: <span className="text-foreground font-medium">{state.googleEmail}</span></>
              ) : (
                'Backs up your game saves to a dedicated folder in your Google Drive.'
              )}
            </span>
          </div>
          {state.driveMessage && <p className="px-5 py-2 text-xs text-green-400">{state.driveMessage}</p>}
          {state.driveError && <p className="px-5 py-2 text-xs text-red-400">{state.driveError}</p>}
        </>
  )
}
