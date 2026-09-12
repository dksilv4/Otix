import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SlotRenderer } from '../slot-renderer'
import type { SlotContribution } from '../types'

const contribution = (widgets: SlotContribution['data']['widgets']): SlotContribution => ({
  pluginId: 'test-plugin',
  label: 'Test Plugin',
  data: { widgets },
})

describe('SlotRenderer', () => {
  it('renders static widgets (alert, text, badge, divider, stat, progress)', () => {
    render(
      <SlotRenderer
        contributions={[
          contribution([
            { type: 'alert', props: { title: 'Heads up', message: 'Careful now', variant: 'warn' } },
            { type: 'text', props: { content: 'Plain text', style: 'body' } },
            { type: 'badge', props: { label: 'Beta', variant: 'success', dot: true } },
            { type: 'divider', props: { label: 'Step 1' } },
            { type: 'stat', props: { label: 'Downloads', value: '42', icon: 'download' } },
            { type: 'progress', props: { label: 'Sync', value: 63 } },
          ]),
        ]}
      />,
    )

    expect(screen.getByText('Heads up')).toBeInTheDocument()
    expect(screen.getByText('Careful now')).toBeInTheDocument()
    expect(screen.getByText('Plain text')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('Step 1')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('Downloads')).toBeInTheDocument()
    expect(screen.getByText('Sync')).toBeInTheDocument()
    expect(screen.getByText('63%')).toBeInTheDocument()
  })

  it('renders list and table widgets', () => {
    render(
      <SlotRenderer
        contributions={[
          contribution([
            {
              type: 'list',
              props: {
                items: [
                  { key: 'a', title: 'First', subtitle: 'sub', badge: '1' },
                  { key: 'b', title: 'Second', actions: [{ label: 'Go', action: 'go' }] },
                ],
              },
            },
            {
              type: 'table',
              props: {
                columns: [{ key: 'name', label: 'Name' }],
                rows: [{ key: 'r1', cells: { name: 'Asterix' } }],
              },
            },
          ]),
        ]}
      />,
    )

    expect(screen.getByText('First')).toBeInTheDocument()
    expect(screen.getByText('Second')).toBeInTheDocument()
    expect(screen.getByText('Asterix')).toBeInTheDocument()
    expect(screen.getByText('Name')).toBeInTheDocument()
  })

  it('renders empty list placeholder', () => {
    render(
      <SlotRenderer
        contributions={[contribution([{ type: 'list', props: { items: [], emptyText: 'Nothing here' } }])]}
      />,
    )
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
  })

  it('renders card with children', () => {
    render(
      <SlotRenderer
        contributions={[
          contribution([
            {
              type: 'card',
              props: { title: 'Settings', padding: 'lg' },
              children: [{ type: 'text', props: { content: 'Inside card' } }],
            },
          ]),
        ]}
      />,
    )
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.getByText('Inside card')).toBeInTheDocument()
  })

  it('fires onAction from buttons', () => {
    const onAction = vi.fn()
    render(
      <SlotRenderer
        contributions={[contribution([{ type: 'button', props: { label: 'Check', action: 'check.now' } }])]}
        onAction={onAction}
      />,
    )
    fireEvent.click(screen.getByText('Check'))
    expect(onAction).toHaveBeenCalledWith('test-plugin', 'check.now', expect.anything())
  })

  it('renders the empty state when no contributions', () => {
    render(<SlotRenderer contributions={[]} />)
    expect(screen.getByText(/no widgets contributed/i)).toBeInTheDocument()
  })

  it('renders skeleton while loading', () => {
    render(<SlotRenderer contributions={[]} loading />)
    expect(document.querySelector('.animate-pulse')).not.toBeNull()
  })

  it('renders markdown content', () => {
    render(
      <SlotRenderer
        contributions={[contribution([{ type: 'markdown', props: { content: '## Title\n\nSome **bold** text' } }])]}
      />,
    )
    expect(screen.getByText('Title')).toBeInTheDocument()
    expect(screen.getByText('bold')).toBeInTheDocument()
    expect(screen.getByText(/Some/)).toBeInTheDocument()
  })
})
