/** On-accent label colours — mirror `:root` / `[data-theme]` `--primary-foreground`. */
const ON_ACCENT_LIGHT = 'oklch(0.98 0.016 73.684)'
const ON_ACCENT_DARK = 'oklch(0.141 0.005 285.823)'

/**
 * Pick readable text for a filled accent/primary button.
 * Mid/dark accents get light labels; very light accents get dark labels.
 */
export function onAccentForeground(color: string): string {
  const oklch = color.match(/oklch\(\s*([\d.]+)/i)
  if (oklch) {
    return parseFloat(oklch[1]) >= 0.75 ? ON_ACCENT_DARK : ON_ACCENT_LIGHT
  }

  const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    let raw = hex[1]
    if (raw.length === 3) {
      raw = raw
        .split('')
        .map((c) => c + c)
        .join('')
    }
    const n = parseInt(raw, 16)
    const r = (n >> 16) & 255
    const g = (n >> 8) & 255
    const b = n & 255
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    return lum >= 0.65 ? ON_ACCENT_DARK : ON_ACCENT_LIGHT
  }

  return ON_ACCENT_LIGHT
}

/** Apply brand accent (Settings "Accent") and its on-accent foreground. */
export function applyAccentColor(color: string) {
  const root = document.documentElement
  const foreground = onAccentForeground(color)
  root.style.setProperty('--primary', color)
  root.style.setProperty('--primary-foreground', foreground)
  root.style.setProperty('--ring', color)
  root.style.setProperty('--sidebar-primary', color)
  root.style.setProperty('--sidebar-primary-foreground', foreground)
  root.style.setProperty('--sidebar-ring', color)
}
