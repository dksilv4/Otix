import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SectionPrivacyToggle } from '../components/molecules/section-privacy-toggle'

describe('SectionPrivacyToggle', () => {
  it('renders Public, Friends, and Private options with Private active', () => {
    const handleChange = vi.fn()
    render(
      <SectionPrivacyToggle
        visibility="private"
        onChangeVisibility={handleChange}
      />
    )

    const privateBtn = screen.getByRole('button', { name: /set section privacy to private/i })
    const friendsBtn = screen.getByRole('button', { name: /set section privacy to friends/i })
    const publicBtn = screen.getByRole('button', { name: /set section privacy to public/i })

    expect(privateBtn).toBeInTheDocument()
    expect(friendsBtn).toBeInTheDocument()
    expect(publicBtn).toBeInTheDocument()

    expect(privateBtn).toHaveAttribute('aria-pressed', 'true')
    expect(friendsBtn).toHaveAttribute('aria-pressed', 'false')
    expect(publicBtn).toHaveAttribute('aria-pressed', 'false')
  })

  it('renders Friends state as active and switches when an option is clicked', () => {
    const handleChange = vi.fn()
    render(
      <SectionPrivacyToggle
        visibility="friends"
        onChangeVisibility={handleChange}
      />
    )

    const friendsBtn = screen.getByRole('button', { name: /set section privacy to friends/i })
    expect(friendsBtn).toHaveAttribute('aria-pressed', 'true')

    const publicBtn = screen.getByRole('button', { name: /set section privacy to public/i })
    fireEvent.click(publicBtn)
    expect(handleChange).toHaveBeenCalledWith('public')

    const privateBtn = screen.getByRole('button', { name: /set section privacy to private/i })
    fireEvent.click(privateBtn)
    expect(handleChange).toHaveBeenCalledWith('private')
  })

  it('renders Public state as active', () => {
    const handleChange = vi.fn()
    render(
      <SectionPrivacyToggle
        visibility="public"
        onChangeVisibility={handleChange}
      />
    )

    const publicBtn = screen.getByRole('button', { name: /set section privacy to public/i })
    expect(publicBtn).toHaveAttribute('aria-pressed', 'true')
  })

  it('falls back to onToggle if onChangeVisibility is not provided', () => {
    const handleToggle = vi.fn()
    render(
      <SectionPrivacyToggle
        visibility="public"
        onToggle={handleToggle}
      />
    )

    const friendsBtn = screen.getByRole('button', { name: /set section privacy to friends/i })
    fireEvent.click(friendsBtn)
    expect(handleToggle).toHaveBeenCalledTimes(1)
  })

  it('disables all buttons and does not trigger callback when updating', () => {
    const handleChange = vi.fn()
    render(
      <SectionPrivacyToggle
        visibility="private"
        onChangeVisibility={handleChange}
        isUpdating={true}
      />
    )

    const privateBtn = screen.getByRole('button', { name: /set section privacy to private/i })
    const friendsBtn = screen.getByRole('button', { name: /set section privacy to friends/i })
    const publicBtn = screen.getByRole('button', { name: /set section privacy to public/i })

    expect(privateBtn).toBeDisabled()
    expect(friendsBtn).toBeDisabled()
    expect(publicBtn).toBeDisabled()

    fireEvent.click(friendsBtn)
    expect(handleChange).not.toHaveBeenCalled()
  })
})
