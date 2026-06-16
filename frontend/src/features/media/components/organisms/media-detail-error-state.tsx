export function ErrorState({ mediaType }: { mediaType: string }) {
  const typeLabel =
    mediaType === 'movie'
      ? 'Movie'
      : mediaType === 'show'
        ? 'Show'
        : mediaType === 'music'
          ? 'Album'
          : 'Game'

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="max-w-sm space-y-3 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6 text-destructive"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01M12 3l9.66 16.5H2.34L12 3z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold">{typeLabel} Not Found</h3>
        <p className="text-sm text-muted-foreground">
          Could not load details for this {typeLabel.toLowerCase()}. It may have been removed or the ID is incorrect.
        </p>
        <a href="/" className="inline-block text-sm text-primary hover:underline">
          Go back home
        </a>
      </div>
    </div>
  )
}
