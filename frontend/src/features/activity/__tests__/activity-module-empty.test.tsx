import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ActivityModuleEmpty } from '../components/molecules/activity-module-empty'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, onClick, className }: any) => (
    <a href={to} onClick={onClick} className={className}>
      {children}
    </a>
  ),
}))

describe('ActivityModuleEmpty', () => {
  it('renders ambient all quiet message and discovery link', () => {
    const onClose = vi.fn()
    render(<ActivityModuleEmpty onClose={onClose} />)

    expect(screen.getByText('All Quiet')).toBeInTheDocument()
    expect(
      screen.getByText(/Active games, music playback, download queues, and Plex streams/),
    ).toBeInTheDocument()

    const link = screen.getByText('Discover')
    expect(link).toBeInTheDocument()
    fireEvent.click(link)
    expect(onClose).toHaveBeenCalled()
  })
})
