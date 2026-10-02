import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LauncherThemePreview } from '../components/molecules/launcher-theme-preview'
import { LAUNCHER_THEMES } from '@/features/launcher/themes/theme-context'

describe('LauncherThemePreview', () => {
  it('renders realistic miniature previews for all 10 launcher themes', () => {
    LAUNCHER_THEMES.forEach((theme) => {
      const { container } = render(
        <LauncherThemePreview themeId={theme.id} isSelected={false} />
      )
      expect(container.firstChild).toBeInTheDocument()
      expect(container.firstChild).toHaveClass('aspect-[16/10]')
    })
  })

  it('renders Classic theme with signature floating rail and 3D cover', () => {
    render(<LauncherThemePreview themeId="classic" />)
    expect(screen.getByText('CYBER')).toBeInTheDocument()
    expect(screen.getByText('OTIX')).toBeInTheDocument()
  })

  it('renders Modern theme with Deck tabs and Quick Resume spotlight', () => {
    render(<LauncherThemePreview themeId="modern" />)
    expect(screen.getByText('Resume')).toBeInTheDocument()
    expect(screen.getByText('Elden Ring')).toBeInTheDocument()
    expect(screen.getByText('Deck')).toBeInTheDocument()
  })

  it('renders Steam theme with Steam client tabs and Ready to Play category', () => {
    render(<LauncherThemePreview themeId="steam" />)
    expect(screen.getByText('Store')).toBeInTheDocument()
    expect(screen.getByText('Library')).toBeInTheDocument()
    expect(screen.getAllByText('Half-Life: Alyx').length).toBe(2)
    expect(screen.getByText('PLAY')).toBeInTheDocument()
  })

  it('renders PlayStation theme with CrossBar ribbon and PS5 pill', () => {
    render(<LauncherThemePreview themeId="playstation" />)
    expect(screen.getByText('PS5')).toBeInTheDocument()
    expect(screen.getByText('Horizon Forbidden West')).toBeInTheDocument()
    expect(screen.getByText('ACTIVE')).toBeInTheDocument()
  })

  it('renders Xbox theme with Blade bento grid and Gamerscore', () => {
    render(<LauncherThemePreview themeId="xbox" />)
    expect(screen.getByText('BLADE')).toBeInTheDocument()
    expect(screen.getByText('12,450 G')).toBeInTheDocument()
    expect(screen.getByText('Halo Infinite')).toBeInTheDocument()
    expect(screen.getByText('Quick Resume')).toBeInTheDocument()
  })

  it('renders Switch theme with Joy-Con styling, clock, and arcade cards', () => {
    render(<LauncherThemePreview themeId="switch" />)
    expect(screen.getByText('Online')).toBeInTheDocument()
    expect(screen.getByText('12:45')).toBeInTheDocument()
    expect(screen.getByText('Mario')).toBeInTheDocument()
  })

  it('renders Retro theme with CRT terminal and telemetry readouts', () => {
    render(<LauncherThemePreview themeId="retro" />)
    expect(screen.getByText('NETRUNNER_V7')).toBeInTheDocument()
    expect(screen.getByText(/CPU: 24%/)).toBeInTheDocument()
    expect(screen.getByText('[01] DEUS_EX')).toBeInTheDocument()
    expect(screen.getByText('RAW FEED // CAM 01')).toBeInTheDocument()
  })

  it('renders Minimal theme with Gallery Zen layout and clean typography', () => {
    render(<LauncherThemePreview themeId="minimal" />)
    expect(screen.getByText('V8 · MINIMAL')).toBeInTheDocument()
    expect(screen.getByText('01 Elden Ring')).toBeInTheDocument()
  })

  it('renders Forge theme with storefront banner and cyan accents', () => {
    render(<LauncherThemePreview themeId="forge" />)
    expect(screen.getByText('V9')).toBeInTheDocument()
    expect(screen.getByText('Storefront')).toBeInTheDocument()
    expect(screen.getByText('Cyberpunk 2077')).toBeInTheDocument()
  })

  it('renders Spatial Glass theme with frosted cards and nebula orbs', () => {
    render(<LauncherThemePreview themeId="glass" />)
    expect(screen.getByText('SPATIAL')).toBeInTheDocument()
    expect(screen.getByText('V10')).toBeInTheDocument()
    expect(screen.getByText('Starfield')).toBeInTheDocument()
  })

  it('applies glowing border and elevation when isSelected is true', () => {
    const { container } = render(<LauncherThemePreview themeId="modern" isSelected={true} />)
    expect(container.firstChild).toHaveClass('border-white/30')
  })
})
