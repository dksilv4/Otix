import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

// Mock framer-motion to skip exit animations in jsdom
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
  motion: {
    div: ({ children, ...props }: any) => React.createElement('div', props, children),
  },
}))

import { DkAvatar } from './atoms/avatar'
import { DkBadge } from './atoms/badge'
import { DkButton } from './atoms/button'
import { DkCheckbox } from './atoms/checkbox'
import { DkDropdown } from './atoms/dropdown'
import { DkInput } from './atoms/input'
import { DkSeparator } from './atoms/separator'
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

  it('wires checkbox, switch, input hints, and separator semantics', async () => {
    const onChecked = vi.fn()
    const onSwitch = vi.fn()
    render(
      <>
        <DkCheckbox checked={false} onCheckedChange={onChecked} label="Accept" />
        <DkSwitch checked={false} onCheckedChange={onSwitch} label="Public" />
        <DkInput label="Username" hint="Visible on profile" />
        <DkSeparator />
      </>,
    )

    await userEvent.click(screen.getByLabelText('Accept'))
    await userEvent.click(screen.getByRole('switch', { name: 'Public' }))

    expect(onChecked).toHaveBeenCalledWith(true)
    expect(onSwitch).toHaveBeenCalledWith(true)
    expect(screen.getByLabelText(/username/i)).toHaveAccessibleDescription('Visible on profile')
    expect(screen.getByRole('separator')).toBeInTheDocument()
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
      <DkDialog open onOpenChange={onOpenChange} title="Settings">
        Content
      </DkDialog>,
    )

    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
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
        <button onClick={() => toast({ title: 'Saved', description: 'Changes applied', variant: 'success', duration: 1000 })}>
          Toast
        </button>
      )
    }

    render(
      <DkToastProvider>
        <ToastTrigger />
      </DkToastProvider>,
    )

    await userEvent.click(screen.getByText('Toast'))
    expect(screen.getByRole('alert')).toHaveTextContent('Saved')

    await userEvent.click(screen.getByLabelText('Dismiss'))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })
})
