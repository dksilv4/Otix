import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AddSectionButton } from '../components/molecules/user-add-section-button'
import { ALL_PROFILE_SECTIONS } from '../../user/utils/profile-sections'

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    patch: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('AddSectionButton', () => {
  it('renders Add Section when there are missing sections', () => {
    render(
      <AddSectionButton
        currentSections={['reviews']}
        username="alice"
      />,
      { wrapper: createWrapper() }
    )

    expect(screen.getByRole('button', { name: /add section/i })).toBeInTheDocument()
  })

  it('renders Manage Sections when all sections are currently added', () => {
    const allIds = ALL_PROFILE_SECTIONS.map((s) => s.id)
    render(
      <AddSectionButton
        currentSections={allIds}
        username="alice"
      />,
      { wrapper: createWrapper() }
    )

    expect(screen.getByRole('button', { name: /manage sections/i })).toBeInTheDocument()
  })

  it('opens dropdown and allows adding a missing section', async () => {
    const handleAdd = vi.fn().mockResolvedValue(undefined)
    render(
      <AddSectionButton
        currentSections={['reviews']}
        username="alice"
        onAddSection={handleAdd}
      />,
      { wrapper: createWrapper() }
    )

    const toggleBtn = screen.getByRole('button', { name: /add section/i })
    await act(async () => {
      fireEvent.click(toggleBtn)
    })

    expect(screen.getByText('Available Sections')).toBeInTheDocument()
    const top5Btn = screen.getByText('Top 5 Favorites')
    await act(async () => {
      fireEvent.click(top5Btn)
    })

    expect(handleAdd).toHaveBeenCalledWith('top_5')
  })

  it('allows removing an active section from the dropdown list', async () => {
    const handleRemove = vi.fn().mockResolvedValue(undefined)
    render(
      <AddSectionButton
        currentSections={['reviews', 'stats']}
        username="alice"
        onRemoveSection={handleRemove}
      />,
      { wrapper: createWrapper() }
    )

    const toggleBtn = screen.getByRole('button', { name: /add section/i })
    await act(async () => {
      fireEvent.click(toggleBtn)
    })

    expect(screen.getByText(/active sections/i)).toBeInTheDocument()
    const removeBtn = screen.getByRole('button', { name: /remove reviews & ratings/i })
    await act(async () => {
      fireEvent.click(removeBtn)
    })

    expect(handleRemove).toHaveBeenCalledWith('reviews')
  })
})
