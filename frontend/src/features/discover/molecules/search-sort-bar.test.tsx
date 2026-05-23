import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

// Mock framer-motion to skip exit animations in jsdom
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
  motion: {
    div: ({ children, ...props }: any) => React.createElement('div', props, children),
  },
}))

import { SearchSortBar } from './search-sort-bar'

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
