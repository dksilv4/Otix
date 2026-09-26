// TODO: Review this file
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

// Mock framer-motion to skip exit animations in jsdom
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
  motion: {
    div: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => React.createElement('div', props, children),
  },
}))

import { DkAvatar } from './atoms/avatar'
import { DkBadge } from './atoms/badge'
import { DkButton } from './atoms/button'
import { DkCheckbox } from './atoms/checkbox'
import { DkDropdown } from './atoms/dropdown'
import { DkInput } from './atoms/input'
import { DkSwitch } from './atoms/switch'
import { DkDialog } from './molecules/dialog'
import { DkTab, DkTabList, DkTabPanel, DkTabs } from './molecules/tabs'
import { DkToastProvider, useToast } from './molecules/toast'

describe('dk-ui atoms', () => {
  it('renders avatar initials and falls back when image loading fails', () => {
    render(<DkAvatar src="/missing.jpg" name="Ada Lovelace" />)
    fireEvent.error(screen.getByAltText('Ada Lovelace'))
    expect(screen.getByLabelText('Ada Lovelace')).toHaveTextContent('AL')
  })

  it('supports removable badges and loading buttons', async () => {
    const onRemove = vi.fn()
    render(
      <>
        <DkBadge removable onRemove={onRemove}>Filter</DkBadge>
        <DkButton loading>Save</DkButton>
      </>,
    )

    await userEvent.click(screen.getByLabelText('Remove'))
    expect(onRemove).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })

  it('wires checkbox, switch, and input hints', async () => {
    const onChecked = vi.fn()
    const onSwitch = vi.fn()
    render(
      <>
        <DkCheckbox checked={false} onCheckedChange={onChecked} label="Accept" />
        <DkSwitch checked={false} onCheckedChange={onSwitch} label="Public" />
        <DkInput label="Username" hint="Visible on profile" />
      </>,
    )

    await userEvent.click(screen.getByLabelText('Accept'))
    await userEvent.click(screen.getByRole('switch', { name: 'Public' }))

    expect(onChecked).toHaveBeenCalledWith(true)
    expect(onSwitch).toHaveBeenCalledWith(true)
    expect(screen.getByLabelText(/username/i)).toHaveAccessibleDescription('Visible on profile')
  })

  it('opens dropdowns, selects values, and closes on outside click', async () => {
    const onChange = vi.fn()
    render(
      <div>
        <DkDropdown
          value=""
          onChange={onChange}
          options={[
            { value: 'movie', label: 'Movie' },
            { value: 'show', label: 'Show' },
          ]}
        />
        <button>Outside</button>
      </div>,
    )

    await userEvent.click(screen.getByText('Select...'))
    expect(screen.getByText('Movie')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Show'))
    expect(onChange).toHaveBeenCalledWith('show')
    expect(screen.queryByText('Movie')).not.toBeInTheDocument()

    await userEvent.click(screen.getByText('Select...'))
    await userEvent.click(screen.getByText('Outside'))
    expect(screen.queryByText('Movie')).not.toBeInTheDocument()
  })

  it('renders filter variant with label prefix and glass styling', async () => {
    const onChange = vi.fn()
    render(
      <DkDropdown
        variant="filter"
        label="Type"
        options={[
          { value: '', label: 'All Types' },
          { value: 'movie', label: 'Movies' },
        ]}
        value=""
        onChange={onChange}
      />,
    )

    expect(screen.getByText('Type: All Types')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Type: All Types'))
    expect(screen.getByText('Movies')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Movies'))
    expect(onChange).toHaveBeenCalledWith('movie')
    expect(screen.queryByText('All Types')).not.toBeInTheDocument()
  })
})

describe('dk-ui molecules', () => {
  it('renders tabs and switches active panels', async () => {
    render(
      <DkTabs defaultValue="one">
        <DkTabList>
          <DkTab value="one">One</DkTab>
          <DkTab value="two">Two</DkTab>
        </DkTabList>
        <DkTabPanel value="one">First panel</DkTabPanel>
        <DkTabPanel value="two">Second panel</DkTabPanel>
      </DkTabs>,
    )

    expect(screen.getByText('First panel')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Two' }))
    expect(screen.getByText('Second panel')).toBeInTheDocument()
    expect(screen.queryByText('First panel')).not.toBeInTheDocument()
  })

  it('closes dialogs from escape, overlay, and close button', async () => {
    const onOpenChange = vi.fn()
    const { rerender } = render(
      <DkDialog open onOpenChange={onOpenChange} title="Settings" description="Some Description">
        Content
      </DkDialog>,
    )

    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByText('Some Description')).toBeInTheDocument()

    // Test overlay click (dialog uses createPortal → in document.body, not container)
    const overlay = document.querySelector('.bg-black\\/75')
    expect(overlay).toBeInTheDocument()
    await userEvent.click(overlay!)
    expect(onOpenChange).toHaveBeenCalledWith(false)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)

    rerender(
      <DkDialog open onOpenChange={onOpenChange}>
        Content
      </DkDialog>,
    )
    await userEvent.click(screen.getByLabelText('Close dialog'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('shows and dismisses toasts', async () => {
    function ToastTrigger() {
      const { toast } = useToast()
      return (
        <div className="flex gap-2">
          <button onClick={() => toast({ title: 'Saved', description: 'Changes applied', variant: 'success', duration: 1000 })}>
            Toast Success
          </button>
          <button onClick={() => toast({ title: 'Warning Msg', variant: 'warning' })}>
            Toast Warning
          </button>
          <button onClick={() => toast({ title: 'Error Msg', variant: 'error' })}>
            Toast Error
          </button>
          <button onClick={() => toast({ title: 'Info Msg', variant: 'info' })}>
            Toast Info
          </button>
          <button onClick={() => toast({ title: 'Default Msg', variant: 'default' })}>
            Toast Default
          </button>
          <button onClick={() => toast({ title: 'No Variant Msg' })}>
            Toast No Variant
          </button>
          <button onClick={() => toast({ title: 'Destructive Msg', variant: 'destructive' })}>
            Toast Destructive
          </button>
          <button onClick={() => toast({ title: 'Unknown Msg', variant: 'custom-unknown' as never })}>
            Toast Unknown
          </button>
        </div>
      )
    }

    render(
      <DkToastProvider>
        <ToastTrigger />
      </DkToastProvider>,
    )

    await userEvent.click(screen.getByText('Toast Success'))
    expect(screen.getByRole('alert')).toHaveTextContent('Saved')
    await userEvent.click(screen.getByLabelText('Dismiss'))
    await waitFor(() => expect(screen.queryByText('Saved')).not.toBeInTheDocument())

    // Click warning
    await userEvent.click(screen.getByText('Toast Warning'))
    expect(screen.getByText('Warning Msg')).toBeInTheDocument()

    // Click error
    await userEvent.click(screen.getByText('Toast Error'))
    expect(screen.getByText('Error Msg')).toBeInTheDocument()

    // Click info
    await userEvent.click(screen.getByText('Toast Info'))
    expect(screen.getByText('Info Msg')).toBeInTheDocument()

    // Click default
    await userEvent.click(screen.getByText('Toast Default'))
    expect(screen.getByText('Default Msg')).toBeInTheDocument()

    // Click omitted variant - should not crash and render safely
    await userEvent.click(screen.getByText('Toast No Variant'))
    expect(screen.getByText('No Variant Msg')).toBeInTheDocument()

    // Click destructive variant - should not crash and render safely
    await userEvent.click(screen.getByText('Toast Destructive'))
    expect(screen.getByText('Destructive Msg')).toBeInTheDocument()

    // Click unknown variant - should not crash and fallback safely
    await userEvent.click(screen.getByText('Toast Unknown'))
    expect(screen.getByText('Unknown Msg')).toBeInTheDocument()
  })

  it('throws error when useToast is used outside provider', () => {
    const TestComponent = () => {
      useToast()
      return null
    }
    // Suppress console error logs for expected errors
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<TestComponent />)).toThrow('useToast must be inside DkToastProvider')
    spy.mockRestore()
  })
})
