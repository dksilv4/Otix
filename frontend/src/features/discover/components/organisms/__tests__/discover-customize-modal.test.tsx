import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DiscoverCustomizeModal } from '../discover-customize-modal'
import { DEFAULT_DISCOVER_SECTIONS } from '../../../utils/sections'

describe('DiscoverCustomizeModal', () => {
  const defaultSections = DEFAULT_DISCOVER_SECTIONS.map((s) => ({
    id: s.id,
    enabled: s.defaultEnabled,
  }))

  it('renders modal when open is true', () => {
    render(
      <DiscoverCustomizeModal
        open={true}
        onOpenChange={vi.fn()}
        sections={defaultSections}
        onToggleSection={vi.fn()}
        onMoveSection={vi.fn()}
        onApplyPreset={vi.fn()}
        onResetToDefault={vi.fn()}
      />,
    )

    expect(screen.getByText('Customize Discover Feed')).toBeInTheDocument()
    expect(screen.getByText('Spotlight Showcase')).toBeInTheDocument()
    expect(screen.getByText('Trending Movies')).toBeInTheDocument()
    expect(screen.getByText('Free Games & Deals')).toBeInTheDocument()
  })

  it('calls onToggleSection when switch is clicked', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()

    render(
      <DiscoverCustomizeModal
        open={true}
        onOpenChange={vi.fn()}
        sections={defaultSections}
        onToggleSection={onToggle}
        onMoveSection={vi.fn()}
        onApplyPreset={vi.fn()}
        onResetToDefault={vi.fn()}
      />,
    )

    const switches = screen.getAllByRole('switch')
    // First switch is spotlight showcase
    await user.click(switches[0])
    expect(onToggle).toHaveBeenCalledWith('fan_spotlight')
  })

  it('calls onApplyPreset when preset button is clicked', async () => {
    const onApplyPreset = vi.fn()
    const user = userEvent.setup()

    render(
      <DiscoverCustomizeModal
        open={true}
        onOpenChange={vi.fn()}
        sections={defaultSections}
        onToggleSection={vi.fn()}
        onMoveSection={vi.fn()}
        onApplyPreset={onApplyPreset}
        onResetToDefault={vi.fn()}
      />,
    )

    const gamerBtn = screen.getByText('Gamer Hub')
    await user.click(gamerBtn)
    expect(onApplyPreset).toHaveBeenCalledWith('gaming')
  })

  it('calls onResetToDefault when Reset button is clicked', async () => {
    const onReset = vi.fn()
    const user = userEvent.setup()

    render(
      <DiscoverCustomizeModal
        open={true}
        onOpenChange={vi.fn()}
        sections={defaultSections}
        onToggleSection={vi.fn()}
        onMoveSection={vi.fn()}
        onApplyPreset={vi.fn()}
        onResetToDefault={onReset}
      />,
    )

    const resetBtn = screen.getByText('Reset to Default')
    await user.click(resetBtn)
    expect(onReset).toHaveBeenCalled()
  })
})
