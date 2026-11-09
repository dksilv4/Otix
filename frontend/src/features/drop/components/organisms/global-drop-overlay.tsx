import { Music, Loader2 } from 'lucide-react'
import { DkDialog } from '@/components/ui/molecules/dialog'
import { useGlobalFileDrop } from '../../hooks/use-global-file-drop'

export const GlobalDropOverlay = () => {
  const { isDraggingOver, isProcessing, progress, cancelDrop } = useGlobalFileDrop()

  const isOpen = isDraggingOver || isProcessing

  return (
    <DkDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) cancelDrop()
      }}
      title={isProcessing ? 'Importing Music' : 'Drop Music to Play'}
      description={
        isProcessing
          ? progress
            ? `Scanning tags and album art (${progress.current} of ${progress.total})`
            : 'Extracting metadata and adding tracks to your local library'
          : 'Add audio files to your local library and start playing instantly'
      }
      className="max-w-md text-center"
    >
      <div data-testid="global-drop-overlay" className="flex flex-col items-center justify-center py-4">
        {/* Clean, borderless icon pod using semantic tokens */}
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
          {isProcessing ? (
            <Loader2 className="h-8 w-8 animate-spin" />
          ) : (
            <Music className="h-8 w-8" />
          )}
        </div>

        {/* Clean format badges without decorative dots, bullets, or hard borders */}
        {!isProcessing && (
          <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2">
            {['MP3', 'FLAC', 'WAV', 'M4A', 'AAC', 'OGG', 'OPUS'].map((format) => (
              <span
                key={format}
                className="rounded-lg bg-[var(--dk-surface-raised)] px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
              >
                {format}
              </span>
            ))}
          </div>
        )}
      </div>
    </DkDialog>
  )
}
