import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'

import { MediaLogo } from '../media-logo'

function renderLogo(props: Parameters<typeof MediaLogo>[0]) {
  const { container } = render(<MediaLogo {...props} />)
  return container.querySelector('img') as HTMLImageElement
}

describe('MediaLogo', () => {
  it('renders the logo src and alt', () => {
    const img = renderLogo({ src: 'https://img/logo.png', alt: 'The Invite' })
    expect(img.src).toBe('https://img/logo.png')
    expect(img.alt).toBe('The Invite')
  })

  it('inverts a black logo on a dark theme by default (no provider → dark)', () => {
    const img = renderLogo({ src: 'https://img/black.png', colorGuess: 'guess_black' })
    expect(img.style.filter).toBe('invert(1) drop-shadow(0 2px 8px rgba(0,0,0,0.5))')
  })

  it('inverts a black logo on an always-dark scrim regardless of viewer theme', () => {
    const img = renderLogo({
      src: 'https://img/black.png',
      colorGuess: 'guess_black',
      background: 'dark',
    })
    expect(img.style.filter).toContain('invert(1)')
  })

  it('supports an explicit theme override', () => {
    const img = renderLogo({
      src: 'https://img/white.png',
      colorGuess: 'guess_white',
      background: 'theme',
      theme: 'light',
    })
    expect(img.style.filter).toContain('invert(1)')
  })

  it('skips contrast logic with background="none"', () => {
    const img = renderLogo({
      src: 'https://img/black.png',
      colorGuess: 'guess_black',
      background: 'none',
    })
    expect(img.style.filter).toBe('drop-shadow(0 2px 8px rgba(0,0,0,0.5))')
  })

  it('keeps a custom base shadow and inverts before it', () => {
    const img = renderLogo({
      src: 'https://img/black.png',
      colorGuess: 'guess_black',
      background: 'dark',
      shadow: 'drop-shadow(0 6px 20px rgba(0,0,0,0.85))',
    })
    expect(img.style.filter).toBe('invert(1) drop-shadow(0 6px 20px rgba(0,0,0,0.85))')
  })
})
