import { useState } from 'react'
import { Sun, Moon, Search, Bell, Settings, Heart } from 'lucide-react'
import { DkButton } from './atoms/button'
import { DkInput } from './atoms/input'
import { DkBadge } from './atoms/badge'
import { DkSwitch } from './atoms/switch'
import { DkCheckbox } from './atoms/checkbox'
import { DkAvatar } from './atoms/avatar'
import { DkSeparator } from './atoms/separator'
import { DkSpinner } from './atoms/spinner'
import { DkCard } from './molecules/card'
import { DkDialog } from './molecules/dialog'
import { DkTabs, DkTabList, DkTab, DkTabPanel } from './molecules/tabs'
import { DkToastProvider, useToast } from './molecules/toast'

/* ═══════════════════════════════════════════════
   DK UI — Design Language Showcase
   The single source of truth for the app's visual language.
   ═══════════════════════════════════════════════ */

// ── Section heading ──

function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-xl font-bold tracking-[-0.02em]">{title}</h2>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  )
}

// ── Swatch ──

function Swatch({ label, value, preview }: { label: string; value?: string; preview?: React.ReactNode }) {
  return (
    <div className="space-y-2">
      {preview || <div className="h-16 rounded-xl bg-[var(--dk-surface-raised)] shadow-[var(--dk-shadow-sm)]" />}
      <div>
        <p className="text-xs font-medium">{label}</p>
        {value && <p className="text-[0.625rem] text-muted-foreground font-mono">{value}</p>}
      </div>
    </div>
  )
}

// ── Theme toggle (page-specific) ──

function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>(
    () => document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
  )

  function toggle() {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('otix-theme', next)
  }

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground transition-all"
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      <span>{theme === 'light' ? 'Dark' : 'Light'}</span>
    </button>
  )
}

// ── Toast demo ──

function ToastDemo() {
  const { toast } = useToast()

  return (
    <div className="flex flex-wrap gap-2">
      <DkButton size="xs" variant="secondary" onClick={() => toast({ title: 'Default notification', description: 'This is a neutral message.', variant: 'default' })}>
        Default
      </DkButton>
      <DkButton size="xs" variant="secondary" onClick={() => toast({ title: 'Changes saved', description: 'Your settings have been updated.', variant: 'success' })}>
        Success
      </DkButton>
      <DkButton size="xs" variant="secondary" onClick={() => toast({ title: 'Something went wrong', description: 'Please try again.', variant: 'error' })}>
        Error
      </DkButton>
      <DkButton size="xs" variant="secondary" onClick={() => toast({ title: 'Heads up', description: 'This action may have side effects.', variant: 'warning' })}>
        Warning
      </DkButton>
    </div>
  )
}

// ── Dialog demo ──

function DialogDemo() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <DkButton size="xs" variant="secondary" onClick={() => setOpen(true)}>
        Open Dialog
      </DkButton>
      <DkDialog open={open} onOpenChange={setOpen} title="Delete item" description="Are you sure you want to delete this item? This action cannot be undone.">
        <div className="flex gap-3 justify-end mt-6">
          <DkButton variant="ghost" onClick={() => setOpen(false)}>Cancel</DkButton>
          <DkButton variant="destructive" onClick={() => setOpen(false)}>Delete</DkButton>
        </div>
      </DkDialog>
    </>
  )
}

/* ═══════════════════════════════════════════════
   Main Showcase Component
   ═══════════════════════════════════════════════ */

export function DkUiShowcase() {
  const [switchChecked, setSwitchChecked] = useState(true)
  const [checkboxChecked, setCheckboxChecked] = useState(true)

  return (
    <DkToastProvider>
      <div className="min-h-screen bg-[var(--dk-surface-root)]">
        {/* ── Showcase header ── */}
        <header className="sticky top-0 z-[var(--dk-z-sticky)] border-b border-border bg-[var(--dk-surface-root)]/80 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <div className="flex items-center gap-4">
              <h1 className="text-lg font-bold tracking-[-0.03em]">DK UI</h1>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[0.625rem] font-semibold text-primary">
                v1.0
              </span>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <a
                href="/"
                className="rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground transition-all"
              >
                Home →
              </a>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-6xl space-y-24 px-6 py-16">
          {/* ══════════════════════════════════════
              Design Principles
              ══════════════════════════════════════ */}
          <section className="space-y-8">
            <SectionHeading
              title="Principles"
              description="The rules that govern every visual decision in DK UI."
            />

            <div className="grid gap-4 sm:grid-cols-3">
              {[
                {
                  title: 'No Borders',
                  desc: 'Use shadow, contrast, and space to define boundaries. Borders are only for validation, focus rings, and input affordance.',
                },
                {
                  title: 'Depth Through Light',
                  desc: 'Surfaces stack with subtle contrast shifts. Elevated = lighter (or darker in dark mode). No heavy borders needed.',
                },
                {
                  title: 'Ambient Shadows',
                  desc: 'Never a single hard box-shadow. Multiple layered shadows at low opacity create soft, natural elevation.',
                },
              ].map((p) => (
                <DkCard key={p.title} elevation="sm" className="space-y-3">
                  <h3 className="text-sm font-semibold">{p.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{p.desc}</p>
                </DkCard>
              ))}
            </div>
          </section>

          {/* ══════════════════════════════════════
              Typography
              ══════════════════════════════════════ */}
          <section className="space-y-8">
            <SectionHeading
              title="Typography"
              description="System font stack. Single typeface, weight + size for hierarchy."
            />

            <div className="space-y-6">
              {[
                { label: '5xl / Extrabold', className: 'text-5xl font-extrabold tracking-tight', text: 'Heading 1' },
                { label: '4xl / Bold', className: 'text-4xl font-bold tracking-tight', text: 'Heading 2' },
                { label: '3xl / Semibold', className: 'text-3xl font-semibold tracking-tight', text: 'Heading 3' },
                { label: '2xl / Semibold', className: 'text-2xl font-semibold', text: 'Heading 4' },
                { label: 'xl / Semibold', className: 'text-xl font-semibold', text: 'Heading 5' },
                { label: 'lg / Medium', className: 'text-lg font-medium', text: 'Heading 6' },
                { label: 'base / Regular', className: 'text-base', text: 'Body text. The quick brown fox jumps over the lazy dog.' },
                { label: 'sm / Regular', className: 'text-sm', text: 'Secondary text. Used for descriptions, metadata, and supporting content.' },
                { label: 'xs / Regular', className: 'text-xs', text: 'Caption text. Timestamps, labels, and tertiary information.' },
                { label: 'xs / Uppercase tracking', className: 'text-xs font-medium uppercase tracking-widest', text: 'Overline' },
              ].map((t) => (
                <div key={t.label} className="space-y-1">
                  <p className="text-[0.625rem] text-muted-foreground font-mono uppercase tracking-wider">{t.label}</p>
                  <p className={t.className}>{t.text}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-5">
              <div>
                <p className="text-[0.625rem] text-muted-foreground font-mono mb-1">Normal 400</p>
                <p className="text-lg font-normal">The quick brown fox</p>
              </div>
              <div>
                <p className="text-[0.625rem] text-muted-foreground font-mono mb-1">Medium 500</p>
                <p className="text-lg font-medium">The quick brown fox</p>
              </div>
              <div>
                <p className="text-[0.625rem] text-muted-foreground font-mono mb-1">Semibold 600</p>
                <p className="text-lg font-semibold">The quick brown fox</p>
              </div>
              <div>
                <p className="text-[0.625rem] text-muted-foreground font-mono mb-1">Bold 700</p>
                <p className="text-lg font-bold">The quick brown fox</p>
              </div>
              <div>
                <p className="text-[0.625rem] text-muted-foreground font-mono mb-1">Extrabold 800</p>
                <p className="text-lg font-extrabold">The quick brown fox</p>
              </div>
            </div>
          </section>

          {/* ══════════════════════════════════════
              Buttons
              ══════════════════════════════════════ */}
          <section className="space-y-8">
            <SectionHeading
              title="Button"
              description="Variants, sizes, states. Hover: subtle bg shift. Active: scale(0.97). Focus: ring. Disabled: 40% opacity."
            />
            {(['primary', 'secondary', 'ghost', 'destructive', 'glass', 'outline'] as const).map((variant) => (
              <div key={variant} className="space-y-3">
                <p className="text-[0.625rem] text-muted-foreground font-mono uppercase tracking-wider">variant: {variant}</p>
                <div className="flex flex-wrap items-end gap-3">
                  {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((size) => (
                    <DkButton key={size} variant={variant} size={size}>
                      {size === 'xl' ? 'Button' : variant === 'primary' && size === 'md' ? 'Button' : variant === 'secondary' && size === 'lg' ? 'Btn' : size === 'xs' ? 'XS' : 'Button'}
                    </DkButton>
                  ))}
                  <DkButton variant={variant} size="icon">
                    <Settings className="h-4 w-4" />
                  </DkButton>
                  <DkButton variant={variant} size="md" loading>
                    Loading
                  </DkButton>
                  <DkButton variant={variant} size="md" disabled>
                    Disabled
                  </DkButton>
                </div>
              </div>
            ))}
          </section>

          {/* ══════════════════════════════════════
              Input
              ══════════════════════════════════════ */}
          <section className="space-y-8">
            <SectionHeading
              title="Input"
              description="Glass-surface inputs. Subtle ring for affordance. No hard borders on default state."
            />

            <div className="grid gap-6 sm:grid-cols-2">
              <DkInput label="Email" type="email" placeholder="you@example.com" hint="We'll never share your email." />
              <DkInput label="Username" placeholder="yourname" />
              <DkInput label="Password" type="password" value="wrong" error="Password must be at least 8 characters." />
              <DkInput label="Disabled" disabled value="Can't touch this" />
            </div>

            <div className="space-y-3">
              <p className="text-[0.625rem] text-muted-foreground font-mono uppercase tracking-wider">input with leading icon</p>
              <div className="relative max-w-sm">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <input
                  className="flex h-12 w-full rounded-xl bg-[var(--dk-surface-glass)] pl-11 pr-4 text-base backdrop-blur-md transition-all placeholder:text-muted-foreground/50 hover:bg-[var(--dk-surface-glass-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--dk-ring-color)]"
                  placeholder="Search..."
                />
              </div>
            </div>
          </section>

          {/* ══════════════════════════════════════
              Badge
              ══════════════════════════════════════ */}
          <section className="space-y-8">
            <SectionHeading
              title="Badge"
              description="Status indicators and tags. Color communicates category."
            />

            <div className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <DkBadge variant="default">Default</DkBadge>
                <DkBadge variant="secondary">Secondary</DkBadge>
                <DkBadge variant="success">Success</DkBadge>
                <DkBadge variant="warning">Warning</DkBadge>
                <DkBadge variant="destructive">Destructive</DkBadge>
                <DkBadge variant="muted">Muted</DkBadge>
                <DkBadge variant="movie">Movie</DkBadge>
                <DkBadge variant="show">TV Show</DkBadge>
                <DkBadge variant="game">Game</DkBadge>
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <DkBadge variant="default" removable onRemove={() => {}}>Removable</DkBadge>
                <DkBadge variant="success" size="sm">Small</DkBadge>
                <DkBadge variant="default" size="md">Medium</DkBadge>
                <DkBadge variant="warning" size="lg">Large</DkBadge>
              </div>
            </div>
          </section>

          {/* ══════════════════════════════════════
              Switch, Checkbox
              ══════════════════════════════════════ */}
          <section className="space-y-8">
            <SectionHeading
              title="Toggle Controls"
              description="Switch for binary on/off. Checkbox for selection."
            />

            <div className="grid gap-8 sm:grid-cols-2">
              <div className="space-y-4">
                <p className="text-[0.625rem] text-muted-foreground font-mono uppercase tracking-wider">Switch</p>
                <DkSwitch checked={switchChecked} onCheckedChange={setSwitchChecked} label="Airplane mode" />
                <DkSwitch checked={false} onCheckedChange={() => {}} disabled label="Disabled" />
              </div>

              <div className="space-y-4">
                <p className="text-[0.625rem] text-muted-foreground font-mono uppercase tracking-wider">Checkbox</p>
                <DkCheckbox checked={checkboxChecked} onCheckedChange={setCheckboxChecked} label="Accept terms" />
                <DkCheckbox checked={false} onCheckedChange={() => {}} label="Unchecked" />
                <DkCheckbox checked={false} onCheckedChange={() => {}} disabled label="Disabled" />
              </div>
            </div>
          </section>

          {/* ══════════════════════════════════════
              Avatar
              ══════════════════════════════════════ */}
          <section className="space-y-8">
            <SectionHeading
              title="Avatar"
              description="User representation. Shows image with fallback to initials."
            />

            <div className="flex items-end gap-6">
              <div className="space-y-2 text-center">
                <DkAvatar name="D K" size="sm" />
                <p className="text-[0.625rem] text-muted-foreground">sm</p>
              </div>
              <div className="space-y-2 text-center">
                <DkAvatar name="D K" size="md" />
                <p className="text-[0.625rem] text-muted-foreground">md</p>
              </div>
              <div className="space-y-2 text-center">
                <DkAvatar name="D K" size="lg" />
                <p className="text-[0.625rem] text-muted-foreground">lg</p>
              </div>
              <div className="space-y-2 text-center">
                <DkAvatar name="D K" size="xl" />
                <p className="text-[0.625rem] text-muted-foreground">xl</p>
              </div>
              <div className="space-y-2 text-center">
                <DkAvatar name="Jane Smith" size="md" />
                <p className="text-[0.625rem] text-muted-foreground">initials</p>
              </div>
              <div className="space-y-2 text-center">
                <DkAvatar name="Alex Johnson" size="md" />
                <p className="text-[0.625rem] text-muted-foreground">initials</p>
              </div>
            </div>
          </section>

          {/* ══════════════════════════════════════
              Surface Hierarchy
              ══════════════════════════════════════ */}
          <section className="space-y-8">
            <SectionHeading
              title="Surface Hierarchy"
              description="Surfaces stack through contrast and shadow — no borders. Each level is a slight brightness shift."
            />

            <div className="relative rounded-3xl bg-[var(--dk-surface-root)] p-8">
              <p className="text-[0.625rem] text-muted-foreground font-mono mb-4">Root (background)</p>

              <div className="space-y-4 ml-6">
                <div className="rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-sm)]">
                  <p className="text-[0.625rem] text-muted-foreground font-mono">Base (card default)</p>
                  <div className="mt-4 ml-6 rounded-2xl bg-[var(--dk-surface-raised)] p-6 shadow-[var(--dk-shadow-md)]">
                    <p className="text-[0.625rem] text-muted-foreground font-mono">Raised (hover card)</p>
                    <div className="mt-4 ml-6 rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-lg)]">
                      <p className="text-[0.625rem] text-muted-foreground font-mono">Overlay (dialog)</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ══════════════════════════════════════
              Elevation Scale
              ══════════════════════════════════════ */}
          <section className="space-y-8">
            <SectionHeading
              title="Elevation (Shadow) Scale"
              description="Layered, ambient shadows. Never a single hard box-shadow."
            />

            <div className="grid gap-6 sm:grid-cols-5">
              {['none', 'sm', 'md', 'lg', 'xl'].map((level) => (
                <DkCard key={level} elevation={level as any} className="flex h-32 items-center justify-center">
                  <div className="text-center space-y-1">
                    <p className="text-xs font-semibold">{level}</p>
                    <p className="text-[0.625rem] text-muted-foreground font-mono">dk-shadow-{level}</p>
                  </div>
                </DkCard>
              ))}
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <DkCard elevation="glass" className="h-32 flex items-center justify-center">
                <div className="text-center space-y-1">
                  <p className="text-xs font-semibold">glass</p>
                  <p className="text-[0.625rem] text-muted-foreground font-mono">backdrop-blur + highlight</p>
                </div>
              </DkCard>
              <DkCard elevation="glass" interactive className="h-32 flex items-center justify-center">
                <div className="text-center space-y-1">
                  <p className="text-xs font-semibold">glass + interactive</p>
                  <p className="text-[0.625rem] text-muted-foreground font-mono">hover: lift + shadow boost</p>
                </div>
              </DkCard>
            </div>
          </section>

          {/* ══════════════════════════════════════
              Cards
              ══════════════════════════════════════ */}
          <section className="space-y-8">
            <SectionHeading
              title="Card"
              description="The primary container. Elevation levels, interactive states."
            />

            <div className="grid gap-4 sm:grid-cols-3">
              <DkCard elevation="sm">
                <div className="space-y-3">
                  <div className="h-40 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                    <Heart className="h-8 w-8 text-primary/40" />
                  </div>
                  <h3 className="text-sm font-semibold">Basic Card</h3>
                  <p className="text-xs text-muted-foreground">Default elevation with subtle shadow.</p>
                </div>
              </DkCard>

              <DkCard elevation="glass" interactive>
                <div className="space-y-3">
                  <div className="h-40 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-500/5 flex items-center justify-center backdrop-blur-sm">
                    <Bell className="h-8 w-8 text-blue-500/40" />
                  </div>
                  <h3 className="text-sm font-semibold">Glass + Interactive</h3>
                  <p className="text-xs text-muted-foreground">Hover me — lifts on interaction.</p>
                </div>
              </DkCard>

              <DkCard elevation="md">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <DkAvatar name="D K" size="md" />
                    <div>
                      <p className="text-sm font-semibold">DK</p>
                      <p className="text-xs text-muted-foreground">@dk</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Cards compose well with avatar, text, and other atoms.</p>
                  <div className="flex gap-2">
                    <DkBadge variant="default">design</DkBadge>
                    <DkBadge variant="muted">system</DkBadge>
                  </div>
                </div>
              </DkCard>
            </div>
          </section>

          {/* ══════════════════════════════════════
              Tabs
              ══════════════════════════════════════ */}
          <section className="space-y-8">
            <SectionHeading
              title="Tabs"
              description="Pill-style tab switcher. Active tab has surface + shadow, no border."
            />

            <DkTabs defaultValue="tab1">
              <DkTabList>
                <DkTab value="tab1">Overview</DkTab>
                <DkTab value="tab2">Details</DkTab>
                <DkTab value="tab3">Settings</DkTab>
                <DkTab value="tab4">Activity</DkTab>
              </DkTabList>
              <DkTabPanel value="tab1">
                <p className="text-sm text-muted-foreground">Overview content — no borders, just content.</p>
              </DkTabPanel>
              <DkTabPanel value="tab2">
                <p className="text-sm text-muted-foreground">Detail view with custom content.</p>
              </DkTabPanel>
              <DkTabPanel value="tab3">
                <DkSwitch checked label="Notifications" onCheckedChange={() => {}} />
              </DkTabPanel>
              <DkTabPanel value="tab4">
                <p className="text-sm text-muted-foreground">Activity feed goes here.</p>
              </DkTabPanel>
            </DkTabs>
          </section>

          {/* ══════════════════════════════════════
              Separator
              ══════════════════════════════════════ */}
          <section className="space-y-8">
            <SectionHeading
              title="Separator"
              description="Subtle 1px line with low opacity. Optional label. Used sparingly — prefer space for separation."
            />

            <div className="max-w-sm space-y-6">
              <DkSeparator />
              <DkSeparator label="or" />
              <div className="space-y-3 rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-sm)]">
                <p className="text-sm">Item above</p>
                <DkSeparator />
                <p className="text-sm">Item below</p>
              </div>
            </div>
          </section>

          {/* ══════════════════════════════════════
              Dialog
              ══════════════════════════════════════ */}
          <section className="space-y-8">
            <SectionHeading
              title="Dialog"
              description="Modal overlay with backdrop blur. Enter/exit animations. Esc to close."
            />

            <DialogDemo />
          </section>

          {/* ══════════════════════════════════════
              Toast
              ══════════════════════════════════════ */}
          <section className="space-y-8">
            <SectionHeading
              title="Toast"
              description="Non-blocking notifications. Auto-dismiss after 4s. Stack from bottom-right."
            />

            <ToastDemo />
          </section>

          {/* ══════════════════════════════════════
              Spinner
              ══════════════════════════════════════ */}
          <section className="space-y-8">
            <SectionHeading
              title="Spinner"
              description="Loading indicator. Sizes via Tailwind classes."
            />

            <div className="flex items-end gap-8">
              <div className="text-center space-y-2">
                <DkSpinner className="h-4 w-4" />
                <p className="text-[0.625rem] text-muted-foreground">h-4</p>
              </div>
              <div className="text-center space-y-2">
                <DkSpinner className="h-6 w-6" />
                <p className="text-[0.625rem] text-muted-foreground">h-6</p>
              </div>
              <div className="text-center space-y-2">
                <DkSpinner className="h-8 w-8" />
                <p className="text-[0.625rem] text-muted-foreground">h-8</p>
              </div>
              <div className="text-center space-y-2">
                <DkSpinner className="h-12 w-12" />
                <p className="text-[0.625rem] text-muted-foreground">h-12</p>
              </div>
            </div>
          </section>

          {/* ══════════════════════════════════════
              Colors
              ══════════════════════════════════════ */}
          <section className="space-y-8">
            <SectionHeading
              title="Color Palette"
              description="Semantic color tokens. All colors adapt to light/dark theme."
            />

            <div className="grid gap-4 sm:grid-cols-4">
              <Swatch label="Background" value="--background" preview={<div className="h-12 rounded-xl bg-background shadow-[var(--dk-shadow-sm)] ring-1 ring-inset ring-[var(--dk-separator)]" />} />
              <Swatch label="Foreground" value="--foreground" preview={<div className="h-12 rounded-xl bg-foreground" />} />
              <Swatch label="Primary" value="--primary" preview={<div className="h-12 rounded-xl bg-primary" />} />
              <Swatch label="Secondary" value="--secondary" preview={<div className="h-12 rounded-xl bg-secondary ring-1 ring-inset ring-[var(--dk-separator)]" />} />
              <Swatch label="Muted" value="--muted" preview={<div className="h-12 rounded-xl bg-muted ring-1 ring-inset ring-[var(--dk-separator)]" />} />
              <Swatch label="Card" value="--card" preview={<div className="h-12 rounded-xl bg-card shadow-[var(--dk-shadow-sm)]" />} />
              <Swatch label="Destructive" value="--destructive" preview={<div className="h-12 rounded-xl bg-destructive" />} />
              <Swatch label="Border" value="--border" preview={<div className="h-12 rounded-xl bg-border" />} />
              <Swatch label="Movie" value="--media-movie" preview={<div className="h-12 rounded-xl bg-media-movie" />} />
              <Swatch label="Show" value="--media-show" preview={<div className="h-12 rounded-xl bg-media-show" />} />
              <Swatch label="Game" value="--media-game" preview={<div className="h-12 rounded-xl bg-media-game" />} />
              <Swatch label="Ring" value="--dk-ring-color" preview={<div className="h-12 rounded-xl bg-[var(--dk-ring-color)]" />} />
            </div>
          </section>

          {/* ══════════════════════════════════════
              Radius
              ══════════════════════════════════════ */}
          <section className="space-y-8">
            <SectionHeading
              title="Radius Scale"
              description="Consistent rounding. Larger radius = friendlier, smaller = precise."
            />

            <div className="grid grid-cols-4 sm:grid-cols-7 gap-3">
              {['sm', 'md', 'lg', 'xl', '2xl', '3xl', 'full'].map((r) => (
                <div key={r} className="text-center space-y-2">
                  <div
                    className="mx-auto h-12 w-12 bg-primary shadow-[var(--dk-shadow-sm)]"
                    style={{ borderRadius: r === 'full' ? '9999px' : `var(--dk-radius-${r})` }}
                  />
                  <p className="text-[0.625rem] text-muted-foreground font-mono">dk-radius-{r}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ══════════════════════════════════════
              Spacing
              ══════════════════════════════════════ */}
          <section className="space-y-8">
            <SectionHeading
              title="Spacing Reference"
              description="Tailwind spacing scale. Consistent rhythm, 8px base grid."
            />

            <div className="space-y-2">
              {[
                { name: 'p-1 / m-1', px: 4 },
                { name: 'p-2 / m-2', px: 8 },
                { name: 'p-3 / m-3', px: 12 },
                { name: 'p-4 / m-4', px: 16 },
                { name: 'p-6 / m-6', px: 24 },
                { name: 'p-8 / m-8', px: 32 },
                { name: 'p-12 / m-12', px: 48 },
                { name: 'p-16 / m-16', px: 64 },
              ].map((s) => (
                <div key={s.name} className="flex items-center gap-4">
                  <span className="w-24 shrink-0 text-[0.625rem] text-muted-foreground font-mono">{s.name}</span>
                  <div className="h-3 rounded-sm bg-primary/20" style={{ width: s.px }} />
                  <span className="text-[0.625rem] text-muted-foreground font-mono">{s.px}px</span>
                </div>
              ))}
            </div>
          </section>

          {/* ══════════════════════════════════════
              Z-Index
              ══════════════════════════════════════ */}
          <section className="space-y-8">
            <SectionHeading
              title="Z-Index Scale"
              description="Layering system. Higher number = closer to viewer."
            />

            <div className="space-y-2 max-w-sm">
              {[
                { name: 'base', value: 0 },
                { name: 'raised', value: 10 },
                { name: 'dropdown', value: 100 },
                { name: 'sticky', value: 200 },
                { name: 'overlay', value: 300 },
                { name: 'modal', value: 400 },
                { name: 'toast', value: 500 },
              ].map((z) => (
                <div key={z.name} className="flex items-center gap-4">
                  <span className="w-24 shrink-0 text-[0.625rem] text-muted-foreground font-mono">z-{z.name}</span>
                  <div className="flex-1 h-5 rounded-sm bg-primary/20" style={{ opacity: z.value / 500 }} />
                  <span className="text-[0.625rem] text-muted-foreground font-mono w-8 text-right">{z.value}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ══════════════════════════════════════
              Animation
              ══════════════════════════════════════ */}
          <section className="space-y-8">
            <SectionHeading
              title="Animation Tokens"
              description="Consistent timing and easing. Respects prefers-reduced-motion."
            />

            <div className="grid gap-4 sm:grid-cols-2 max-w-sm">
              {[
                { label: 'Fast', var: '--dk-duration-fast', val: '150ms' },
                { label: 'Normal', var: '--dk-duration-normal', val: '200ms' },
                { label: 'Slow', var: '--dk-duration-slow', val: '300ms' },
                { label: 'Page', var: '--dk-duration-page', val: '500ms' },
              ].map((d) => (
                <div key={d.label} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 rounded-full bg-primary"
                      style={{
                        width: parseInt(d.val) / 5,
                        transition: `width var(${d.var}) var(--dk-ease-out)`,
                      }}
                    />
                  </div>
                  <p className="text-[0.625rem] text-muted-foreground font-mono">{d.label} · {d.var} · {d.val}</p>
                </div>
              ))}
            </div>

            <div className="max-w-sm space-y-2">
              <p className="text-[0.625rem] text-muted-foreground font-mono uppercase tracking-wider">Easing</p>
              {['ease-out', 'ease-in-out', 'ease-spring'].map((e) => (
                <div key={e} className="flex items-center gap-4">
                  <span className="w-28 shrink-0 text-[0.625rem] text-muted-foreground font-mono">dk-{e}</span>
                  <span className="text-[0.625rem] text-muted-foreground">
                    {e === 'ease-out' && 'cubic-bezier(0.16, 1, 0.3, 1)'}
                    {e === 'ease-in-out' && 'cubic-bezier(0.4, 0, 0.2, 1)'}
                    {e === 'ease-spring' && 'cubic-bezier(0.34, 1.56, 0.64, 1)'}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* ══════════════════════════════════════
              Border vs Borderless
              ══════════════════════════════════════ */}
          <section className="space-y-8">
            <SectionHeading
              title="Rule 1: No Borders"
              description="Side-by-side comparison. The border-free approach uses shadow, contrast, and space instead."
            />

            <div className="grid gap-8 sm:grid-cols-2">
              {/* Border approach */}
              <div className="space-y-3">
                <p className="text-xs text-destructive font-medium">Border-based (avoid)</p>
                <div className="space-y-4 rounded-2xl border border-border p-6">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-lg border border-border p-3 text-sm">
                      Item {i + 1} — separated by borders
                    </div>
                  ))}
                </div>
              </div>

              {/* Borderless approach */}
              <div className="space-y-3">
                <p className="text-xs text-green-500 font-medium">Shadow + contrast (preferred)</p>
                <div className="space-y-3 rounded-2xl bg-muted/30 p-6">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-lg bg-[var(--dk-surface-base)] p-3 text-sm shadow-[var(--dk-shadow-sm)]">
                      Item {i + 1} — separated by surface contrast + shadow
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </DkToastProvider>
  )
}
