import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PlatformIcon } from '../media-game-platform-icon'

describe('PlatformIcon', () => {
  describe('PS5 authentic console badge', () => {
    const ps5Slugs = ['ps5', 'playstation-5', 'playstation5']

    ps5Slugs.forEach((slug) => {
      it(`renders black text and white background with rounded corners for ${slug}`, () => {
        const { container } = render(<PlatformIcon slug={slug} />)
        const badge = screen.getByText('PS5')
        expect(badge).toBeInTheDocument()
        expect(badge).toHaveClass('bg-white', 'text-black', 'rounded-[3px]')
        expect(container.querySelector('svg')).toBeNull()
      })
    })
  })

  describe('PS4 authentic console badge', () => {
    const ps4Slugs = ['ps4', 'playstation-4', 'playstation4']

    ps4Slugs.forEach((slug) => {
      it(`renders white text, black background, and white borders for ${slug}`, () => {
        const { container } = render(<PlatformIcon slug={slug} />)
        const badge = screen.getByText('PS4')
        expect(badge).toBeInTheDocument()
        expect(badge).toHaveClass('bg-black', 'text-white', 'border', 'border-white', 'rounded-[3px]')
        expect(container.querySelector('svg')).toBeNull()
      })
    })
  })

  describe('PlayStation vector icons for other generations', () => {
    const playstationVectorSlugs = [
      'playstation',
      'ps1',
      'ps2',
      'ps3',
      'psp',
      'psvita',
    ]

    playstationVectorSlugs.forEach((slug) => {
      it(`renders dedicated vector icon for ${slug}`, () => {
        const { container } = render(<PlatformIcon slug={slug} />)
        const svg = container.querySelector('svg')
        expect(svg).toBeInTheDocument()
        expect(svg).toHaveClass('h-4', 'w-4', 'text-muted-foreground')
      })
    })
  })

  describe('Other gaming platforms', () => {
    const otherSlugs = [
      'switch',
      'nintendo',
      'n64',
      'gamecube',
      'snes',
      'nes',
      'gameboy',
      'gba',
      'nds',
      '3ds',
      'xbox',
      'xbox360',
      'sega',
      'genesis',
      'dreamcast',
      'steam',
      'epic',
      'gog',
      'battlenet',
      'ea',
      'ubisoft',
      'riot',
      'itch',
      'windows',
      'mac',
      'linux',
      'android',
      'ios',
      'arcade',
    ]

    otherSlugs.forEach((slug) => {
      it(`renders dedicated vector icon for ${slug}`, () => {
        const { container } = render(<PlatformIcon slug={slug} />)
        const svg = container.querySelector('svg')
        expect(svg).toBeInTheDocument()
      })
    })
  })

  it('renders gamepad fallback for unknown platform', () => {
    const { container } = render(<PlatformIcon slug="unknown-console-999" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })

  it('applies custom className to PS5 badge', () => {
    render(<PlatformIcon slug="ps5" className="h-8 px-2.5 text-xs rounded-[4px]" />)
    const badge = screen.getByText('PS5')
    expect(badge).toHaveClass('h-8', 'px-2.5', 'text-xs', 'rounded-[4px]')
  })

  it('applies custom className to PS4 badge', () => {
    render(<PlatformIcon slug="ps4" className="h-8 px-2.5 text-xs rounded-[4px]" />)
    const badge = screen.getByText('PS4')
    expect(badge).toHaveClass('h-8', 'px-2.5', 'text-xs', 'rounded-[4px]')
  })
})
