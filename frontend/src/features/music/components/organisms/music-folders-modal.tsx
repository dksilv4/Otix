import { Folder, FolderPlus, Trash2 } from 'lucide-react'
import { DkDialog } from '@/components/ui/molecules/dialog'
import type { StoredFolder } from '../../local/utils/local-music-db'

export interface MusicFoldersModalProps {
  open: boolean
  onClose: () => void
  folders: StoredFolder[]
  onAddFolder: () => void
  onRemoveFolder: (id: string, name: string) => void
  onClearAll: () => void
  isScanning?: boolean
}

export const MusicFoldersModal = ({
  open,
  onClose,
  folders,
  onAddFolder,
  onRemoveFolder,
  onClearAll,
  isScanning = false,
}: MusicFoldersModalProps) => {
  return (
    <DkDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose()
      }}
      title="Music Folders"
      description="Manage local directories indexed in your Otix music library."
      className="max-w-md bg-[var(--dk-surface-overlay)] border border-white/[0.04] p-5 rounded-3xl"
    >
      <div className="flex flex-col gap-4 mt-2">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onAddFolder}
            disabled={isScanning}
            className="flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <FolderPlus className="h-4 w-4" />
            <span>Add Folder</span>
          </button>

          {folders.length > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors p-1"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear All</span>
            </button>
          )}
        </div>

        {/* Folders List */}
        <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
          {folders.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground rounded-2xl bg-[var(--dk-surface-raised)] border border-white/[0.04]">
              <Folder className="h-8 w-8 stroke-[1.5] mb-2 opacity-50" />
              <p className="text-xs">No local folders indexed yet.</p>
              <p className="text-[11px] text-muted-foreground/80 mt-0.5">Click Add Folder to select your audio files.</p>
            </div>
          ) : (
            folders.map((folder) => (
              <div
                key={folder.id}
                className="flex items-center justify-between gap-3 rounded-xl p-3 bg-[var(--dk-surface-raised)] border border-white/[0.04]"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <Folder className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate text-xs font-semibold text-foreground">
                      {folder.name}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {folder.trackCount} {folder.trackCount === 1 ? 'track' : 'tracks'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onRemoveFolder(folder.id, folder.name)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-[var(--dk-surface-ghost-hover)] transition-colors"
                  aria-label={`Remove folder ${folder.name}`}
                  title="Remove folder"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </DkDialog>
  )
}
