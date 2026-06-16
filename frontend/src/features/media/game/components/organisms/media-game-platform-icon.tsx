export function PlatformIcon({ slug }: { slug: string }) {
  const cls = 'h-4 w-4 text-muted-foreground shrink-0'
  const s = slug.toLowerCase()

  if (s.includes('playstation')) {
    return (
      <svg viewBox="0 0 16 16" className={cls} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 2l4 6-4 6-4-6z" />
        <circle cx="8" cy="8" r="2" />
        <path d="M5 5l6 6M11 5l-6 6" />
        <circle cx="8" cy="8" r="5" />
      </svg>
    )
  }

  if (s.includes('xbox')) {
    return (
      <svg viewBox="0 0 16 16" className={cls} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="8" cy="8" r="6" />
        <path d="M5 5l6 6M11 5l-6 6" />
      </svg>
    )
  }

  if (s.includes('nintendo') || s.includes('switch')) {
    return (
      <svg viewBox="0 0 16 16" className={cls} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.5" y="4" width="5" height="9" rx="1.5" />
        <rect x="9.5" y="4" width="5" height="9" rx="1.5" />
        <rect x="6.5" y="6" width="3" height="3" rx="0.5" />
        <circle cx="4" cy="7" r="0.75" fill="currentColor" stroke="none" />
        <circle cx="12" cy="10" r="0.75" fill="currentColor" stroke="none" />
      </svg>
    )
  }

  if (s === 'pc' || s.includes('windows')) {
    return (
      <svg viewBox="0 0 16 16" className={cls} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
        <rect x="1" y="2" width="14" height="10" rx="1" />
        <path d="M5 16h6M8 12v4" />
      </svg>
    )
  }

  if (s.includes('mac')) {
    return (
      <svg viewBox="0 0 16 16" className={cls} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
        <path d="M10 2c.5 0 1.5.5 2 1.5.5 1 .5 3 .5 5 0 3-.5 5.5-2 5.5-1 0-1.5-.5-2.5-.5s-1.5.5-2.5.5c-1.5 0-2-2.5-2-5.5 0-2 0-4 .5-5C4.5 2.5 5.5 2 6 2" />
        <path d="M9 4c0-.5 0-1.5-.5-2S7 2 7.5 3s.5 1 .5 1" />
      </svg>
    )
  }

  if (s.includes('linux')) {
    return (
      <svg viewBox="0 0 16 16" className={cls} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
        <circle cx="8" cy="8" r="6" />
        <path d="M4 6c1.5-1 4-1 5 1M12 6c-1.5-1-4-1-5 1" />
        <path d="M5 10c1 .5 2.5 0 3.5 1s2 1 2.5 0" />
        <circle cx="6.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
        <circle cx="9.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
      </svg>
    )
  }

  if (s.includes('android')) {
    return (
      <svg viewBox="0 0 16 16" className={cls} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
        <rect x="3" y="5" width="10" height="7" rx="2" />
        <circle cx="6" cy="8" r="0.75" fill="currentColor" stroke="none" />
        <circle cx="10" cy="8" r="0.75" fill="currentColor" stroke="none" />
        <path d="M6 4l-2-2M10 4l2-2" />
        <path d="M5 12v2M11 12v2M6.5 14h3" />
      </svg>
    )
  }

  if (s.includes('ios') || s.includes('iphone')) {
    return (
      <svg viewBox="0 0 16 16" className={cls} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
        <rect x="4" y="1" width="8" height="14" rx="2" />
        <circle cx="8" cy="12" r="0.75" fill="currentColor" stroke="none" />
        <path d="M7 3h2" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 16 16" className={cls} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <rect x="1" y="4" width="14" height="9" rx="3" />
      <circle cx="5" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="11" cy="8" r="1" fill="currentColor" stroke="none" />
      <path d="M3 6h2M11 6h2" />
    </svg>
  )
}
