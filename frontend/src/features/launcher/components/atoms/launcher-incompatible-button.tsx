interface IncompatibleButtonProps {
  label?: string
  title?: string
}

export function IncompatibleButton({
  label = 'Incompatible OS',
  title,
}: IncompatibleButtonProps) {
  return (
    <button
      className="px-5.5 py-2.5 bg-white/8 border border-white/10 rounded-xl text-[11px] font-semibold text-white/50 cursor-not-allowed flex items-center gap-1.5"
      disabled
      title={title}
    >
      <span className="text-red-400/70">⚠</span> {label}
    </button>
  )
}
