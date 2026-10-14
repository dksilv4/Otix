import { Folder, FolderPlus, Gamepad2, CheckCircle2 } from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { DkInput } from '@ui/atoms/input'

export interface SetupStepLibrariesProps {
  gamePath: string | null
  onChangePath: (path: string) => void
  onSelectPath: () => Promise<void>
  isSelecting: boolean
}

export const SetupStepLibraries = ({
  gamePath,
  onChangePath,
  onSelectPath,
  isSelecting,
}: SetupStepLibrariesProps) => {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center sm:text-left">
        <h3 className="text-xl font-bold tracking-tight text-foreground">
          Games & Media Locations
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Point Otix to your game directories so it can automatically detect installed executables, launch titles, and track play telemetry.
        </p>
      </div>

      <div className="space-y-4">
        {/* Directory Picker Pod */}
        <div className="rounded-2xl glass-inset p-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl glass-inset text-primary">
              <Folder className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-foreground">
                Primary Game Installation Directory
              </h4>
              <p className="text-xs text-muted-foreground">
                Default location for standalone installs and repacks.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            <DkInput
              type="text"
              value={gamePath || ''}
              onChange={(e) => onChangePath(e.target.value)}
              placeholder="e.g. /Applications/Games or C:\Games"
              className="text-xs font-mono flex-1"
            />
            <DkButton
              type="button"
              variant="secondary"
              size="md"
              onClick={() => void onSelectPath()}
              loading={isSelecting}
              leftIcon={FolderPlus}
              className="text-xs font-semibold shrink-0"
            >
              Browse Folder
            </DkButton>
          </div>

          {gamePath && (
            <div className="flex items-center gap-2 text-xs text-primary font-medium pt-1">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Location saved for automatic library indexing</span>
            </div>
          )}
        </div>

        {/* Auto-detected Store Fronts Note */}
        <div className="rounded-2xl glass-inset p-4.5 flex items-start gap-3.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl glass-inset text-muted-foreground mt-0.5">
            <Gamepad2 className="h-4.5 w-4.5" />
          </div>
          <div className="space-y-1 text-xs">
            <p className="font-semibold text-foreground">
              Automatic Launcher Discovery
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Supported game launchers and storefront libraries are auto-detected in standard locations without manual configuration.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
