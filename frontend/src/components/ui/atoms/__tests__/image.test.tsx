import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DkImage } from '../image'

describe('DkImage referrerPolicy behavior', () => {
  it('defaults referrerPolicy to strict-origin-when-cross-origin to prevent 403 blocks', () => {
    render(<DkImage src="https://images.igdb.com/igdb/image/upload/t_cover_big/co1r7f.jpg" alt="Test Game" />)
    const img = screen.getByRole('img', { name: 'Test Game' })
    expect(img).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
  })

  it('enforces strict-origin-when-cross-origin for Fandom/Wikia CDN images even if no-referrer is passed', () => {
    const wikiaUrl =
      'https://static.wikia.nocookie.net/hades_gamepedia_en/images/9/92/Portraits_Chronos_01.png/revision/latest?cb=20251003060243'
    render(<DkImage src={wikiaUrl} alt="Chronos" referrerPolicy="no-referrer" />)
    const img = screen.getByRole('img', { name: 'Chronos' })
    expect(img).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
  })

  it('respects explicitly provided referrerPolicy for non-Fandom origins', () => {
    render(
      <DkImage
        src="https://image.tmdb.org/t/p/w500/test.jpg"
        alt="TMDB Poster"
        referrerPolicy="origin"
      />,
    )
    const img = screen.getByRole('img', { name: 'TMDB Poster' })
    expect(img).toHaveAttribute('referrerpolicy', 'origin')
  })

  it('renders fallback when src is empty or undefined', () => {
    render(<DkImage src="" alt="Empty" fallback={<span>No Photo</span>} />)
    expect(screen.getByText('No Photo')).toBeInTheDocument()
  })
})
