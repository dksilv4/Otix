import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SectionPrivacyToggle } from '../components/molecules/section-privacy-toggle'

describe('SectionPrivacyToggle', () => {
  it('renders a single button displaying the current privacy state (private)', () => {
    const handleChange = vi.fn()
    render(
      <SectionPrivacyToggle
        visibility="private"
        onChangeVisibility={handleChange}
      />
    )

    const button = screen.getByRole('button', { name: /section privacy: private/i })
    expect(button).toBeInTheDocument()
    expect(screen.getByText('Private')).toBeInTheDocument()
    expect(button).toHaveAttribute('title', expect.stringContaining('Private'))
  })

  it('switches from public to friends on click', () => {
    const handleChange = vi.fn()
    render(
      <SectionPrivacyToggle
        visibility="public"
        onChangeVisibility={handleChange}
      />
    )

    const button = screen.getByRole('button', { name: /section privacy: public/i })
    expect(screen.getByText('Public')).toBeInTheDocument()

    fireEvent.click(button)
    expect(handleChange).toHaveBeenCalledWith('friends')
  })

  it('switches from friends to private on click', () => {
    const handleChange = vi.fn()
    render(
      <SectionPrivacyToggle
        visibility="friends"
        onChangeVisibility={handleChange}
      />
    )

    const button = screen.getByRole('button', { name: /section privacy: friends/i })
    expect(screen.getByText('Friends')).toBeInTheDocument()

    fireEvent.click(button)
    expect(handleChange).toHaveBeenCalledWith('private')
  })

  it('switches from private to public on click', () => {
    const handleChange = vi.fn()
    render(
      <SectionPrivacyToggle
        visibility="private"
        onChangeVisibility={handleChange}
      />
    )

    const button = screen.getByRole('button', { name: /section privacy: private/i })
    fireEvent.click(button)
    expect(handleChange).toHaveBeenCalledWith('public')
  })

  it('falls back to onToggle if onChangeVisibility is not provided', () => {
    const handleToggle = vi.fn()
    render(
      <SectionPrivacyToggle
        visibility="public"
        onToggle={handleToggle}
      />
    )

    const button = screen.getByRole('button', { name: /section privacy: public/i })
    fireEvent.click(button)
    expect(handleToggle).toHaveBeenCalledTimes(1)
  })

  it('disables the button and does not trigger callback when updating', () => {
    const handleChange = vi.fn()
    render(
      <SectionPrivacyToggle
        visibility="private"
        onChangeVisibility={handleChange}
        isUpdating={true}
      />
    )

    const button = screen.getByRole('button', { name: /section privacy: private/i })
    expect(button).toBeDisabled()

    fireEvent.click(button)
    expect(handleChange).not.toHaveBeenCalled()
  })
})
