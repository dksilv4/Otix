import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

// Mock framer-motion to skip exit animations in jsdom
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
  motion: {
    div: ({ children, ...props }: any) => React.createElement('div', props, children),
  },
}))

import { FilterDropdown, SearchSortBar, TYPE_OPTIONS, SORT_OPTIONS } from './search-sort-bar'

describe('FilterDropdown', () => {
  const defaultProps = {
    label: 'Type',
    options: TYPE_OPTIONS as readonly { value: string; label: string }[],
    value: '',
    onChange: vi.fn(),
  }

  it('renders the label and active option', () => {
    render(<FilterDropdown {...defaultProps} />)
    expect(screen.getByText('Type: All Types')).toBeInTheDocument()
  })

  it('renders the active value label', () => {
    render(<FilterDropdown {...defaultProps} value="movie" />)
    expect(screen.getByText('Type: Movies')).toBeInTheDocument()
  })

  it('opens dropdown on click', async () => {
    render(<FilterDropdown {...defaultProps} />)
    const button = screen.getByText('Type: All Types')
    await userEvent.click(button)
    // Options should be visible
    expect(screen.getByText('All Types')).toBeInTheDocument()
    expect(screen.getByText('Movies')).toBeInTheDocument()
    expect(screen.getByText('Shows')).toBeInTheDocument()
    expect(screen.getByText('Games')).toBeInTheDocument()
  })

  it('calls onChange when an option is clicked', async () => {
    const onChange = vi.fn()
    render(<FilterDropdown {...defaultProps} onChange={onChange} />)

    await userEvent.click(screen.getByText('Type: All Types'))
    await userEvent.click(screen.getByText('Movies'))

    expect(onChange).toHaveBeenCalledWith('movie')
  })

  it('closes dropdown after selecting an option', async () => {
    render(<FilterDropdown {...defaultProps} />)

    await userEvent.click(screen.getByText('Type: All Types'))
    await userEvent.click(screen.getByText('Movies'))

    // Dropdown panel should be gone — "Shows" is only in the dropdown, not the trigger
    expect(screen.queryByText('Shows')).not.toBeInTheDocument()
  })

  it('closes on outside click', async () => {
    render(
      <div>
        <FilterDropdown {...defaultProps} />
        <button>Outside</button>
      </div>,
    )

    await userEvent.click(screen.getByText('Type: All Types'))
    expect(screen.getByText('Movies')).toBeInTheDocument()

    await userEvent.click(screen.getByText('Outside'))
    // Dropdown should be closed — "Games" is only in the dropdown, not the trigger
    expect(screen.queryByText('Games')).not.toBeInTheDocument()
  })

  it('toggles dropdown on repeated button clicks', async () => {
    render(<FilterDropdown {...defaultProps} />)

    await userEvent.click(screen.getByText('Type: All Types'))
    expect(screen.getByText('Movies')).toBeInTheDocument()

    await userEvent.click(screen.getByText('Type: All Types'))
    expect(screen.queryByText('Shows')).not.toBeInTheDocument()
  })
})

describe('SearchSortBar', () => {
  it('renders Type and Sort dropdowns', () => {
    render(
      <SearchSortBar
        typeValue=""
        onTypeChange={vi.fn()}
        sortValue=""
        onSortChange={vi.fn()}
      />,
    )
    expect(screen.getByText('Type: All Types')).toBeInTheDocument()
    expect(screen.getByText('Sort: Relevance')).toBeInTheDocument()
  })

  it('renders active filter values', () => {
    render(
      <SearchSortBar
        typeValue="movie"
        onTypeChange={vi.fn()}
        sortValue="popularity"
        onSortChange={vi.fn()}
      />,
    )
    expect(screen.getByText('Type: Movies')).toBeInTheDocument()
    expect(screen.getByText('Sort: Popular')).toBeInTheDocument()
  })

  it('displays result count when provided', () => {
    render(
      <SearchSortBar
        typeValue=""
        onTypeChange={vi.fn()}
        sortValue=""
        onSortChange={vi.fn()}
        resultCount={42}
      />,
    )
    expect(screen.getByText('42 results')).toBeInTheDocument()
  })

  it('displays singular result count', () => {
    render(
      <SearchSortBar
        typeValue=""
        onTypeChange={vi.fn()}
        sortValue=""
        onSortChange={vi.fn()}
        resultCount={1}
      />,
    )
    expect(screen.getByText('1 result')).toBeInTheDocument()
  })

  it('does not display result count when undefined', () => {
    render(
      <SearchSortBar
        typeValue=""
        onTypeChange={vi.fn()}
        sortValue=""
        onSortChange={vi.fn()}
      />,
    )
    expect(screen.queryByText(/result/)).not.toBeInTheDocument()
  })

  it('calls onTypeChange when Type option selected', async () => {
    const onTypeChange = vi.fn()
    render(
      <SearchSortBar
        typeValue=""
        onTypeChange={onTypeChange}
        sortValue=""
        onSortChange={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByText('Type: All Types'))
    await userEvent.click(screen.getByText('Movies'))

    expect(onTypeChange).toHaveBeenCalledWith('movie')
  })

  it('calls onSortChange when Sort option selected', async () => {
    const onSortChange = vi.fn()
    render(
      <SearchSortBar
        typeValue=""
        onTypeChange={vi.fn()}
        sortValue=""
        onSortChange={onSortChange}
      />,
    )

    await userEvent.click(screen.getByText('Sort: Relevance'))
    await userEvent.click(screen.getByText('Popular'))

    expect(onSortChange).toHaveBeenCalledWith('popularity')
  })
})
