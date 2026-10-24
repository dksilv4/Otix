import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScannedFilesSummary } from '../components/molecules/scanned-files-summary'
import type { ScannedFilesSummaryData } from '../utils/scanned-summary'

describe('ScannedFilesSummary', () => {
  const mockSummary: ScannedFilesSummaryData = {
    totalCount: 15,
    organizedCount: 12,
    unorganizedCount: 3,
    matchedCount: 14,
    isoCount: 5,
    installedCount: 10,
    organizedPercentage: 80,
    lastScannedAt: new Date().toISOString(),
  }

  it('renders summary stats correctly when files are present', () => {
    render(<ScannedFilesSummary summary={mockSummary} />)

    expect(screen.getByText('Scanned Files Summary')).toBeInTheDocument()
    expect(screen.getByText('15 files')).toBeInTheDocument()
    expect(screen.getByText('Total Files')).toBeInTheDocument()
    expect(screen.getByText('15')).toBeInTheDocument()
    expect(screen.getByText('Organized')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('Pending Organize')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Metadata Matched')).toBeInTheDocument()
    expect(screen.getByText('14')).toBeInTheDocument()
    expect(screen.getByText('80% Organized')).toBeInTheDocument()
  })

  it('renders empty state when total files is 0', () => {
    const emptySummary: ScannedFilesSummaryData = {
      totalCount: 0,
      organizedCount: 0,
      unorganizedCount: 0,
      matchedCount: 0,
      isoCount: 0,
      installedCount: 0,
      organizedPercentage: 0,
    }

    render(<ScannedFilesSummary summary={emptySummary} />)

    expect(screen.getByText('No files scanned yet')).toBeInTheDocument()
    expect(
      screen.getByText(/Configure scan folders below and click Scan Now/i),
    ).toBeInTheDocument()
  })

  it('calls onOrganizeClick when Organize Rules button is clicked', async () => {
    const user = userEvent.setup()
    const onOrganizeClick = vi.fn()

    render(
      <ScannedFilesSummary
        summary={mockSummary}
        onOrganizeClick={onOrganizeClick}
      />,
    )

    const organizeBtn = screen.getByRole('button', { name: /organize rules/i })
    await user.click(organizeBtn)

    expect(onOrganizeClick).toHaveBeenCalledTimes(1)
  })

  it('calls onRescanClick when Rescan button is clicked', async () => {
    const user = userEvent.setup()
    const onRescanClick = vi.fn()

    render(
      <ScannedFilesSummary
        summary={mockSummary}
        onRescanClick={onRescanClick}
      />,
    )

    const rescanBtn = screen.getByRole('button', { name: /rescan/i })
    await user.click(rescanBtn)

    expect(onRescanClick).toHaveBeenCalledTimes(1)
  })
})
