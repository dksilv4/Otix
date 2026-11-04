import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InstallerCancelModal } from '../components/installer-cancel-modal'

describe('InstallerCancelModal Component', () => {
  it('renders confirmation text and handles confirm and close events', () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()

    render(
      <InstallerCancelModal
        onConfirm={onConfirm}
        onClose={onClose}
        isExiting={false}
      />,
    )

    expect(screen.getByText('Cancel Installation?')).toBeDefined()
    expect(screen.getByText(/Otix is not completely installed yet/i)).toBeDefined()

    // Test Continue Setup
    fireEvent.click(screen.getByRole('button', { name: 'Continue Setup' }))
    expect(onClose).toHaveBeenCalled()

    // Test Exit Installer
    fireEvent.click(screen.getByRole('button', { name: 'Exit Installer' }))
    expect(onConfirm).toHaveBeenCalled()
  })

  it('renders nothing when isExiting is true', () => {
    const { container } = render(
      <InstallerCancelModal
        onConfirm={vi.fn()}
        onClose={vi.fn()}
        isExiting={true}
      />,
    )

    expect(container.textContent).toBe('')
  })
})
