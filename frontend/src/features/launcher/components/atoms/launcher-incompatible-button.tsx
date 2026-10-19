interface IncompatibleButtonProps {
  label?: string
  title?: string
}

export const IncompatibleButton = ({
  label = 'Incompatible OS',
  title,
}: IncompatibleButtonProps) => {
  return (
    <button
      className="px-5.5 py-2.5 bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)] rounded-xl text-[11px] font-semibold text-muted-foreground cursor-not-allowed flex items-center gap-1.5"
      disabled
      title={title}
    >
      <span className="text-destructive/70">⚠</span> {label}
    </button>
  )
};
