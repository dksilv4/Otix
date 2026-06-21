export function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-5">
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="text-xs text-white/60 mt-0.5">{description}</p>
    </div>
  )
}
