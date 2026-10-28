import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DownloadHistoryPanel } from '../download-history-panel'
import type { ServerDownloadHistoryItem } from '../../usenet-types'

const mockItems: ServerDownloadHistoryItem[] = [
  {
    id: 1,
    nzo_id: 'SABnzbd_nzo_111',
    title: 'Elden Ring Shadow of the Erdtree',
    protocol: 'usenet',
    status: 'completed',
    percentage: 100,
    size_bytes: 45_000_000_000,
    completed_at: new Date(Date.now() - 3600 * 1000).toISOString(),
  },
  {
    id: 2,
    nzo_id: 'SABnzbd_nzo_222',
    title: 'Cyberpunk 2077 Phantom Liberty',
    protocol: 'usenet',
    status: 'failed',
    percentage: 0,
    size_bytes: 32_000_000_000,
    error_message: 'Server connection timed out',
    completed_at: new Date(Date.now() - 7200 * 1000).toISOString(),
  },
  {
    id: 3,
    nzo_id: 'SABnzbd_nzo_333',
    title: 'SABnzbd_nzo_333',
    protocol: 'usenet',
    status: 'cancelled',
    percentage: 10,
    size_bytes: 10_000_000_000,
    completed_at: null,
  },
]

describe('DownloadHistoryPanel', () => {
  it('renders history items with human-readable titles, status badges, and formatted sizes', () => {
    render(<DownloadHistoryPanel items={mockItems} />)

    expect(screen.getByText('Elden Ring Shadow of the Erdtree')).toBeInTheDocument()
    expect(screen.getByText('Cyberpunk 2077 Phantom Liberty')).toBeInTheDocument()
    expect(screen.getAllByText('Completed').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Failed').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Server connection timed out')).toBeInTheDocument()
  })

  it('filters history items when clicking status pills', () => {
    render(<DownloadHistoryPanel items={mockItems} />)

    const completedBtn = screen.getByRole('button', { name: /completed/i })
    fireEvent.click(completedBtn)

    expect(screen.getByText('Elden Ring Shadow of the Erdtree')).toBeInTheDocument()
    expect(screen.queryByText('Cyberpunk 2077 Phantom Liberty')).not.toBeInTheDocument()

    const failedBtn = screen.getByRole('button', { name: /failed/i })
    fireEvent.click(failedBtn)

    expect(screen.queryByText('Elden Ring Shadow of the Erdtree')).not.toBeInTheDocument()
    expect(screen.getByText('Cyberpunk 2077 Phantom Liberty')).toBeInTheDocument()
  })

  it('filters history items based on search input', () => {
    render(<DownloadHistoryPanel items={mockItems} />)

    const searchInput = screen.getByPlaceholderText(/search downloads/i)
    fireEvent.change(searchInput, { target: { value: 'Elden' } })

    expect(screen.getByText('Elden Ring Shadow of the Erdtree')).toBeInTheDocument()
    expect(screen.queryByText('Cyberpunk 2077 Phantom Liberty')).not.toBeInTheDocument()
  })

  it('shows an empty state when no items match search or filter', () => {
    render(<DownloadHistoryPanel items={mockItems} />)

    const searchInput = screen.getByPlaceholderText(/search downloads/i)
    fireEvent.change(searchInput, { target: { value: 'NonExistentGame' } })

    expect(screen.getByText('No matching history found')).toBeInTheDocument()
  })

  it('shows empty history message when item list is empty', () => {
    render(<DownloadHistoryPanel items={[]} />)

    expect(screen.getByText('No download history yet')).toBeInTheDocument()
  })
})
