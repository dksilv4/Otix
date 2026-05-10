import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PasswordStrengthBar } from './atoms/password-strength-bar'
import { PasswordField } from './molecules/password-field'
import { calculatePasswordStrength, getStrengthTier, getTierLabel } from './utils'

describe('auth password utilities', () => {
  it('scores passwords by length and character variety', () => {
    expect(calculatePasswordStrength('')).toBe(0)
    expect(calculatePasswordStrength('abcdefgh')).toBe(35)
    expect(calculatePasswordStrength('Abcdefgh1!')).toBe(75)
    expect(calculatePasswordStrength('Abcdefghijklmnop1!')).toBe(100)
  })

  it('maps scores into user-facing tiers', () => {
    expect(getStrengthTier(0)).toBe('weak')
    expect(getStrengthTier(30)).toBe('fair')
    expect(getStrengthTier(60)).toBe('good')
    expect(getStrengthTier(80)).toBe('strong')
    expect(getTierLabel('strong')).toBe('Strong')
  })
})

describe('PasswordStrengthBar', () => {
  it('does not render for an empty password', () => {
    const { container } = render(<PasswordStrengthBar password="" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the calculated strength label', () => {
    render(<PasswordStrengthBar password="Abcdefghijklmnop1!" />)
    expect(screen.getByText('Strong')).toBeInTheDocument()
  })
})

describe('PasswordField', () => {
  it('updates value, toggles visibility, and wires error accessibility', async () => {
    const onChange = vi.fn()
    function Harness() {
      const [value, setValue] = useState('secret')
      return (
        <PasswordField
          id="password"
          label="Password"
          value={value}
          onChange={(next) => {
            setValue(next)
            onChange(next)
          }}
          error="Too short"
        />
      )
    }

    render(<Harness />)

    const input = screen.getByLabelText('Password')
    expect(input).toHaveAttribute('type', 'password')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Too short')

    await userEvent.click(screen.getByLabelText('Show password'))
    expect(input).toHaveAttribute('type', 'text')

    await userEvent.clear(input)
    await userEvent.type(input, 'new-secret')
    expect(onChange).toHaveBeenCalledWith('new-secret')
  })
})
